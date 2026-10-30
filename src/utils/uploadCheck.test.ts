import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runUploadCheckPipeline,
  comparePersonNames,
  computeUploadTrustTier,
  verifyIdentity,
  extractIdentityFromText,
  isValidCandidatePersonName,
  fixMojibake,
  normalizeIdentityText,
  UPLOAD_CHECK_TEST_SCENARIOS,
} from './uploadCheck';
import { getSkillStatus, getUnconfirmedEvidenceForSkill } from './evidenceModel';
import type { Profile, AttachmentItem, EvidenceItem } from '../types';

const demoProfile: Profile = {
  id: 1,
  user_id: 1,
  name: 'Arjun Mehta',
  title: 'Senior Full-Stack Engineer',
  role: 'Job seeker',
  location: 'Bengaluru / Remote',
  education: 'B.Tech Computer Science, IIT Madras',
  skills_text: 'React, TypeScript, Node.js, SQL, Docker, AWS, Git, Unit Testing',
  resume_text: `Arjun Mehta
Senior Full-Stack Engineer | Bengaluru / Remote | arjun.mehta@example.com
SUMMARY:
Full-stack engineer with 4+ years building distributed TypeScript/React frontends and high-throughput Node.js & PostgreSQL cloud services.
EXPERIENCE & PROJECTS:
1. Cloud-Native Realtime Telemetry Platform at CloudScale Systems (2023 - Present)
SKILLS:
React, TypeScript, Node.js, SQL, Docker, AWS, System Design, REST APIs, Git, Unit Testing, CI/CD`,
};

const referenceDate = new Date('2026-10-26T00:00:00Z');

test('Test 1: Résumé uploaded as Certificate triggers blocking CATEGORY_MISMATCH with confidence >= 0.7', () => {
  const scenario = UPLOAD_CHECK_TEST_SCENARIOS.find((s) => s.id === 'resume-as-certificate')!;
  const res = runUploadCheckPipeline({
    filename: scenario.filename,
    selectedCategory: scenario.selectedCategory,
    extractedText: scenario.extractedText,
    profile: demoProfile,
    referenceNow: referenceDate,
  });

  assert.equal(res.detectedType, 'resume');
  assert.ok(res.typeConfidence >= 0.7);
  const mismatchFlag = res.flags.find((f) => f.code === 'CATEGORY_MISMATCH');
  assert.ok(mismatchFlag, 'Should include CATEGORY_MISMATCH flag');
  assert.equal(mismatchFlag!.severity, 'blocking');
  assert.match(mismatchFlag!.message, /looks like a résumé, but you chose Certificate/i);
  assert.equal(res.nameMatch, 'match');
  assert.equal(res.trust, 'rejected');
});

test('Test 2: Certificate uploaded as Résumé triggers blocking CATEGORY_MISMATCH with confidence >= 0.7', () => {
  const scenario = UPLOAD_CHECK_TEST_SCENARIOS.find((s) => s.id === 'certificate-as-resume')!;
  const res = runUploadCheckPipeline({
    filename: scenario.filename,
    selectedCategory: scenario.selectedCategory,
    extractedText: scenario.selectedCategory === 'resume' ? scenario.extractedText : '',
    profile: demoProfile,
    referenceNow: referenceDate,
  });

  assert.equal(res.detectedType, 'certificate');
  assert.ok(res.typeConfidence >= 0.7);
  const mismatchFlag = res.flags.find((f) => f.code === 'CATEGORY_MISMATCH');
  assert.ok(mismatchFlag, 'Should include CATEGORY_MISMATCH flag');
  assert.equal(mismatchFlag!.severity, 'blocking');
  assert.match(mismatchFlag!.message, /looks like a certificate, but you chose Résumé/i);
});

