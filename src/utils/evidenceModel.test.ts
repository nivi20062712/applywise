import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSkillStatus,
  normalizeSkillName,
  normalizeEvidenceItem,
  buildResumeGenerationInput,
  validateResumeOutput,
  buildFallbackResumeStudioOutput,
  parseGitHubRepoUrl,
  validateGitHubRepoProof,
  detectSkillsFromGitHubRepo,
  canGitHubRepoVerifySkill,
  computeJdGapAnalysis,
  type SkillStatusContext,
} from './evidenceModel';

test('Part 0: getSkillStatus with a user having 1 verified skill and 0 verified skills', () => {
  // Case A: User with 1 verified skill (React), 1 declared skill (Node.js), and 1 missing skill (Docker)
  const ctxOneVerified: SkillStatusContext = {
    profile: {
      name: 'Arjun',
      title: 'Full Stack Developer',
      role: 'Job seeker',
      location: 'Bengaluru',
      education: 'B.Tech',
      skills_text: 'React, Node.js',
      resume_text: 'Experienced with React and Node.js backend services.',
    },
    evidence: [
      {
        id: 'ev-1',
        skillId: 'React',
        skill: 'React',
        type: 'github',
        title: 'portfolio-react',
        url: 'https://github.com/arjun/portfolio-react',
        status: 'valid',
      },
      {
        id: 'ev-rejected',
        skillId: 'Docker',
        skill: 'Docker',
        type: 'github',
        title: 'private-docker',
        status: 'rejected',
        reason: 'Private repo',
      },
    ],
  };

  assert.equal(getSkillStatus('React', ctxOneVerified), 'verified');
  assert.equal(getSkillStatus('ReactJS', ctxOneVerified), 'verified'); // alias normalization
  assert.equal(getSkillStatus('Node.js', ctxOneVerified), 'declared');
  assert.equal(getSkillStatus('Docker', ctxOneVerified), 'missing'); // rejected evidence does not verify
  assert.equal(getSkillStatus('Kubernetes', ctxOneVerified), 'missing');

  // Case B: User with 0 verified skills (only declared skills in resume)
  const ctxZeroVerified: SkillStatusContext = {
    profile: {
      name: 'New User',
      title: 'Junior Developer',
      role: 'Student',
      location: 'Remote',
      education: 'B.Sc',
      skills_text: 'Python, SQL',
      resume_text: 'Built coursework scripts in Python and SQL.',
    },
    evidence: [
      // Legacy self-declared item must be normalized to rejected, never verified
      normalizeEvidenceItem({
        id: 99,
        skill: 'Python',
        type: 'self-declared',
        title: 'Mentioned in résumé (self-declared)',
      }),
    ],
  };

  assert.equal(getSkillStatus('Python', ctxZeroVerified), 'declared');
  assert.equal(getSkillStatus('Postgres', ctxZeroVerified), 'declared'); // normalizes to SQL
  assert.equal(getSkillStatus('TypeScript', ctxZeroVerified), 'missing');
});

