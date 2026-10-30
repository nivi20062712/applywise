import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPublicPassportPayload,
  computePassportSummaryHash,
  createOrUpdatePassport,
  revokePassport,
  getPublicPassportData,
  PublicVerifiedSkill,
} from '../server/passport';
import { db } from '../server/db';

test('buildPublicPassportPayload enforces strict allow-list and never leaks private data', () => {
  // Candidate fixture with private PII, resume text, and unverified skill names
  const sensitiveCandidateFixture = {
    email: 'alice.private@confidential.org',
    phone: '+1 (555) 019-2834',
    userFullName: 'Alice Wonder',
    resume_text: 'Confidential Internal Projects at Stealth Startup Inc. Secret project Phoenix.',
    unverifiedSkillNames: ['Kubernetes Internal', 'GraphQL Enterprise', 'Proprietary Protocol'],
    missingSkillNames: ['Rust Low-Level', 'Cobol Legacy'],
  };

  const verifiedSkills: PublicVerifiedSkill[] = [
    {
      skill: 'TypeScript',
      proofTitle: 'Production CLI Tool (Public GitHub)',
      proofType: 'code_repository',
      proofUrl: 'https://github.com/alice/prod-cli',
      verifiedAt: '2026-03-01T12:00:00Z',
    },
    {
      skill: 'React',
      proofTitle: 'Frontend Architecture Sandbox',
      proofType: 'deployment',
      proofUrl: 'https://alice-portfolio.vercel.app',
      verifiedAt: '2026-03-10T14:30:00Z',
    },
    {
      skill: 'SQL',
      proofTitle: 'Internal DB Schema (local file - should not have web url)',
      proofType: 'document',
      proofUrl: 'file:///local/path/secret.sql', // non-http URL should be stripped
    },
  ];

  const payload = buildPublicPassportPayload({
    showName: false,
    userFullName: sensitiveCandidateFixture.userFullName,
    targetRole: 'Full-Stack Software Engineer',
    readinessScore: 84,
    verifiedSkills,
    selfDeclaredCount: sensitiveCandidateFixture.unverifiedSkillNames.length,
    summary: 'Candidate shows verified production proficiency in TypeScript and React with strong public artifacts.',
  });

  // Allowed keys inspection: ensure no unexpected fields exist
  const allowedKeys = new Set([
    'displayName',
    'targetRole',
    'readinessScore',
    'tier',
    'verifiedSkills',
    'selfDeclaredCount',
    'generatedAt',
    'summary',
  ]);

  for (const key of Object.keys(payload)) {
    assert.ok(
      allowedKeys.has(key),
      `Key "${key}" is not on the public passport allow-list!`
    );
  }

  // 1. showName: false -> displayName MUST NOT be the user's name
  assert.equal(payload.displayName, 'Verified candidate');
  assert.notEqual(payload.displayName, sensitiveCandidateFixture.userFullName);

  // 2. Check JSON stringification to guarantee zero leakage of sensitive data
  const jsonString = JSON.stringify(payload);
  assert.ok(!jsonString.includes(sensitiveCandidateFixture.email), 'Email leaked into public payload!');
  assert.ok(!jsonString.includes(sensitiveCandidateFixture.phone), 'Phone leaked into public payload!');
  assert.ok(!jsonString.includes('Stealth Startup'), 'Resume text leaked into public payload!');
  assert.ok(!jsonString.includes('Phoenix'), 'Resume project leaked into public payload!');

  for (const unverified of sensitiveCandidateFixture.unverifiedSkillNames) {
    assert.ok(
      !jsonString.includes(unverified),
      `Unverified skill "${unverified}" leaked into public payload!`
    );
  }

  for (const missing of sensitiveCandidateFixture.missingSkillNames) {
    assert.ok(
      !jsonString.includes(missing),
      `Missing skill "${missing}" leaked into public payload!`
    );
  }

  // 3. Non-http/https URL was safely removed
  const sqlProof = payload.verifiedSkills.find((v) => v.skill === 'SQL');
  assert.ok(sqlProof);
  assert.equal(sqlProof.proofUrl, undefined, 'Non-http proofUrl must be stripped');

  // 4. selfDeclaredCount is a plain number
  assert.equal(payload.selfDeclaredCount, 3);
  assert.equal(typeof payload.selfDeclaredCount, 'number');
});

test('showName true returns first name only, never full name or contact details', () => {
  const payload = buildPublicPassportPayload({
    showName: true,
    userFullName: 'Jane Alexander Doe',
    targetRole: 'Frontend Engineer',
    readinessScore: 78,
    verifiedSkills: [
      {
        skill: 'React',
        proofTitle: 'Interactive UI Library',
        proofType: 'code_repository',
        proofUrl: 'https://github.com/jane/ui-lib',
      },
    ],
    selfDeclaredCount: 2,
  });

  assert.equal(payload.displayName, 'Jane');
  assert.ok(!JSON.stringify(payload).includes('Alexander'));
  assert.ok(!JSON.stringify(payload).includes('Doe'));
});

test('computePassportSummaryHash is deterministic and order-independent', () => {
  const listA = [
    { skill: 'TypeScript', proofTitle: 'CLI Parser' },
    { skill: 'React', proofTitle: 'Component Library' },
  ];
  const listB = [
    { skill: 'React', proofTitle: 'Component Library' },
    { skill: 'TypeScript', proofTitle: 'CLI Parser' },
  ];

  const hashA = computePassportSummaryHash(listA);
  const hashB = computePassportSummaryHash(listB);

  assert.equal(hashA, hashB);
  assert.equal(typeof hashA, 'string');
  assert.equal(hashA.length, 64);
});

test('revoked passport returns 404 (null) and unknown token returns null', async () => {
  // Test user in DB
  const testEmail = `passport_test_${Date.now()}@applywise.test`;
  const insertUser = db
    .prepare('INSERT INTO users (name, email, password_hash, account_role) VALUES (?, ?, ?, ?)')
    .run('Test Candidate', testEmail, 'mock_hash', 'Job seeker');
  const userId = Number(insertUser.lastInsertRowid);

  // Add sample evidence
  db.prepare(
    'INSERT INTO evidence (user_id, skill, type, title, url, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, 'TypeScript', 'code_repository', 'Test Repo', 'https://github.com/test/repo', 'valid');

  // Create active passport
  const passport = await createOrUpdatePassport({ userId, showName: false });
  assert.ok(passport.token);
  assert.ok(passport.token.length >= 20);

  // Fetching public passport with active token succeeds
  const activeData = await getPublicPassportData(passport.token);
  assert.ok(activeData !== null);
  assert.equal(activeData?.displayName, 'Verified candidate');
  assert.ok(activeData?.targetRole?.includes('Software Engineer'));

  // Revoke passport
  const revoked = revokePassport(userId);
  assert.ok(revoked);

  // Fetching public passport after revocation returns null (which route translates to 404)
  const revokedData = await getPublicPassportData(passport.token);
  assert.equal(revokedData, null);

  // Unknown token returns null (404)
  const nonExistent = await getPublicPassportData('non_existent_token_123456');
  assert.equal(nonExistent, null);
});