test("Test 3: Someone else's name (< 0.5) blocks Check C with clear explanation and tests Rahul K vs K. Rahul", () => {
  const scenario = UPLOAD_CHECK_TEST_SCENARIOS.find((s) => s.id === 'someone-elses-name')!;
  const res = runUploadCheckPipeline({
    filename: scenario.filename,
    selectedCategory: scenario.selectedCategory,
    targetSkill: scenario.targetSkill,
    extractedText: scenario.extractedText,
    profile: demoProfile,
    referenceNow: referenceDate,
  });

  assert.equal(res.extractedPersonName, 'Priya Sharma');
  assert.equal(res.nameMatch, 'mismatch');
  assert.equal(res.identityUnconfirmed, true);
  assert.equal(res.identityVerification?.status, 'BLOCK');
  const idFlag = res.flags.find((f) => f.code === 'IDENTITY_MISMATCH');
  assert.ok(idFlag);
  assert.equal(idFlag!.severity, 'blocking');
  assert.match(
    idFlag!.message,
    /This document appears to belong to Priya Sharma, not Arjun Mehta/
  );
  assert.equal(res.trust, 'rejected');

  // Verify token-set + Levenshtein/Jaro-Winkler fuzzy matching:
  const rahulComp = comparePersonNames('Rahul K', 'K. Rahul');
  assert.equal(rahulComp.status, 'match');
  assert.ok(rahulComp.score >= 0.8);

  assert.equal(comparePersonNames('Dr. Mehta, Arjun', 'Arjun Mehta').status, 'match');
  assert.equal(comparePersonNames('A. Mehta', 'Arjun Mehta').status, 'match');

  // Partial match (0.5 - 0.8) -> WARNING
  const partialComp = comparePersonNames('Arjun', 'Arjun Mehta');
  assert.equal(partialComp.status, 'partial');
  assert.ok(partialComp.score >= 0.5 && partialComp.score < 0.8);

  // Not found on readable résumé/certificate -> BLOCKED
  const noNameCert = runUploadCheckPipeline({
    filename: 'unnamed_cert.pdf',
    selectedCategory: 'certificate',
    extractedText: `Certificate of Completion
Successfully completed the certification course "Advanced TypeScript & Node.js Architecture"
Issued by: Coursera
Date of Issue: 2025-08-14
Credential ID: CRSA-991827`,
    profile: demoProfile,
    referenceNow: referenceDate,
  });
  assert.equal(noNameCert.nameMatch, 'not_found');
  assert.equal(noNameCert.identityVerification?.status, 'BLOCK');
  assert.ok(noNameCert.flags.some((f) => f.code === 'IDENTITY_NOT_FOUND' && f.severity === 'blocking'));
});

test('Test 4: Unreadable scan (< 100 chars or < 60% OCR) blocks Check A (with real reason), Check B (0% confidence), and Check C ("Cannot verify identity")', () => {
  const scenario = UPLOAD_CHECK_TEST_SCENARIOS.find((s) => s.id === 'blurry-image')!;
  const res = runUploadCheckPipeline({
    filename: scenario.filename,
    selectedCategory: scenario.selectedCategory,
    ocrConfidence: scenario.ocrConfidence,
    extractedText: scenario.extractedText,
    profile: demoProfile,
    referenceNow: referenceDate,
  });

  assert.equal(res.readability.status, 'unreadable');
  assert.equal(res.readability.failureCategory, 'blurry');
  assert.deepEqual(res.detectedSkills, []);
  assert.equal(res.trust, 'rejected');
  assert.equal(res.nameMatch, 'unreadable');
  assert.ok(res.flags.some((f) => f.code === 'UNREADABLE_FILE' && f.severity === 'blocking'));
  assert.ok(res.flags.some((f) => f.checkId === 'document_type' && f.severity === 'blocking'));
  assert.ok(res.flags.some((f) => f.code === 'IDENTITY_UNREADABLE' && f.severity === 'blocking'));

  // Non-document photo detection
  const photoRes = runUploadCheckPipeline({
    filename: 'selfie.jpg',
    mimeType: 'image/jpeg',
    selectedCategory: 'certificate',
    ocrConfidence: 15,
    isNonDocumentPhoto: true,
    extractedText: '',
    profile: demoProfile,
    referenceNow: referenceDate,
  });
  assert.equal(photoRes.readability.failureCategory, 'not_a_document');
  const photoTypeFlag = photoRes.flags.find((f) => f.code === 'NON_DOCUMENT_PHOTO');
  assert.ok(photoTypeFlag);
  assert.equal(photoTypeFlag!.message, 'This looks like a photo, not a document.');
});