test('Part 1: Résumé Studio validator and fallback with 1 verified skill and 0 verified skills', () => {
  // 1. User with 1 verified skill (React) and 1 declared skill (Node.js)
  const ctxOneVerified: SkillStatusContext = {
    profile: {
      name: 'Arjun Mehta',
      title: 'Frontend Engineer',
      role: 'Job seeker',
      location: 'Bengaluru',
      education: 'B.Tech',
      skills_text: 'React, Node.js',
      resume_text: 'React and Node.js developer',
    },
    evidence: [
      {
        id: 101,
        skillId: 'React',
        skill: 'React',
        type: 'github',
        title: 'telemetry-dashboard-ui',
        url: 'https://github.com/arjun/telemetry-dashboard-ui',
        status: 'valid',
      },
    ],
  };

  const genInput = buildResumeGenerationInput({
    context: ctxOneVerified,
    targetRole: 'Frontend Engineer',
    companyName: 'Acme Corp',
    candidateName: 'Arjun Mehta',
    sprintInProgress: false,
  });

  assert.equal(genInput.verifiedSkills.length, 1);
  assert.equal(genInput.verifiedSkills[0].skillId, 'React');
  assert.deepEqual(genInput.declaredSkills, ['Node.js']);

  // Fallback output for 1 verified skill must pass validation
  const validFallback = buildFallbackResumeStudioOutput(genInput);
  const checkValid = validateResumeOutput(validFallback, genInput);
  assert.equal(checkValid.valid, true, `Expected valid fallback, got: ${checkValid.errors.join('; ')}`);
  assert.equal(validFallback.bullets.length, 1);
  assert.ok(validFallback.skillsLine.includes('Familiar with Node.js'));
  assert.ok(!/verified|developed/i.test(validFallback.skillsLine));

  // Reject leaked internal status labels, duplicate openings, invalid evidenceId, or unverified claims in cover letter
  const invalidOutput = {
    bullets: [
      {
        skillId: 'React',
        evidenceId: 101,
        text: 'Architected production React modules (Mentioned in résumé (self-declared)).',
      },
      {
        skillId: 'React',
        evidenceId: 999, // non-existent evidenceId
        text: 'Architected production components for unverified skill.',
      },
    ],
    skillsLine: 'Verified expert in Node.js (self-declared)',
    coverLetter:
      'Dear Hiring Team, I have verified experience in React and Kubernetes and Docker.',
  };

  const checkInvalid = validateResumeOutput(invalidOutput, genInput);
  assert.equal(checkInvalid.valid, false);
  assert.ok(
    checkInvalid.errors.some((e) => e.includes('self-declared') || e.includes('Mentioned in')),
    'Should reject self-declared / Mentioned in text'
  );
  assert.ok(
    checkInvalid.errors.some((e) => e.includes('999')),
    'Should reject unknown evidenceId'
  );
  assert.ok(
    checkInvalid.errors.some((e) => e.toLowerCase().includes('duplicate bullet opening')),
    'Should reject duplicate first two words'
  );
  assert.ok(
    checkInvalid.errors.some((e) => e.includes('Kubernetes') || e.includes('Docker')),
    'Should reject cover letter claiming missing skills'
  );

  // 2. User with 0 verified skills
  const ctxZeroVerified: SkillStatusContext = {
    profile: {
      name: 'Priya',
      title: 'Backend Engineer',
      role: 'Student',
      location: 'Delhi',
      education: 'B.Tech',
      skills_text: 'SQL, Python',
      resume_text: 'Familiar with SQL and Python.',
    },
    evidence: [],
  };

  const zeroInput = buildResumeGenerationInput({
    context: ctxZeroVerified,
    targetRole: 'Backend Engineer',
    sprintInProgress: true,
    sprintSkills: ['Docker'],
  });
  assert.equal(zeroInput.verifiedSkills.length, 0);
  const zeroFallback = buildFallbackResumeStudioOutput(zeroInput);
  assert.equal(zeroFallback.bullets.length, 0);
  const zeroValidation = validateResumeOutput(zeroFallback, zeroInput);
  assert.equal(zeroValidation.valid, true, zeroValidation.errors.join('; '));
  assert.ok(
    zeroFallback.coverLetter.includes('currently building Docker'),
    'Should allow "currently building" sprint skill when sprintInProgress is true'
  );
});

test('Part 2: GitHub validation rules (private repo, forked repo, weak evidence, skill detection)', () => {
  const parsed = parseGitHubRepoUrl('https://github.com/arjun-mehta/telemetry-cloud-ui.git');
  assert.deepEqual(parsed, { owner: 'arjun-mehta', repo: 'telemetry-cloud-ui' });

  // 1. Private repo -> rejected
  const privateOutcome = validateGitHubRepoProof({
    owner: 'arjun-mehta',
    repo: 'secret-repo',
    username: 'arjun-mehta',
    isPrivate: true,
    userCommitDates: ['2026-02-01T10:00:00Z', '2026-02-02T10:00:00Z', '2026-02-03T10:00:00Z'],
  });
  assert.equal(privateOutcome.status, 'rejected');
  assert.ok(privateOutcome.reason?.toLowerCase().includes('private'));

  // 2. Forked repo with 0 user commits -> rejected
  const forkZeroCommits = validateGitHubRepoProof({
    owner: 'arjun-mehta',
    repo: 'react-fork',
    username: 'arjun-mehta',
    isFork: true,
    userCommitDates: [],
  });
  assert.equal(forkZeroCommits.status, 'rejected');
  assert.ok(forkZeroCommits.reason?.toLowerCase().includes('fork'));

  // 3. Forked repo with >= 3 commits across multiple days -> valid
  const forkWithCommits = validateGitHubRepoProof({
    owner: 'arjun-mehta',
    repo: 'react-fork',
    username: 'arjun-mehta',
    isFork: true,
    userCommitDates: [
      '2026-01-10T10:00:00Z',
      '2026-01-12T14:00:00Z',
      '2026-01-15T09:00:00Z',
    ],
  });
  assert.equal(forkWithCommits.status, 'valid');
  assert.equal(forkWithCommits.weakEvidenceWarning, undefined);

  // 4. Weak evidence warning: fewer than 3 commits (still valid, not rejected)
  const weakFewCommits = validateGitHubRepoProof({
    owner: 'arjun-mehta',
    repo: 'mini-tool',
    username: 'arjun-mehta',
    isFork: false,
    userCommitDates: ['2026-02-01T10:00:00Z', '2026-02-02T10:00:00Z'],
  });
  assert.equal(weakFewCommits.status, 'valid');
  assert.ok(weakFewCommits.weakEvidenceWarning?.toLowerCase().includes('weak evidence'));

  // 5. Skill detection from languages, tree, and package.json
  const repoInspection = {
    owner: 'arjun-mehta',
    repo: 'telemetry-cloud-ui',
    username: 'arjun-mehta',
    languages: { TypeScript: 42000, CSS: 5000 },
    treePaths: [
      'package.json',
      'tsconfig.json',
      'Dockerfile',
      '.github/workflows/ci.yml',
      'src/App.tsx',
      'tests/app.test.ts',
    ],
    packageJsonDeps: {
      react: '^19.0.0',
      express: '^5.0.0',
      vitest: '^3.0.0',
    },
    userCommitDates: [
      '2026-01-01T10:00:00Z',
      '2026-01-02T10:00:00Z',
      '2026-01-03T10:00:00Z',
    ],
  };

  const detected = detectSkillsFromGitHubRepo(repoInspection);
  const skillNames = detected.map((d) => d.skill);
  assert.ok(skillNames.includes('TypeScript'));
  assert.ok(skillNames.includes('React'));
  assert.ok(skillNames.includes('Node.js'));
  assert.ok(skillNames.includes('Docker'));
  assert.ok(skillNames.includes('CI/CD'));
  assert.ok(skillNames.includes('Unit Testing'));

  // Skill becomes verified only if repo is valid AND signal is present
  assert.equal(canGitHubRepoVerifySkill(forkWithCommits, detected, 'TypeScript'), true);
  assert.equal(canGitHubRepoVerifySkill(forkWithCommits, detected, 'Kubernetes'), false);
  assert.equal(canGitHubRepoVerifySkill(privateOutcome, detected, 'TypeScript'), false);
});

