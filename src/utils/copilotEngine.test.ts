import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClientCopilotVault,
  buildCloseTheGapStructured,
  buildFastestSkillsStructured,
  buildHonestResumePhrasingStructured,
  buildHonestRewriteStructured,
  buildProofVaultContext,
  buildProofVaultSystemPrompt,
  buildRoleComparisonStructured,
  buildUnifiedCopilotSystemPrompt,
  buildWeekendProjectStructured,
  buildWhyThisScoreStructured,
  DEFAULT_NEMOTRON_FAST_MODEL,
  DEFAULT_NEMOTRON_ULTRA_MODEL,
  resolveCopilotModelRoute,
  routeQuestionModelTier,
} from './copilotEngine';
import { EvidenceItem, Profile } from '../types';

const sampleProfile: Profile = {
  id: 1,
  user_id: 1,
  name: 'Arjun Mehta',
  title: 'Full-Stack Software Engineer',
  role: 'Job seeker',
  location: 'Bengaluru, India',
  education: 'B.Tech CSE',
  skills_text: 'React, TypeScript, JavaScript, Node.js, SQL, Git',
  resume_text: 'Experienced with React, TypeScript, JavaScript, Node.js, SQL, and Git.',
  github_username: 'arjun-mehta',
};

const sampleEvidence: EvidenceItem[] = [
  {
    id: 101,
    skill: 'React',
    skillId: 'React',
    type: 'github',
    title: 'arjun-mehta/telemetry-cloud-ui',
    url: 'https://github.com/arjun-mehta/telemetry-cloud-ui',
    status: 'valid',
  },
  {
    id: 102,
    skill: 'TypeScript',
    skillId: 'TypeScript',
    type: 'github',
    title: 'arjun-mehta/ts-rpc-schema',
    url: 'https://github.com/arjun-mehta/ts-rpc-schema',
    status: 'valid',
  },
];