test('Test 5: Duplicate file (same SHA-256 hash or same text with different filename) is caught', () => {
  const scenario = UPLOAD_CHECK_TEST_SCENARIOS.find((s) => s.id === 'duplicate-file')!;
  const existingAttachments: AttachmentItem[] = [
    {
      id: 42,
      user_id: 1,
      filename: 'arjun_mehta_original_resume.pdf',
      mime_type: 'application/pdf',
      category: 'resume',
      extracted_text: scenario.extractedText,
      file_size: 12400,
      created_at: '2026-10-20T00:00:00Z',
    },
  ];

  const res = runUploadCheckPipeline({
    filename: scenario.filename,
    selectedCategory: scenario.selectedCategory,
    extractedText: scenario.extractedText,
    profile: demoProfile,
    existingAttachments,
    referenceNow: referenceDate,
  });

  assert.ok(res.duplicateOf);
  assert.equal(res.duplicateOf?.filename, 'arjun_mehta_original_resume.pdf');
  assert.ok(
    res.flags.some(
      (f) => f.code === 'DUPLICATE_FILE_HASH' || f.code === 'DUPLICATE_TEXT_CONTENT'
    )
  );
});

test('Test 6: Certificate dated in the future is flagged by Certificate Sanity Checks and sets trust to low', () => {
  const scenario = UPLOAD_CHECK_TEST_SCENARIOS.find((s) => s.id === 'future-dated-certificate')!;
  const res = runUploadCheckPipeline({
    filename: scenario.filename,
    selectedCategory: scenario.selectedCategory,
    targetSkill: scenario.targetSkill,
    extractedText: scenario.extractedText,
    profile: demoProfile,
    referenceNow: referenceDate,
  });

  assert.equal(res.detectedType, 'certificate');
  assert.equal(res.certificateMeta?.issueDate, '2028-11-20');
  assert.equal(res.certificateMeta?.isFutureDate, true);
  assert.ok(res.flags.some((f) => f.code === 'CERT_FUTURE_DATE'));
  assert.equal(res.trust, 'low');
});

test('Test 7: File named "resume.pdf" that is a job description is blocked and flagged for filename mismatch', () => {
  const scenario = UPLOAD_CHECK_TEST_SCENARIOS.find(
    (s) => s.id === 'resume-named-job-description'
  )!;
  const res = runUploadCheckPipeline({
    filename: scenario.filename,
    selectedCategory: scenario.selectedCategory,
    extractedText: scenario.extractedText,
    profile: demoProfile,
    referenceNow: referenceDate,
  });

  assert.equal(res.detectedType, 'job_description');
  assert.equal(res.trust, 'rejected');
  assert.ok(res.flags.some((f) => f.code === 'NOT_VALID_PROOF_TYPE' && f.severity === 'blocking'));
  const fnFlag = res.flags.find((f) => f.code === 'FILENAME_CONTENT_MISMATCH');
  assert.ok(fnFlag);
  assert.match(fnFlag!.message, /named "resume\.pdf" but looks like a job description/i);
  assert.ok(res.flags.some((f) => f.code === 'SUSPICIOUS_JD_AS_RESUME'));
});