test('Part 3: JD-to-Profile Gap Analysis with known and unknown skills', () => {
  const ctx: SkillStatusContext = {
    profile: {
      name: 'Arjun',
      title: 'Full-Stack Engineer',
      role: 'Job seeker',
      location: 'Bengaluru',
      education: 'B.Tech',
      skills_text: 'React, Node.js, SQL',
      resume_text: 'Built services with React, Node.js, and SQL.',
    },
    evidence: [
      {
        id: 1,
        skillId: 'React',
        skill: 'React',
        type: 'github',
        title: 'react-dashboard',
        status: 'valid',
      },
    ],
  };

  const jdExtraction = {
    roleTitle: 'Senior Platform Engineer',
    company: 'CloudScale',
    seniority: 'Senior',
    mustHave: [
      {
        skill: 'ReactJS', // alias -> React (verified = 1.0, core weight = 3 => 3.0)
        importance: 'core' as const,
        quote: '5+ years building production UIs in ReactJS.',
      },
      {
        skill: 'Node', // alias -> Node.js (declared = 0.4, core weight = 3 => 1.2)
        importance: 'core' as const,
        quote: 'Design low-latency microservices in Node.',
      },
      {
        skill: 'Temporal Workflow Engine', // unknown skill -> missing = 0, important weight = 2 => 0
        importance: 'important' as const,
        quote: 'Experience orchestrating jobs with Temporal Workflow Engine.',
      },
      {
        skill: 'Docker', // known skill -> missing = 0, important weight = 2 => 0
        importance: 'important' as const,
        quote: 'Containerize services with Docker.',
      },
    ],
    niceToHave: [
      {
        skill: 'Postgres', // alias -> SQL (declared = 0.4, nice-to-have weight = 1 => 0.4)
        quote: 'Familiarity with Postgres indexing is a plus.',
      },
    ],
    responsibilities: ['Architect distributed services'],
    softSkills: ['Technical mentorship'],
    experienceRequired: '4+ years',
    redFlags: [],
  };

  const gapResult = computeJdGapAnalysis({
    extraction: jdExtraction,
    context: ctx,
  });

  // Total weights = 3 + 3 + 2 + 2 + 1 = 11
  // Total weighted points = (1.0 * 3) + (0.4 * 3) + (0 * 2) + (0 * 2) + (0.4 * 1) = 3 + 1.2 + 0 + 0 + 0.4 = 4.6
  // Expected score = Math.round((4.6 / 11) * 100) = Math.round(41.818) = 42
  assert.equal(gapResult.totalPossibleWeight, 11);
  assert.equal(gapResult.totalWeightedPoints, 4.6);
  assert.equal(gapResult.score, 42);
  assert.equal(gapResult.confidence, 'High'); // 5 skills extracted

  // Verify unknown skill is preserved as a separate entry
  const unknownEntry = gapResult.allEvaluatedSkills.find(
    (s) => s.skill === 'Temporal Workflow Engine'
  );
  assert.ok(unknownEntry, 'Unknown JD skill should be preserved as a separate entry');
  assert.equal(unknownEntry?.isKnown, false);
  assert.equal(unknownEntry?.status, 'missing');

  // Verify groups
  assert.equal(gapResult.youCanProve.length, 1);
  assert.equal(gapResult.youCanProve[0].skill, 'React');
  assert.equal(gapResult.needsProof.length, 2); // Node.js and SQL
  assert.equal(gapResult.gaps.length, 2); // Temporal Workflow Engine and Docker
  assert.equal(gapResult.whatToDoFirst.length, 3);
});