describe('Copilot Engine & Proof Vault Context', () => {
  it('routes FAST model for quick chips, honest rewrite, and why_this_score', () => {
    const r1 = resolveCopilotModelRoute({ task: 'chip_fastest_skills' });
    assert.equal(r1.tier, 'fast');
    assert.equal(r1.modelId, DEFAULT_NEMOTRON_FAST_MODEL);
    assert.equal(r1.tierLabel, 'Fast');

    const r2 = resolveCopilotModelRoute({ task: 'honest_rewrite' });
    assert.equal(r2.tier, 'fast');

    const r3 = resolveCopilotModelRoute({ task: 'why_this_score' });
    assert.equal(r3.tier, 'fast');
  });

  it('routes ULTRA model for role comparison, weekend project, and 7-day roadmap', () => {
    const r1 = resolveCopilotModelRoute({ task: 'chip_compare_roles' });
    assert.equal(r1.tier, 'ultra');
    assert.equal(r1.modelId, DEFAULT_NEMOTRON_ULTRA_MODEL);
    assert.equal(r1.tierLabel, 'Deep reasoning');

    const r2 = resolveCopilotModelRoute({ task: 'chip_weekend_project' });
    assert.equal(r2.tier, 'ultra');

    const r3 = resolveCopilotModelRoute({ task: 'close_the_gap' });
    assert.equal(r3.tier, 'ultra');
  });

  it('falls back to FAST model with a flag if ULTRA model is unavailable on startup', () => {
    const r = resolveCopilotModelRoute({
      task: 'chip_compare_roles',
      ultraModelAvailable: false,
    });
    assert.equal(r.tier, 'fast');
    assert.equal(r.modelId, DEFAULT_NEMOTRON_FAST_MODEL);
    assert.equal(r.usedFallbackToFast, true);
  });

  it('serializes Proof Vault context into Step 3 system prompt JSON without overclaiming', () => {
    const vault = buildProofVaultContext({
      profile: sampleProfile,
      evidence: sampleEvidence,
      viewerMode: 'jobseeker',
    });

    assert.equal(vault.role, 'job seeker');
    assert.equal(vault.candidateName, 'Arjun Mehta');
    const reactEntry = vault.skills.find((s) => s.skill === 'React');
    const nodeEntry = vault.skills.find((s) => s.skill === 'Node.js');

    assert.ok(reactEntry);
    assert.equal(reactEntry.status, 'verified');
    assert.equal(reactEntry.proofs.length, 1);

    assert.ok(nodeEntry);
    assert.equal(nodeEntry.status, 'self-declared');
    assert.equal(nodeEntry.proofs.length, 0);

    const sysPrompt = buildProofVaultSystemPrompt(vault);
    assert.ok(sysPrompt.includes('Answer the user\'s ACTUAL question directly in the first sentence.'));
    assert.ok(sysPrompt.includes('Never invent verified skills, projects, or certificates.'));
    assert.ok(sysPrompt.includes('"userMode":"job seeker"'));
  });

  it('tailors userMode for student role in system prompt', () => {
    const studentVault = buildProofVaultContext({
      profile: { ...sampleProfile, role: 'Student' },
      evidence: sampleEvidence,
      viewerMode: 'student',
    });
    assert.equal(studentVault.role, 'student');
    const sysPrompt = buildProofVaultSystemPrompt(studentVault);
    assert.ok(sysPrompt.includes('"userMode":"student"'));
  });

  it('generates structured JSON for all 4 suggestion chips and 3 extra features', () => {
    const vault = buildProofVaultContext({
      profile: sampleProfile,
      evidence: sampleEvidence,
      viewerMode: 'jobseeker',
    });

    const chip1 = buildFastestSkillsStructured(vault);
    assert.equal(chip1.cards.length, 2);
    assert.ok(chip1.cards[0].estimatedScoreGain > 0);
    assert.ok(chip1.cards[0].fastestProofToAdd.length > 10);

    const chip2 = buildWeekendProjectStructured(vault);
    assert.equal(chip2.hourByHourPlan.length, 4);
    assert.ok(chip2.deliverables.length >= 3);
    assert.ok(chip2.exactProofArtifact.suggestedRepoName.length > 3);

    const chip3 = buildRoleComparisonStructured(vault);
    assert.equal(chip3.enterpriseRole.trackType, 'Enterprise Product');
    assert.equal(chip3.governmentRole.trackType, 'UPSC / NIC Scientist-B');
    assert.ok(chip3.enterpriseRole.keyGaps.length > 0);

    const chip4 = buildHonestResumePhrasingStructured(vault);
    assert.ok(chip4.items.length > 0);
    assert.ok(chip4.items[0].honestBullet.toLowerCase().includes('familiar with'));

    const rewriteHighRisk = buildHonestRewriteStructured(
      vault,
      'Spearheaded company-wide Kubernetes clusters serving millions of users with 99.99% uptime',
      'Kubernetes'
    );
    assert.equal(rewriteHighRisk.claimRisk, 'high');
    assert.ok(rewriteHighRisk.removedUnverifiableClaims.length >= 1);

    const rewriteLowRisk = buildHonestRewriteStructured(
      vault,
      'Built React telemetry UI components with TypeScript',
      'React'
    );
    assert.equal(rewriteLowRisk.claimRisk, 'low');
    assert.ok(rewriteLowRisk.groundedProofUsed?.includes('telemetry-cloud-ui'));

    const whyScore = buildWhyThisScoreStructured(vault, {
      roleTitle: 'Frontend Engineer',
      company: 'Razorpay',
      score: 68,
    });
    assert.equal(whyScore.score, 68);
    assert.ok(whyScore.topMatchingSkills.length <= 3);
    assert.ok(whyScore.topMissingSkills.length <= 3);

    const closeGap = buildCloseTheGapStructured(vault, true);
    assert.equal(closeGap.days.length, 7);
    assert.equal(closeGap.savedToAccount, true);
  });

  it('routes questions to Fast or Deep reasoning based on planning/comparison/why/how/roadmap vs simple questions', () => {
    const q1 = routeQuestionModelTier('Make me a 30-day plan to learn Python');
    assert.equal(q1.tier, 'ultra');
    assert.equal(q1.tierLabel, 'Deep reasoning');

    const q2 = routeQuestionModelTier('What is the difference between Java and C++ in interviews?');
    assert.equal(q2.tier, 'ultra');
    assert.equal(q2.tierLabel, 'Deep reasoning');

    const q3 = routeQuestionModelTier('Explain what a REST API is simply');
    assert.equal(q3.tier, 'fast');
    assert.equal(q3.tierLabel, 'Fast');

    const q4 = routeQuestionModelTier('My résumé has only 2 verified skills, am I ready to apply?');
    assert.equal(q4.tier, 'fast');
    assert.equal(q4.tierLabel, 'Fast');

    const q5 = routeQuestionModelTier('make that plan 14 days instead');
    assert.equal(q5.tier, 'ultra');
    assert.equal(q5.tierLabel, 'Deep reasoning');
  });

  it('builds unified Copilot vault and Step 3 system prompt JSON', () => {
    const clientVault = buildClientCopilotVault({
      profile: sampleProfile,
      evidence: sampleEvidence,
      targetRole: 'Full-Stack Software Engineer',
    });

    assert.ok(clientVault.verified.some((v) => v.skill === 'React'));
    assert.ok(clientVault.selfDeclared.some((d) => d.skill === 'Node.js'));

    const sysPrompt = buildUnifiedCopilotSystemPrompt({
      targetRole: 'Full-Stack Software Engineer',
      mode: 'jobseeker',
      vault: clientVault,
    });
    assert.ok(sysPrompt.includes('"targetRole":"Full-Stack Software Engineer"'));
    assert.ok(sysPrompt.includes('"status":"verified"'));
    assert.ok(sysPrompt.includes('"status":"self-declared"'));
  });
});