test('Test 8: Aadhaar ID or marksheet image is blocked and extracted text is redacted for privacy', () => {
  const scenario = UPLOAD_CHECK_TEST_SCENARIOS.find((s) => s.id === 'aadhaar-or-marksheet')!;
  const res = runUploadCheckPipeline({
    filename: scenario.filename,
    selectedCategory: scenario.selectedCategory,
    extractedText: scenario.extractedText,
    profile: demoProfile,
    referenceNow: referenceDate,
  });

  assert.equal(res.detectedType, 'id_document');
  assert.equal(res.privacyRedacted, true);
  assert.equal(res.extractedTextPreview, ''); // Never store extracted text for IDs or marksheets
  assert.equal(res.trust, 'rejected');
  const sensitiveFlag = res.flags.find((f) => f.code === 'SENSITIVE_ID_OR_MARKSHEET');
  assert.ok(sensitiveFlag);
  assert.equal(
    sensitiveFlag!.message,
    'This looks like a personal ID or marksheet. Do not upload sensitive IDs. Remove it?'
  );
});

test("Test 9: File that doesn't mention the selected skill flags SKILL_RELEVANCE_MISMATCH and leaves skill as declared (never verified)", () => {
  const scenario = UPLOAD_CHECK_TEST_SCENARIOS.find((s) => s.id === 'skill-not-mentioned')!;
  const res = runUploadCheckPipeline({
    filename: scenario.filename,
    selectedCategory: scenario.selectedCategory,
    targetSkill: scenario.targetSkill,
    extractedText: scenario.extractedText,
    profile: demoProfile,
    referenceNow: referenceDate,
  });

  assert.equal(res.targetSkill, 'TypeScript');
  assert.equal(res.targetSkillMentioned, false);
  assert.ok(res.detectedSkills.includes('Excel'));
  assert.ok(res.detectedSkills.includes('Communication'));

  const skillFlag = res.flags.find((f) => f.code === 'SKILL_RELEVANCE_MISMATCH');
  assert.ok(skillFlag);
  assert.match(
    skillFlag!.message,
    /This file doesn't seem to show TypeScript\. Detected: Excel, Communication/i
  );
  assert.equal(res.trust, 'low');

  // Even if user chooses "Attach anyway", trust stays "low" and getSkillStatus returns "declared", never "verified"
  const attachedAnywayTrust = computeUploadTrustTier({
    readabilityStatus: 'readable',
    detectedType: 'certificate',
    selectedCategory: 'certificate',
    nameMatch: 'match',
    targetSkill: 'TypeScript',
    targetSkillMentioned: false,
    attachedAnywayUnconfirmed: true,
    flags: [],
  });
  assert.equal(attachedAnywayTrust, 'low');

  const unconfirmedEvidence: EvidenceItem = {
    id: 'ev-unconfirmed-1',
    skill: 'Kubernetes',
    skillId: 'Kubernetes',
    type: 'certificate',
    title: 'Business Spreadsheet Workshop (Attached anyway)',
    status: 'valid',
    details: {
      trust: 'low',
      unconfirmedEvidence: true,
    },
  };

  const skillStatus = getSkillStatus('Kubernetes', {
    evidence: [unconfirmedEvidence],
    profile: demoProfile,
    attachments: [],
  });
  assert.equal(skillStatus, 'declared');
  assert.equal(getUnconfirmedEvidenceForSkill('Kubernetes', [unconfirmedEvidence]).length, 1);
});

