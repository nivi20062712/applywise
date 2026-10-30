import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stripReasoningAndFences,
  parseAndValidateModelJson,
  validateAnalysis,
  validateProofTask,
  getAIProviderStatus,
  MODELS,
} from '../server/analyzer';
import {
  scoreProofStrength,
  evaluateSkillProofSummary,
  DEMO_PROFILES,
} from '../src/utils/skillMatcher';

test('stripReasoningAndFences removes <think> blocks and markdown code fences', () => {
  const raw = `<think>
Let me evaluate the candidate's skills and format as JSON...
</think>
\`\`\`json
{
  "title": "TypeScript CLI Proof",
  "estimatedTime": "2 hours",
  "goal": "Build a strict CLI parser",
  "steps": ["Step 1", "Step 2"],
  "acceptanceChecklist": ["Check 1", "Check 2"],
  "recommendedProofToLink": "GitHub repository"
}
\`\`\``;

  const cleaned = stripReasoningAndFences(raw);
  assert.ok(!cleaned.includes('<think>'));
  assert.ok(!cleaned.includes('```'));
  assert.ok(cleaned.startsWith('{'));
});

test('parseAndValidateModelJson parses fenced JSON with reasoning prefix and validates schema', () => {
  const rawWithNoise = `Here is the analysis output:
<think>Analyzing candidate evidence...</think>
\`\`\`json
{
  "readinessScore": 86,
  "scoreBreakdown": {
    "skillMatch": 88,
    "evidenceStrength": 85,
    "experienceRelevance": 84
  },
  "summary": "Strong verified engineering readiness.",
  "matchedSkills": [],
  "missingSkills": [],
  "unprovenSkills": [],
  "sevenDayPlan": []
}
\`\`\`
Hope this helps!`;

  const parsed = parseAndValidateModelJson(rawWithNoise, validateAnalysis);
  assert.ok(parsed !== null);
  assert.equal(parsed?.readinessScore, 86);
  assert.equal(parsed?.scoreBreakdown.skillMatch, 88);
});

test('parseAndValidateModelJson returns null on malformed JSON or invalid schema', () => {
  const brokenJson = `\`\`\`json { "readinessScore": "not-a-number" } \`\`\``;
  const parsed = parseAndValidateModelJson(brokenJson, validateAnalysis);
  assert.equal(parsed, null);

  const invalidProof = `{"title": "Too incomplete"}`;
  const parsedProof = parseAndValidateModelJson(invalidProof, validateProofTask);
  assert.equal(parsedProof, null);
});

test('scoreProofStrength classifies GitHub/deployment links as strong, certs as moderate, and self-reported as weak', () => {
  assert.equal(
    scoreProofStrength({
      skill: 'React',
      type: 'GitHub link',
      title: 'Telemetry UI Repo',
      url: 'https://github.com/arjun-mehta/telemetry-cloud-ui',
    }),
    'strong'
  );

  assert.equal(
    scoreProofStrength({
      skill: 'Node.js',
      type: 'deployment',
      title: 'Live API Service',
      url: 'https://api-demo.vercel.app',
    }),
    'strong'
  );

  assert.equal(
    scoreProofStrength({
      skill: 'Docker',
      type: 'certificate',
      title: 'Coursera Container Certificate',
      url: 'https://www.coursera.org/verify/DOCKER123',
    }),
    'moderate'
  );

  assert.equal(
    scoreProofStrength({
      skill: 'DBMS',
      type: 'document',
      title: 'Uploaded Transcript',
      attachment_name: 'dbms_certificate.pdf',
    }),
    'moderate'
  );

  assert.equal(
    scoreProofStrength({
      skill: 'Kubernetes',
      type: 'self-reported',
      title: 'Used in university lab',
      url: '',
    }),
    'weak'
  );
});

test('evaluateSkillProofSummary computes overall proof tier and meter percentage accurately', () => {
  const evidence = [
    {
      skill: 'TypeScript',
      type: 'GitHub link',
      title: 'TS RPC Library',
      url: 'https://github.com/user/ts-rpc',
    },
    {
      skill: 'AWS',
      type: 'certificate',
      title: 'AWS Cloud Practitioner',
      url: 'https://www.credly.com/badges/123',
    },
    {
      skill: 'GraphQL',
      type: 'self-reported',
      title: 'Mentioned in summary',
      url: '',
    },
  ];

  const tsSummary = evaluateSkillProofSummary('TypeScript', evidence);
  assert.equal(tsSummary.overallTier, 'strong');
  assert.equal(tsSummary.meterPercent, 100);

  const awsSummary = evaluateSkillProofSummary('AWS', evidence);
  assert.equal(awsSummary.overallTier, 'moderate');
  assert.equal(awsSummary.meterPercent, 68);

  const gqlSummary = evaluateSkillProofSummary('GraphQL', evidence);
  assert.equal(gqlSummary.overallTier, 'weak');
  assert.equal(gqlSummary.meterPercent, 35);

  const rustSummary = evaluateSkillProofSummary('Rust', evidence);
  assert.equal(rustSummary.overallTier, 'none');
  assert.equal(rustSummary.items.length, 0);
});

test('MODELS registry and getAIProviderStatus expose boolean flags and valid demo presets', () => {
  assert.ok(MODELS.length >= 3);
  assert.ok(MODELS.some((m) => m.id.includes('nemotron')));
  assert.ok(MODELS.some((m) => m.provider === 'nebius'));

  const status = getAIProviderStatus();
  assert.equal(typeof status.nvidiaConfigured, 'boolean');
  assert.equal(typeof status.nebiusConfigured, 'boolean');
  assert.equal(typeof status.geminiConfigured, 'boolean');
  assert.ok(Array.isArray(status.models));
  assert.ok(DEMO_PROFILES.length >= 2);
});