test('Test 10: Universal verifyIdentity(profile, docText) — varied user names & edge cases', () => {
  // 1. Single-word name
  const singleWordRes = verifyIdentity(
    { name: 'Nivindharan', email: 'nivin@example.com' },
    `Nivindharan
Full-Stack Developer | Chennai
WORK EXPERIENCE
Built React, TypeScript, and Node.js applications with SQL and Docker.`
  );
  assert.equal(singleWordRes.status, 'PASS');
  assert.equal(singleWordRes.score, 1);
  assert.deepEqual(singleWordRes.matchedTokens, ['nivindharan']);

  // 2. Initials first ("A. Kumar") matching "A. Kumar" and matching expanded "Anand Kumar"
  const initialsFirstExact = verifyIdentity(
    { name: 'A. Kumar' },
    `Certificate of Completion
This is to certify that A. Kumar has completed the Cloud Architecture course.`
  );
  assert.equal(initialsFirstExact.status, 'PASS');
  assert.equal(initialsFirstExact.score, 1);
  assert.deepEqual(initialsFirstExact.matchedTokens, ['a', 'kumar']);

  const initialsFirstExpanded = verifyIdentity(
    { name: 'A. Kumar' },
    `Anand Kumar
Backend Engineer | Bengaluru
EXPERIENCE
Developed distributed microservices in Go and Node.js.`
  );
  assert.equal(initialsFirstExpanded.status, 'PASS');
  assert.equal(initialsFirstExpanded.score, 1);
  assert.deepEqual(initialsFirstExpanded.matchedTokens, ['a', 'kumar']);

  // 3. Initials last ("Nivindharan A") matching "Nivindharan A." and "A. Nivindharan"
  const initialsLastRes = verifyIdentity(
    { name: 'Nivindharan A' },
    `CERTIFICATE OF ACHIEVEMENT
Awarded to Nivindharan A. for completing Full-Stack Web Development with React & TypeScript.`
  );
  assert.equal(initialsLastRes.status, 'PASS');
  assert.equal(initialsLastRes.score, 1);
  assert.deepEqual(initialsLastRes.matchedTokens, ['nivindharan', 'a']);

  const initialsLastSwapped = verifyIdentity(
    { name: 'Nivindharan A' },
    `A. Nivindharan
Software Engineer | Chennai | github.com/nivin-a`
  );
  assert.equal(initialsLastSwapped.status, 'PASS');
  assert.equal(initialsLastSwapped.score, 1);

  // 4. Hyphenated name ("Jean-Luc Picard", "Sarah-Jane Smith")
  const hyphenatedRes = verifyIdentity(
    { name: 'Jean-Luc Picard' },
    `JEAN-LUC PICARD
Systems Architect | Paris
EXPERIENCE
Led mission-critical distributed systems architecture.`
  );
  assert.equal(hyphenatedRes.status, 'PASS');
  assert.equal(hyphenatedRes.score, 1);
  assert.deepEqual(hyphenatedRes.matchedTokens, ['jean', 'luc', 'picard']);

  const hyphenatedUnjoinedInDoc = verifyIdentity(
    { name: 'Sarah-Jane Smith' },
    `Certificate of Completion
Presented to Sarah Jane Smith for excellence in Cybersecurity & Cloud Engineering.`
  );
  assert.equal(hyphenatedUnjoinedInDoc.status, 'PASS');
  assert.equal(hyphenatedUnjoinedInDoc.score, 1);

  // 5. Accented & mojibake name ("José" vs "Jose" and UTF-8 read as Latin-1 "JosÃ©")
  assert.equal(fixMojibake('JosÃ© GarcÃ­a'), 'José García');
  assert.equal(normalizeIdentityText('JosÃ© GarcÃ­a'), 'jose garcia');

  const accentedInProfilePlainInDoc = verifyIdentity(
    { name: 'José García' },
    `Jose Garcia
Senior Data Scientist | Madrid
EXPERIENCE
Built ML pipelines with Python, SQL, and Docker.`
  );
  assert.equal(accentedInProfilePlainInDoc.status, 'PASS');
  assert.equal(accentedInProfilePlainInDoc.score, 1);
  assert.deepEqual(accentedInProfilePlainInDoc.matchedTokens, ['jose', 'garcia']);

  const mojibakeInDocRes = verifyIdentity(
    { name: 'José García' },
    `Certificate of Accomplishment
This is to certify that JosÃ© GarcÃ­a has completed Advanced Machine Learning.`
  );
  assert.equal(mojibakeInDocRes.status, 'PASS');
  assert.equal(mojibakeInDocRes.score, 1);
  assert.deepEqual(mojibakeInDocRes.matchedTokens, ['jose', 'garcia']);

  // 6. Name order swapped ("Rahul K" vs "K. Rahul", "García, José" vs "José García")
  const swappedOrderRes = verifyIdentity(
    { name: 'Rahul K' },
    `K. Rahul
Software Development Engineer | Hyderabad
SKILLS: TypeScript, React, Node.js`
  );
  assert.equal(swappedOrderRes.status, 'PASS');
  assert.equal(swappedOrderRes.score, 1);

  const commaSwappedOrder = verifyIdentity(
    { name: 'José García' },
    `Name: Garcia, Jose
Role: Lead Backend Engineer
Experience: 6 years with PostgreSQL and Node.js`
  );
  assert.equal(commaSwappedOrder.status, 'PASS');
  assert.equal(commaSwappedOrder.score, 1);

  // 7. Flattened text with no line breaks (single-line PDF extraction)
  const flattenedTextRes = verifyIdentity(
    { name: 'Nivindharan A', email: 'nivindharan@example.com' },
    `Nivindharan A Software Engineer Chennai nivindharan@example.com Summary Full stack developer experienced in React TypeScript Node.js SQL and Docker Education B.E. Computer Science 2025`
  );
  assert.equal(flattenedTextRes.status, 'PASS');
  assert.equal(flattenedTextRes.score, 1);
  assert.ok(flattenedTextRes.signals.some((s) => s.includes('email')));

  // 8. Supporting signals: score >= 0.5 + email/GitHub/LinkedIn match -> PASS; partial match alone -> WARN
  const partialWithGithubPass = verifyIdentity(
    { name: 'Nivindharan Arul', github_username: 'nivin-dev' },
    `Nivindharan
Open Source Maintainer | https://github.com/nivin-dev
Built TypeScript CLI tools and React libraries.`
  );
  assert.equal(partialWithGithubPass.status, 'PASS');
  assert.equal(partialWithGithubPass.score, 0.5);
  assert.ok(partialWithGithubPass.signals.some((s) => s.includes('GitHub')));

  const partialOnlyWarn = verifyIdentity(
    { name: 'Nivindharan Arul' },
    `Nivindharan
Software Engineer | Chennai
Experience in React, TypeScript, and Node.js.`
  );
  assert.equal(partialOnlyWarn.status, 'WARN');
  assert.equal(partialOnlyWarn.score, 0.5);
  assert.match(partialOnlyWarn.message, /Confirm this is your document/);

  // 9. Different person's document -> must BLOCK
  const differentPersonRes = verifyIdentity(
    { name: 'Nivindharan A', email: 'nivin@example.com' },
    `Certificate of Completion
This is to certify that Priya Sharma has successfully completed
"Production React & TypeScript Architecture"
Issued by: Coursera`
  );
  assert.equal(differentPersonRes.status, 'BLOCK');
  assert.equal(differentPersonRes.score, 0);
  assert.equal(differentPersonRes.conflictingName, 'Priya Sharma');
  assert.match(
    differentPersonRes.message,
    /This document appears to belong to Priya Sharma, not Nivindharan A/
  );

  // Also test when an English article "a" appears in prose for a user with initial "A" ("Nivindharan A"):
  // "completed a course" must NOT count as a match for initial "A"!
  const differentPersonWithArticleA = verifyIdentity(
    { name: 'Nivindharan A' },
    `Certificate of Completion
This is to certify that Rohan Verma has completed a course in Cloud Computing.`
  );
  assert.equal(differentPersonWithArticleA.status, 'BLOCK');
  assert.equal(differentPersonWithArticleA.score, 0);
  assert.deepEqual(differentPersonWithArticleA.matchedTokens, []);

  // 10. Missing profile name -> prompts user to set it before upload
  const missingProfileRes = verifyIdentity(
    { name: '   ' },
    `Nivindharan A
Software Engineer`
  );
  assert.equal(missingProfileRes.status, 'BLOCK');
  assert.equal(missingProfileRes.missingProfileName, true);
  assert.match(missingProfileRes.message, /set your full name in your profile before uploading/i);
});

test('Test 11: Independent Document Name Detection (Flattened DOCX, ALL-CAPS, Certificates, and Single-Letter Initial False-Match Prevention)', () => {
  // 1. Flattened DOCX résumé header ("Nivindharan A Computer Science and Engineering Student...")
  const flattenedNivinDocx = `Nivindharan A Computer Science and Engineering Student Tiruchirappalli, Tamil Nadu, India | +91 7448809471 | nivindharan2006@gmail.com LinkedIn | GitHub | LeetCode Professional Summary Entry-level Computer Science and Engineering undergraduate with hands-on experience in React, TypeScript, Node.js, and SQL.`;
  const extractedNivin = extractIdentityFromText(flattenedNivinDocx, 'resume');
  assert.equal(extractedNivin.personName, 'Nivindharan A');

  // Even when profile name is single-word "Nivindharan", detectedName must be the document's actual name "Nivindharan A"
  const verifyNivinSingleProfile = verifyIdentity(
    { name: 'Nivindharan' },
    flattenedNivinDocx
  );
  assert.equal(verifyNivinSingleProfile.status, 'PASS');
  assert.equal(verifyNivinSingleProfile.detectedName, 'Nivindharan A');

  // 2. Another student's flattened DOCX résumé ("Karthik R Computer Science and Engineering Student...")
  const flattenedKarthikDocx = `Karthik R Computer Science and Engineering Student Tiruchirappalli, Tamil Nadu, India | +91 9876543210 | karthik.r@example.com Professional Summary Entry-level Computer Science undergraduate skilled in Python, Java, and SQL. Education B.E. Computer Science 2026`;
  const extractedKarthik = extractIdentityFromText(flattenedKarthikDocx, 'resume');
  assert.equal(extractedKarthik.personName, 'Karthik R');

  const verifyKarthikAgainstNivin = verifyIdentity(
    { name: 'Nivindharan A', email: 'nivindharan2006@gmail.com' },
    flattenedKarthikDocx
  );
  assert.equal(verifyKarthikAgainstNivin.status, 'BLOCK');
  assert.equal(verifyKarthikAgainstNivin.detectedName, 'Karthik R');
  assert.equal(verifyKarthikAgainstNivin.conflictingName, 'Karthik R');
  assert.match(
    verifyKarthikAgainstNivin.message,
    /This document appears to belong to Karthik R, not Nivindharan A/
  );

  // 3. Single-letter initial "A" in "Nivindharan A" MUST NOT false-match "Arjun Mehta" or "Karthik A"
  const arjunResumeForNivin = verifyIdentity(
    { name: 'Nivindharan A', email: 'nivindharan2006@gmail.com' },
    demoProfile.resume_text
  );
  assert.equal(arjunResumeForNivin.status, 'BLOCK');
  assert.equal(arjunResumeForNivin.score, 0);
  assert.deepEqual(arjunResumeForNivin.matchedTokens, []);
  assert.equal(arjunResumeForNivin.detectedName, 'Arjun Mehta');
  assert.equal(arjunResumeForNivin.conflictingName, 'Arjun Mehta');

  const karthikACertForNivin = verifyIdentity(
    { name: 'Nivindharan A' },
    `Certificate of Completion
This is to certify that Karthik A has successfully completed the Cloud DevOps Engineering program.`
  );
  assert.equal(karthikACertForNivin.status, 'BLOCK');
  assert.equal(karthikACertForNivin.score, 0);
  assert.deepEqual(karthikACertForNivin.matchedTokens, []);
  assert.equal(karthikACertForNivin.detectedName, 'Karthik A');
  assert.equal(karthikACertForNivin.conflictingName, 'Karthik A');

  // 4. ALL-CAPS certificate recipient name before "has successfully completed" without "certify that" on same line
  const allCapsCertText = `COURSERA CERTIFICATE OF ACCOMPLISHMENT
PRIYA SHARMA
has successfully completed the online non-credit course
Full-Stack Web Development with React and TypeScript`;
  const extractedAllCapsCert = extractIdentityFromText(allCapsCertText, 'certificate');
  assert.equal(extractedAllCapsCert.personName, 'Priya Sharma');
  assert.equal(isValidCandidatePersonName('PRIYA SHARMA'), 'Priya Sharma');
});



