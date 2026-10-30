import {
  AnalysisData,
  AttachmentItem,
  CloseTheGapResult,
  CopilotModelTier,
  CopilotStructuredTask,
  CopilotVaultItem,
  CopilotVaultPayload,
  EvidenceItem,
  FastestSkillCardItem,
  HonestResumePhraseItem,
  HonestRewriteResult,
  Profile,
  ProofVaultContext,
  ProofVaultSkillEntry,
  RoleComparisonTableData,
  WeekendProjectPlanData,
  WhyThisScoreResult,
} from '../types';
import {
  getSkillStatus,
  getValidEvidenceForSkill,
  normalizeEvidenceItem,
  SkillStatusContext,
} from './evidenceModel';
import {
  calculateReadinessScore,
  GOVERNMENT_SECTOR_CATALOG,
  identifySkills,
  IT_JOB_ROLES,
} from './skillMatcher';

export const DEFAULT_NEMOTRON_ULTRA_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';
export const DEFAULT_NEMOTRON_FAST_MODEL = 'nvidia/nemotron-3-nano-omni';
export const NEBIUS_TOKEN_FACTORY_BASE_URL = 'https://api.tokenfactory.nebius.com/v1/';

export interface ModelRouteDecision {
  tier: CopilotModelTier;
  tierLabel: 'Fast' | 'Deep reasoning';
  modelId: string;
  usedFallbackToFast: boolean;
  reason: string;
}

/**
 * Step 1: Model routing logic
 * - FAST model: quick chips (fastest skills, honest résumé phrasing), résumé phrasing (honest_rewrite), short explanations (why_this_score, short chat).
 * - ULTRA model: comparing roles (chip_compare_roles), readiness roadmap (close_the_gap), project design (chip_weekend_project), deep reasoning chat.
 */
export function resolveCopilotModelRoute(options: {
  task?: CopilotStructuredTask | 'chat';
  message?: string;
  fastModelId?: string;
  ultraModelId?: string;
  ultraModelAvailable?: boolean;
}): ModelRouteDecision {
  const fastModel = (options.fastModelId || DEFAULT_NEMOTRON_FAST_MODEL).trim();
  const ultraModel = (options.ultraModelId || DEFAULT_NEMOTRON_ULTRA_MODEL).trim();
  const ultraAvailable = options.ultraModelAvailable !== false;

  const task = options.task || 'chat';
  let desiredTier: CopilotModelTier = 'fast';
  let reason = 'Fast model selected for quick chips, résumé phrasing, or concise explanations.';

  if (
    task === 'chip_compare_roles' ||
    task === 'chip_weekend_project' ||
    task === 'close_the_gap'
  ) {
    desiredTier = 'ultra';
    reason =
      task === 'chip_compare_roles'
        ? 'Ultra model selected for multi-track role comparison.'
        : task === 'chip_weekend_project'
        ? 'Ultra model selected for hour-by-hour project architecture design.'
        : 'Ultra model selected for 7-day readiness roadmap synthesis.';
  } else if (
    task === 'chip_fastest_skills' ||
    task === 'chip_honest_resume' ||
    task === 'honest_rewrite' ||
    task === 'why_this_score'
  ) {
    desiredTier = 'fast';
  } else if (task === 'chat') {
    const q = (options.message || '').trim();
    const isDeepQuery =
      /\b(plan|planning|roadmap|compare|comparing|comparison|vs|versus|difference between|differ|why|how|design|architecture|strategy|\d+-day|\d+ day|week-by-week)\b/i.test(
        q
      );
    if (isDeepQuery) {
      desiredTier = 'ultra';
      reason = 'Ultra model selected for planning, comparison, roadmap, or why/how reasoning query.';
    }
  }

  if (desiredTier === 'ultra') {
    if (!ultraAvailable) {
      return {
        tier: 'fast',
        tierLabel: 'Fast',
        modelId: fastModel,
        usedFallbackToFast: true,
        reason: `${reason} (Ultra model unavailable on endpoint; fell back to Fast model ${fastModel}).`,
      };
    }
    return {
      tier: 'ultra',
      tierLabel: 'Deep reasoning',
      modelId: ultraModel,
      usedFallbackToFast: false,
      reason,
    };
  }

  return {
    tier: 'fast',
    tierLabel: 'Fast',
    modelId: fastModel,
    usedFallbackToFast: false,
    reason,
  };
}

/**
 * Step 2: Build a compact JSON "proof vault" from the logged-in user's real data.
 * Never trusts AI for skill status; uses getSkillStatus() from the shared evidence model.
 */
export function buildProofVaultContext(params: {
  profile: Profile | null;
  evidence: EvidenceItem[];
  attachments?: AttachmentItem[];
  analysis?: AnalysisData | null;
  viewerMode?: 'student' | 'jobseeker' | string;
  targetRoleOverride?: string;
}): ProofVaultContext {
  const {
    profile,
    evidence = [],
    attachments = [],
    analysis = null,
    viewerMode,
    targetRoleOverride,
  } = params;

  const rawRole = String(viewerMode || profile?.role || 'jobseeker').toLowerCase();
  const normalizedRole: 'student' | 'job seeker' = rawRole.includes('student')
    ? 'student'
    : 'job seeker';

  const targetRole =
    (targetRoleOverride || '').trim() ||
    analysis?.jobTitle ||
    profile?.title ||
    'Full-Stack Software Engineer';
  const targetCompany = analysis?.company || 'Enterprise Product Team';

  const statusCtx: SkillStatusContext = {
    evidence,
    profile,
    attachments,
  };

  // Find role required skills from analysis or catalog
  const matchedCatalogRole =
    IT_JOB_ROLES.find((r) => r.title.toLowerCase() === targetRole.toLowerCase()) ||
    IT_JOB_ROLES[0];

  const analysisSkills = analysis
    ? [
        ...(analysis.matchedSkills || []).map((m) => m.skill),
        ...(analysis.unprovenSkills || []).map((u) => u.skill),
        ...(analysis.missingSkills || []).map((m) => m.skill),
      ]
    : [];

  const profileDeclared = identifySkills(
    `${profile?.skills_text || ''} ${profile?.resume_text || ''}`
  );
  const evidenceSkills = evidence.map((e) => e.skill || e.skillId || '').filter(Boolean);

  const universe = Array.from(
    new Set([
      ...(analysisSkills.length > 0 ? analysisSkills : matchedCatalogRole.skills),
      ...profileDeclared,
      ...evidenceSkills,
    ])
  ).filter(Boolean);

  const highImportanceSet = new Set([
    'React',
    'TypeScript',
    'JavaScript',
    'Node.js',
    'Python',
    'SQL',
    'System Design',
    'Data Structures & Algorithms',
    'Unit Testing',
    'Docker',
  ]);

  const skills: ProofVaultSkillEntry[] = universe.map((skill, idx) => {
    const computedStatus = getSkillStatus(skill, statusCtx);
    const validProofs = getValidEvidenceForSkill(skill, evidence);
    const importance: 'high' | 'medium' =
      highImportanceSet.has(skill) || idx < 4 ? 'high' : 'medium';

    const mappedStatus: ProofVaultSkillEntry['status'] =
      computedStatus === 'verified'
        ? 'verified'
        : computedStatus === 'declared'
        ? 'self-declared'
        : 'missing';

    return {
      skill,
      status: mappedStatus,
      importance,
      proofs: validProofs.map((p) => ({
        id: p.id,
        type: p.type,
        title: p.title,
        url: p.url || undefined,
        trust: (p.details?.trust as string | undefined) || 'high',
      })),
    };
  });

  const verifiedCount = skills.filter((s) => s.status === 'verified').length;
  const selfDeclaredCount = skills.filter(
    (s) => s.status === 'self-declared' || s.status === 'needs proof'
  ).length;
  const missingCount = skills.filter((s) => s.status === 'missing').length;

  // Compute readiness score deterministically if not provided
  const roleSkillCount = Math.max(
    1,
    analysisSkills.length > 0 ? analysisSkills.length : matchedCatalogRole.skills.length
  );
  const computedMetrics = calculateReadinessScore({
    matchedCount: Math.min(roleSkillCount, verifiedCount + selfDeclaredCount),
    totalRequired: roleSkillCount,
    verifiedEvidenceCount: verifiedCount,
  });

  const readinessScore =
    typeof analysis?.readinessScore === 'number' && analysis.readinessScore > 0
      ? analysis.readinessScore
      : computedMetrics.score;

  const normalizedProofItems = evidence.map((raw) => {
    const norm = normalizeEvidenceItem(raw);
    return {
      id: norm.id,
      skill: norm.skillId || norm.skill,
      type: norm.type,
      title: norm.title,
      url: norm.url || undefined,
      status: norm.status,
    };
  });

  return {
    role: normalizedRole,
    candidateName: profile?.name || 'Candidate',
    targetRole,
    targetCompany,
    readinessScore,
    skills,
    proofItems: normalizedProofItems,
    summaryCounts: {
      verified: verifiedCount,
      selfDeclared: selfDeclaredCount,
      missing: missingCount,
      totalProofs: normalizedProofItems.filter((p) => p.status === 'valid').length,
    },
  };
}

/**
 * Step 2: Inject the user's compact Proof Vault JSON into the system prompt with strict rules.
 */
export function buildProofVaultSystemPrompt(vault: ProofVaultContext): string {
  const liveVaultJson = {
    userMode: vault.role,
    candidateName: vault.candidateName,
    targetRole: vault.targetRole,
    readinessPercentage: `${vault.readinessScore}%`,
    skills: vault.skills.map((s) => ({
      skill: s.skill,
      status: s.status === 'needs proof' ? 'self-declared' : s.status,
      proof:
        s.proofs.length > 0
          ? s.proofs.map((p) => ({
              type: p.type,
              title: p.title,
              url: p.url,
            }))
          : null,
    })),
  };

  return [
    'You are the ApplyWise AI Career Readiness Copilot, a practical software engineering and career mentor.',
    '',
    'RULES:',
    '- Answer the user\'s ACTUAL question directly in the first sentence. No fixed template, no repeating their question back, no mandatory sections.',
    '- Use the vault data only when relevant. Never invent verified skills, projects, or certificates.',
    '- Match the question\'s type: a how-to gets steps, a comparison gets a table, a quick question gets 2-3 sentences, small talk gets a normal reply.',
    '- Be specific and practical (tools, hours, examples), and ask ONE clarifying question only when the request is truly ambiguous.',
    '- For general career or coding questions outside the vault, answer them normally as a helpful mentor.',
    '- Keep it concise. Use markdown only when it helps.',
    '',
    'USER LIVE PROOF VAULT JSON:',
    JSON.stringify(liveVaultJson),
  ].join('\n');
}

/**
 * Step 3 Chip #1: "Which 2 skills will raise my readiness score the fastest?"
 * Returns structured JSON (skill, why, estimated score gain, fastest proof to add)
 */
export function buildFastestSkillsStructured(
  vault: ProofVaultContext
): {
  headline: string;
  currentReadinessScore: number;
  projectedCombinedScore: number;
  cards: FastestSkillCardItem[];
} {
  // Prioritize self-declared ("needs proof") high-importance skills first because converting 0.4 -> 1.0 is fastest,
  // or high-importance missing skills if fewer than 2 self-declared exist.
  const declaredCandidates = vault.skills.filter(
    (s) => s.status === 'self-declared' || s.status === 'needs proof'
  );
  const missingCandidates = vault.skills.filter((s) => s.status === 'missing');

  const ordered = [
    ...declaredCandidates.filter((s) => s.importance === 'high'),
    ...missingCandidates.filter((s) => s.importance === 'high'),
    ...declaredCandidates.filter((s) => s.importance !== 'high'),
    ...missingCandidates.filter((s) => s.importance !== 'high'),
  ];

  const picked = ordered.slice(0, 2);
  if (picked.length === 0) {
    picked.push(
      {
        skill: 'Unit Testing',
        status: 'self-declared',
        importance: 'high',
        proofs: [],
      },
      {
        skill: 'Docker',
        status: 'missing',
        importance: 'high',
        proofs: [],
      }
    );
  } else if (picked.length === 1) {
    const fallbackSecond =
      picked[0].skill === 'Unit Testing' ? 'System Design' : 'Unit Testing';
    picked.push({
      skill: fallbackSecond,
      status: 'missing',
      importance: 'high',
      proofs: [],
    });
  }

  const totalSkills = Math.max(5, vault.skills.length);
  const cards: FastestSkillCardItem[] = picked.map((entry, index) => {
    const isDeclared = entry.status === 'self-declared' || entry.status === 'needs proof';
    const rawGain = isDeclared
      ? Math.max(7, Math.min(14, Math.round((100 / totalSkills) * 0.75)))
      : Math.max(9, Math.min(16, Math.round((100 / totalSkills) * 0.95)));
    const gain = index === 0 ? rawGain : Math.max(6, rawGain - 2);

    const proofSuggestionBySkill: Record<
      string,
      { proof: string; deliverable: string; time: string }
    > = {
      'Unit Testing': {
        proof:
          'Link a GitHub repo containing Vitest/Jest test files (*.test.ts) and a passing GitHub Actions workflow.',
        deliverable: 'Add 6+ unit tests covering edge cases + .github/workflows/ci.yml',
        time: '90 mins',
      },
      TypeScript: {
        proof:
          'Link a public GitHub repository with tsconfig.json ("strict": true) and typed API schemas.',
        deliverable: 'Strict TypeScript module + unit test suite in a public GitHub repo',
        time: '1.5 hours',
      },
      React: {
        proof:
          'Link a GitHub repository with modular React components, state hooks, and component tests.',
        deliverable: 'Interactive React feature repo with README architecture notes',
        time: '2 hours',
      },
      'Node.js': {
        proof:
          'Link a GitHub repo with an Express/Fastify REST API, request validation, and integration tests.',
        deliverable: 'REST endpoint + supertest suite + README API docs',
        time: '2 hours',
      },
      SQL: {
        proof:
          'Upload a schema.sql + query benchmark file or link a repository with migrations and indexed queries.',
        deliverable: 'Normalized SQL schema + 4 analytical queries with EXPLAIN notes',
        time: '90 mins',
      },
      Docker: {
        proof:
          'Link a GitHub repo containing a multi-stage Dockerfile and docker-compose.yml.',
        deliverable: 'Multi-stage Dockerfile + healthcheck + container run instructions',
        time: '1 hour',
      },
      Python: {
        proof:
          'Link a GitHub repo with a Python data/API script, requirements.txt, and pytest test cases.',
        deliverable: 'Python CLI/API module with pytest suite',
        time: '2 hours',
      },
    };

    const custom = proofSuggestionBySkill[entry.skill] || {
      proof: `Link a public GitHub repository or verified certificate demonstrating ${entry.skill} in action.`,
      deliverable: `Focused ${entry.skill} mini-project with README and automated tests`,
      time: '2 hours',
    };

    const whyText = isDeclared
      ? `${entry.skill} is already mentioned in your résumé/profile (self-declared), so you only need 1 validated proof artifact to unlock full verified weight for ${vault.targetRole}.`
      : `${entry.skill} is a high-weight requirement for ${vault.targetRole} currently missing from your Proof Vault. Adding 1 concrete repo or certificate closes both the match gap and evidence bonus.`;

    return {
      skill: entry.skill,
      currentStatus: isDeclared ? 'self-declared' : 'missing',
      why: whyText,
      estimatedScoreGain: gain,
      projectedScore: Math.min(100, vault.readinessScore + gain),
      fastestProofToAdd: custom.proof,
      suggestedDeliverable: custom.deliverable,
      estimatedTime: custom.time,
    };
  });

  const combinedGain = cards.reduce((acc, c) => acc + c.estimatedScoreGain, 0);
  const projectedCombinedScore = Math.min(100, vault.readinessScore + combinedGain);

  return {
    headline:
      vault.role === 'student'
        ? `Proving ${cards.map((c) => c.skill).join(' & ')} lifts your ${vault.targetRole} learning readiness from ${vault.readinessScore}% to ~${projectedCombinedScore}%.`
        : `Proving ${cards.map((c) => c.skill).join(' & ')} raises your ${vault.targetRole} hiring readiness from ${vault.readinessScore}% to ~${projectedCombinedScore}%.`,
    currentReadinessScore: vault.readinessScore,
    projectedCombinedScore,
    cards,
  };
}

/**
 * Step 3 Chip #2: "Design a 2-hour weekend project that proves my top unproven skills"
 * Returns a timed plan (hour-by-hour), deliverables, and the exact proof artifact to upload.
 */
export function buildWeekendProjectStructured(
  vault: ProofVaultContext
): WeekendProjectPlanData {
  const unproven = vault.skills
    .filter((s) => s.status === 'self-declared' || s.status === 'needs proof')
    .map((s) => s.skill);
  const missing = vault.skills
    .filter((s) => s.status === 'missing')
    .map((s) => s.skill);
  const verified = vault.skills
    .filter((s) => s.status === 'verified')
    .map((s) => s.skill);

  const targetSkills = [...unproven, ...missing].slice(0, 3);
  if (targetSkills.length === 0) {
    targetSkills.push('Unit Testing', 'Docker');
  }

  const primarySkill = targetSkills[0];
  const secondarySkill = targetSkills[1] || verified[0] || 'TypeScript';
  const anchorVerified = verified[0] ? ` (building on your verified ${verified[0]} repo)` : '';

  const slug = targetSkills
    .slice(0, 2)
    .map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
    .join('-');

  return {
    projectTitle: `2-Hour Proof Sprint: ${targetSkills.slice(0, 2).join(' + ')} Verification Micro-Service`,
    targetSkills,
    overview:
      vault.role === 'student'
        ? `A focused 120-minute weekend build designed for students targeting ${vault.targetRole}${anchorVerified}. You will turn ${targetSkills.join(', ')} from unproven into verified portfolio evidence.`
        : `A production-style 120-minute weekend build for ${vault.targetRole} candidates${anchorVerified}. Converts ${targetSkills.join(', ')} into verifiable code evidence with automated tests.`,
    hourByHourPlan: [
      {
        hour: '0:00 – 0:30 (30m)',
        title: `Scaffold & Core ${primarySkill} Contract`,
        tasks: [
          `Initialize repository with strict configuration and clear folder structure for ${primarySkill}.`,
          `Define core data types, input validation rules, and error handling boundaries.`,
        ],
        output: `Working ${primarySkill} core module with zero lint/type errors.`,
      },
      {
        hour: '0:30 – 1:15 (45m)',
        title: `Implement ${secondarySkill} Integration & Edge Cases`,
        tasks: [
          `Wire ${primarySkill} with ${secondarySkill} to handle realistic inputs, pagination/filtering, or failure recovery.`,
          `Add structured logging and deterministic status responses.`,
        ],
        output: `End-to-end functional flow demonstrating ${ targetSkills.slice(0, 2).join(' + ') } working together.`,
      },
      {
        hour: '1:15 – 1:45 (30m)',
        title: 'Automated Test Suite & CI Proof Signal',
        tasks: [
          `Write 5+ automated assertions (happy path, invalid input rejection, boundary condition).`,
          `Add a .github/workflows/ci.yml workflow or test runner script so ApplyWise’s GitHub verifier detects test coverage.`,
        ],
        output: 'Passing test suite output + CI workflow file.',
      },
      {
        hour: '1:45 – 2:00 (15m)',
        title: 'Architecture README & ApplyWise Proof Link',
        tasks: [
          `Document problem statement, architecture diagram/trade-offs, and exact test commands in README.md.`,
          `Push commits under your GitHub username and attach the repo URL in ApplyWise Proof Vault.`,
        ],
        output: 'Published GitHub repository ready for 1-click verification.',
      },
    ],
    deliverables: [
      `Core implementation demonstrating ${targetSkills.join(', ')} in real code (not boilerplate).`,
      'At least 5 automated unit/integration tests covering edge cases.',
      'README.md with setup instructions, architecture decisions, and sample output.',
      'Clean commit history authored by your GitHub account.',
    ],
    exactProofArtifact: {
      type: 'GitHub Repository',
      suggestedRepoName: `${slug}-proof-service`,
      mustIncludeFiles: [
        'README.md',
        'package.json / tsconfig.json',
        `src/index.ts (${primarySkill} + ${secondarySkill})`,
        'tests/service.test.ts',
        '.github/workflows/ci.yml',
      ],
      howToVerifyInApplyWise: `Open Proof Vault or Skill Readiness → click "Add proof" on ${primarySkill} → choose "Link GitHub repo" and paste https://github.com/<your-username>/${slug}-proof-service.`,
    },
  };
}

/**
 * Step 3 Chip #3: "Compare my readiness for Enterprise Product vs UPSC / NIC Scientist-B"
 * Side-by-side table with score, gaps, and next step for each.
 */
export function buildRoleComparisonStructured(
  vault: ProofVaultContext
): RoleComparisonTableData {
  const verifiedSet = new Set(
    vault.skills.filter((s) => s.status === 'verified').map((s) => s.skill.toLowerCase())
  );
  const declaredSet = new Set(
    vault.skills
      .filter((s) => s.status === 'self-declared' || s.status === 'needs proof')
      .map((s) => s.skill.toLowerCase())
  );

  // Enterprise Product Role requirements
  const enterpriseReq = [
    'React',
    'TypeScript',
    'JavaScript',
    'Node.js',
    'SQL',
    'Unit Testing',
    'Docker',
    'System Design',
  ];
  const entVerified = enterpriseReq.filter((s) => verifiedSet.has(s.toLowerCase()));
  const entDeclared = enterpriseReq.filter(
    (s) => !verifiedSet.has(s.toLowerCase()) && declaredSet.has(s.toLowerCase())
  );
  const entGaps = enterpriseReq.filter(
    (s) => !verifiedSet.has(s.toLowerCase()) && !declaredSet.has(s.toLowerCase())
  );

  const entScore = calculateReadinessScore({
    matchedCount: entVerified.length + entDeclared.length,
    totalRequired: enterpriseReq.length,
    verifiedEvidenceCount: entVerified.length,
  }).score;

  // UPSC / NIC Scientist-B requirements from GOVERNMENT_SECTOR_CATALOG
  const nicCatalog =
    GOVERNMENT_SECTOR_CATALOG.find((g) => g.id.includes('nic')) ||
    GOVERNMENT_SECTOR_CATALOG[0];
  const govReq = nicCatalog
    ? nicCatalog.requiredSkills
    : [
        'Data Structures & Algorithms',
        'Computer Networks',
        'Operating Systems',
        'SQL',
        'Cybersecurity',
        'Java',
        'Python',
      ];

  const govVerified = govReq.filter((s) => verifiedSet.has(s.toLowerCase()));
  const govDeclared = govReq.filter(
    (s) => !verifiedSet.has(s.toLowerCase()) && declaredSet.has(s.toLowerCase())
  );
  const govGaps = govReq.filter(
    (s) => !verifiedSet.has(s.toLowerCase()) && !declaredSet.has(s.toLowerCase())
  );

  const govScore = calculateReadinessScore({
    matchedCount: govVerified.length + govDeclared.length,
    totalRequired: govReq.length,
    verifiedEvidenceCount: govVerified.length,
  }).score;

  const entTopGap = entDeclared[0] || entGaps[0] || 'Unit Testing';
  const govTopGap = govDeclared[0] || govGaps[0] || 'Computer Networks';

  return {
    enterpriseRole: {
      roleName: `Enterprise Product (${vault.targetRole})`,
      trackType: 'Enterprise Product',
      readinessScore: entScore,
      verifiedMatches:
        entVerified.length > 0
          ? entVerified
          : ['No verified enterprise skills yet — attach a GitHub repo'],
      keyGaps: [...entDeclared.map((s) => `${s} (needs proof)`), ...entGaps].slice(0, 4),
      selectionFocus:
        'Production GitHub repositories, automated test coverage, system design trade-offs, and shipping velocity.',
      concreteNextStep: entDeclared.length > 0
        ? `Attach a GitHub repository or test suite to verify your self-declared ${entTopGap} skill.`
        : `Build a 2-hour ${entTopGap} + ${entVerified[0] || 'TypeScript'} microservice and link it in Proof Vault.`,
    },
    governmentRole: {
      roleName: 'NIC / MeitY Scientist-B & UPSC Technical',
      trackType: 'UPSC / NIC Scientist-B',
      readinessScore: govScore,
      verifiedMatches:
        govVerified.length > 0
          ? govVerified
          : ['Core CS fundamentals need formal certificate or repository proof'],
      keyGaps: [...govDeclared.map((s) => `${s} (needs proof)`), ...govGaps].slice(0, 4),
      selectionFocus:
        'GATE/NIC syllabus mastery (DSA, OS, DBMS/SQL, Computer Networks, Cybersecurity) + formal degree/NPTEL certificates.',
      concreteNextStep: `Upload an NPTEL/GATE/university certificate or lab repository covering ${govTopGap} and ${govGaps[1] || 'Data Structures & Algorithms'}.`,
    },
    comparisonVerdict:
      entScore >= govScore
        ? `Your Proof Vault is currently ${entScore - govScore}% stronger for Enterprise Product roles (${entScore}% vs ${govScore}%) thanks to your verified ${entVerified.join(', ') || 'web stack'} evidence.`
        : `Your Proof Vault is currently stronger for UPSC / NIC Scientist-B (${govScore}% vs ${entScore}%), with core CS overlap.`,
    fastestPathRecommendation:
      vault.role === 'student'
        ? `Dual-track tip for students: Proving SQL and Data Structures & Algorithms boosts BOTH your Enterprise Product score and your NIC Scientist-B readiness simultaneously.`
        : `Fastest hiring path: Close your ${entTopGap} proof gap first to cross ${Math.min(100, entScore + 12)}% for Enterprise Product roles while keeping SQL/DSA documented for PSU/NIC notifications.`,
  };
}

/**
 * Step 3 Chip #4: "How should I phrase my self-declared skills honestly on my résumé?"
 * Honest, non-inflated bullet suggestions with wording like "familiar with / built X using Y", never overclaiming.
 */
export function buildHonestResumePhrasingStructured(
  vault: ProofVaultContext
): {
  policySummary: string;
  combinedSkillsLine: string;
  items: HonestResumePhraseItem[];
} {
  const declaredSkills = vault.skills
    .filter((s) => s.status === 'self-declared' || s.status === 'needs proof')
    .map((s) => s.skill);
  const verifiedSkills = vault.skills
    .filter((s) => s.status === 'verified')
    .map((s) => s.skill);

  const targetList =
    declaredSkills.length > 0
      ? declaredSkills.slice(0, 4)
      : ['Node.js', 'SQL', 'Unit Testing'];

  const anchorVerified = verifiedSkills[0] || 'TypeScript';

  const items: HonestResumePhraseItem[] = targetList.map((skill) => ({
    skill,
    status: 'self-declared',
    honestBullet: `Familiar with ${skill} fundamentals; explored ${skill} integration patterns alongside verified ${anchorVerified} coursework/projects.`,
    skillsLineWording: `Familiar with ${skill} (working knowledge)`,
    whyHonest: `Uses transparent framing ("Familiar with ${skill}") instead of claiming production ownership or unverified metrics.`,
    avoidOverclaiming: `Avoid writing "Architected production ${skill} systems" or "Expert in ${skill}" until you attach a valid repository or certificate in your Proof Vault.`,
  }));

  const combinedSkillsLine =
    declaredSkills.length > 0
      ? `Familiar with ${declaredSkills.join(', ')}`
      : 'All listed skills currently have verified proof attached.';

  return {
    policySummary:
      declaredSkills.length > 0
        ? `You have ${declaredSkills.length} self-declared skill${declaredSkills.length === 1 ? '' : 's'} (${declaredSkills.join(', ')}) mentioned in your résumé/profile without attached proof. Place them in a separate "Familiar with…" Skills line rather than inflated achievement bullets.`
        : 'Every skill in your profile currently has verified evidence! Here is how to phrase emerging or self-declared skills honestly before proof is attached.',
    combinedSkillsLine,
    items,
  };
}

/**
 * Step 4a: Résumé Studio "Honest Rewrite"
 * Rewrites a bullet to be stronger without adding unverifiable claims; shows before/after + claimRisk ('low' | 'medium' | 'high').
 */
export function buildHonestRewriteStructured(
  vault: ProofVaultContext,
  originalBullet: string,
  skillHint?: string
): HonestRewriteResult {
  const cleanOriginal = (originalBullet || '').trim();
  const verifiedSkillMap = new Map(
    vault.skills
      .filter((s) => s.status === 'verified')
      .map((s) => [s.skill.toLowerCase(), s])
  );
  const declaredSkillMap = new Map(
    vault.skills
      .filter((s) => s.status === 'self-declared' || s.status === 'needs proof')
      .map((s) => [s.skill.toLowerCase(), s])
  );

  // Detect any inflated or unverifiable claims in originalBullet
  const removedClaims: string[] = [];
  const hasInventedNumbers =
    /\b(\d{2,3}%|\d+x|millions? of users|10,000\+|99\.99%|enterprise-scale|led a team of \d+)\b/i.test(
      cleanOriginal
    ) && !/\[(X%|Y%|N|M)\]/.test(cleanOriginal);

  if (hasInventedNumbers) {
    removedClaims.push('Unverified numeric/scale claims replaced with honest scope or [X%] placeholder');
  }

  const mentionsOverclaimWords =
    /\b(mastered|world-class|spearheaded company-wide|flawless|100% bug-free|architected enterprise)\b/i.test(
      cleanOriginal
    );
  if (mentionsOverclaimWords) {
    removedClaims.push('Hyperbolic adjectives ("world-class", "mastered", "company-wide") removed');
  }

  // Check if the skill is verified in the Proof Vault
  const matchedSkillKey =
    (skillHint && skillHint.toLowerCase()) ||
    Array.from(verifiedSkillMap.keys()).find((k) =>
      cleanOriginal.toLowerCase().includes(k)
    ) ||
    Array.from(declaredSkillMap.keys()).find((k) =>
      cleanOriginal.toLowerCase().includes(k)
    ) ||
    '';

  const verifiedEntry = matchedSkillKey ? verifiedSkillMap.get(matchedSkillKey) : undefined;
  const declaredEntry = matchedSkillKey ? declaredSkillMap.get(matchedSkillKey) : undefined;

  if (verifiedEntry && verifiedEntry.proofs.length > 0) {
    const proof = verifiedEntry.proofs[0];
    const claimRisk: 'low' | 'medium' | 'high' =
      removedClaims.length >= 2 ? 'high' : removedClaims.length === 1 ? 'medium' : 'low';

    const rewrittenBullet = `Engineered modular ${verifiedEntry.skill} components in "${proof.title}", applying structured validation and automated checks to improve reliability across [N] core workflows.`;

    return {
      originalBullet: cleanOriginal,
      rewrittenBullet,
      skill: verifiedEntry.skill,
      claimRisk,
      claimRiskReason:
        claimRisk === 'low'
          ? `Low claim risk: ${verifiedEntry.skill} is backed by verified proof ("${proof.title}") in your Proof Vault.`
          : `Cleaned ${removedClaims.length} unverifiable claim(s) and anchored the bullet directly to your verified artifact "${proof.title}".`,
      removedUnverifiableClaims: removedClaims,
      groundedProofUsed: `${proof.type}: ${proof.title}`,
    };
  }

  if (declaredEntry) {
    removedClaims.push(
      `${declaredEntry.skill} is currently self-declared without attached proof`
    );
    return {
      originalBullet: cleanOriginal,
      rewrittenBullet: `Familiar with ${declaredEntry.skill}; built foundational prototypes and currently preparing repository evidence for ${vault.targetRole} workflows.`,
      skill: declaredEntry.skill,
      claimRisk: 'medium',
      claimRiskReason: `Medium claim risk: ${declaredEntry.skill} is self-declared in your profile with 0 verified proofs. Rewritten to use honest "Familiar with…" phrasing until proof is linked.`,
      removedUnverifiableClaims: removedClaims,
      groundedProofUsed: null,
    };
  }

  // Unknown or missing skill in bullet
  removedClaims.push('No matching verified proof found in Proof Vault for this claim');
  const fallbackVerified = vault.skills.find((s) => s.status === 'verified');
  const fallbackProof = fallbackVerified?.proofs[0];

  return {
    originalBullet: cleanOriginal,
    rewrittenBullet: fallbackVerified
      ? `Implemented ${fallbackVerified.skill} features verified in "${fallbackProof?.title || 'project repository'}", focusing on clean interfaces, maintainable code, and testable outputs.`
      : `Built structured software modules with clear interfaces and documented setup instructions for ${vault.targetRole}.`,
    skill: skillHint || fallbackVerified?.skill || 'Software Engineering',
    claimRisk: 'high',
    claimRiskReason:
      'High claim risk in original text: contained claims not backed by your Proof Vault. Rewritten to strip unverifiable metrics and ground in your real profile.',
    removedUnverifiableClaims: removedClaims,
    groundedProofUsed: fallbackProof ? `${fallbackProof.type}: ${fallbackProof.title}` : null,
  };
}

/**
 * Step 4b: Job Match "Why this score?"
 * AI explanation of a match with the top 3 matching and top 3 missing skills, and one proof task per gap.
 */
export function buildWhyThisScoreStructured(
  vault: ProofVaultContext,
  options?: {
    roleTitle?: string;
    company?: string;
    score?: number;
    matchingSkillsInput?: string[];
    missingSkillsInput?: string[];
  }
): WhyThisScoreResult {
  const roleTitle = options?.roleTitle || vault.targetRole;
  const company = options?.company || vault.targetCompany;
  const score = typeof options?.score === 'number' ? options.score : vault.readinessScore;

  const verifiedEntries = vault.skills.filter((s) => s.status === 'verified');
  const declaredEntries = vault.skills.filter(
    (s) => s.status === 'self-declared' || s.status === 'needs proof'
  );
  const missingEntries = vault.skills.filter((s) => s.status === 'missing');

  const topMatchingSkills = [
    ...verifiedEntries.map((v) => ({
      skill: v.skill,
      status: 'verified' as const,
      evidenceUsed: v.proofs[0]?.title
        ? `${v.proofs[0].type}: ${v.proofs[0].title}`
        : 'Validated proof in vault',
      scoreContribution: '100% credit (1.0 × requirement weight)',
    })),
    ...declaredEntries.map((d) => ({
      skill: d.skill,
      status: 'self-declared' as const,
      evidenceUsed: 'Mentioned in résumé/profile (no proof attached yet)',
      scoreContribution: '40% partial credit (0.4 × requirement weight)',
    })),
  ].slice(0, 3);

  const gapCandidates = [
    ...missingEntries.map((m) => ({
      skill: m.skill,
      gapType: 'missing' as const,
    })),
    ...declaredEntries.map((d) => ({
      skill: d.skill,
      gapType: 'needs proof' as const,
    })),
  ].slice(0, 3);

  const topMissingSkills = gapCandidates.map((g, i) => ({
    skill: g.skill,
    gapType: g.gapType,
    whyCritical:
      g.gapType === 'missing'
        ? `${g.skill} is required for ${roleTitle} at ${company}, and currently contributes 0 pts because it is not in your Proof Vault.`
        : `${g.skill} is only self-declared (0.4x weight); attaching 1 proof artifact upgrades it to full 1.0x verified weight.`,
    proofTask: `Build or link a focused ${g.skill} artifact (public GitHub repo with README + tests, or a verified certificate) in Proof Vault.`,
    estimatedScoreGain: i === 0 ? 11 : i === 1 ? 9 : 7,
  }));

  return {
    roleTitle,
    company,
    score,
    explanationSummary: `Your ${score}% match for ${roleTitle} at ${company} is computed from ${verifiedEntries.length} verified skill(s) at full weight (1.0x), ${declaredEntries.length} self-declared skill(s) at partial weight (0.4x), and ${missingEntries.length} missing gap(s) at 0x. Proving your top gaps below is the fastest way to raise this score.`,
    topMatchingSkills,
    topMissingSkills,
  };
}

/**
 * Step 4c: Skill Readiness "Close the gap"
 * Generates a personalized 7-day proof plan and saves tasks to the user's account.
 */
export function buildCloseTheGapStructured(
  vault: ProofVaultContext,
  savedToAccount = true
): CloseTheGapResult {
  const gapsAndDeclared = [
    ...vault.skills.filter((s) => s.status === 'self-declared' || s.status === 'needs proof'),
    ...vault.skills.filter((s) => s.status === 'missing'),
  ];

  const focusSkills =
    gapsAndDeclared.length > 0
      ? gapsAndDeclared.map((s) => s.skill)
      : ['Unit Testing', 'Docker', 'SQL'];

  const s1 = focusSkills[0] || 'Unit Testing';
  const s2 = focusSkills[1] || s1;
  const s3 = focusSkills[2] || s2;

  const days = [
    {
      day: 1,
      skill: s1,
      title: `Day 1: Scope & Scaffold ${s1} Proof Repository`,
      task: `Create a public GitHub repository focused on ${s1} for ${vault.targetRole}. Add strict config and README problem statement.`,
      proofArtifact: `Public GitHub repo initialized with ${s1} structure`,
      estimatedMinutes: 60,
    },
    {
      day: 2,
      skill: s1,
      title: `Day 2: Core ${s1} Implementation & Happy Path`,
      task: `Implement the core ${s1} workflow with realistic input validation and clean error handling.`,
      proofArtifact: `Committed ${s1} source module under your GitHub username`,
      estimatedMinutes: 90,
    },
    {
      day: 3,
      skill: s1,
      title: `Day 3: Automated Tests & Link ${s1} in Proof Vault`,
      task: `Add 5+ unit/integration tests for ${s1}, push to GitHub, and link the repo in ApplyWise Proof Vault to flip ${s1} to Verified.`,
      proofArtifact: `Passing test file + GitHub link verified in ApplyWise`,
      estimatedMinutes: 75,
    },
    {
      day: 4,
      skill: s2,
      title: `Day 4: Integrate ${s2} Module`,
      task: `Extend your project or start a dedicated module demonstrating ${s2} with real data persistence or API contracts.`,
      proofArtifact: `Working ${s2} implementation committed to GitHub`,
      estimatedMinutes: 90,
    },
    {
      day: 5,
      skill: s2,
      title: `Day 5: Edge-Case Hardening & CI Workflow for ${s2}`,
      task: `Add a .github/workflows/ci.yml pipeline and edge-case assertions proving ${s2} reliability.`,
      proofArtifact: `GitHub Actions workflow + test coverage for ${s2}`,
      estimatedMinutes: 60,
    },
    {
      day: 6,
      skill: s3,
      title: `Day 6: ${s3} Architecture Spec or Certificate Proof`,
      task: `Complete a focused ${s3} benchmark/schema artifact or attach a verifiable credential in Proof Vault.`,
      proofArtifact: `${s3} code artifact or verified certificate uploaded`,
      estimatedMinutes: 75,
    },
    {
      day: 7,
      skill: `${s1} + ${s2}`,
      title: `Day 7: Architecture README & Résumé Studio Refresh`,
      task: `Finalize README documentation, verify all proof links in ApplyWise, and regenerate your code-validated achievement bullets in Résumé Studio.`,
      proofArtifact: `Updated Readiness Score + verified Résumé Studio bullets`,
      estimatedMinutes: 45,
    },
  ];

  const projectedScore = Math.min(100, vault.readinessScore + 22);

  return {
    targetRole: vault.targetRole,
    currentScore: vault.readinessScore,
    projectedScore,
    summary:
      vault.role === 'student'
        ? `7-day student proof sprint tailored for ${vault.targetRole}: converts ${s1}, ${s2}, and ${s3} into verified portfolio artifacts and raises readiness from ${vault.readinessScore}% to ~${projectedScore}%.`
        : `7-day hiring readiness sprint for ${vault.targetRole}: turns ${s1}, ${s2}, and ${s3} into defensible GitHub/certificate proof and lifts your score from ${vault.readinessScore}% to ~${projectedScore}%.`,
    days,
    savedToAccount,
  };
}

/**
 * Build the client/server CopilotVaultPayload ({ readinessScore, verified, selfDeclared, missing })
 * using the single getSkillStatus() helper so statuses match everywhere in ApplyWise.
 */
export function buildClientCopilotVault(params: {
  profile: Profile | null;
  evidence: EvidenceItem[];
  attachments?: AttachmentItem[];
  analysis?: AnalysisData | null;
  targetRole?: string;
}): CopilotVaultPayload {
  const ctx = buildProofVaultContext({
    profile: params.profile,
    evidence: params.evidence,
    attachments: params.attachments,
    analysis: params.analysis,
    targetRoleOverride: params.targetRole,
  });

  const verified: CopilotVaultItem[] = [];
  const selfDeclared: CopilotVaultItem[] = [];
  const missing: CopilotVaultItem[] = [];

  for (const s of ctx.skills) {
    if (s.status === 'verified') {
      verified.push({
        skill: s.skill,
        status: 'verified',
        proofTitle: s.proofs[0]?.title,
        proofType: s.proofs[0]?.type,
        proofUrl: s.proofs[0]?.url,
      });
    } else if (s.status === 'self-declared' || s.status === 'needs proof') {
      selfDeclared.push({
        skill: s.skill,
        status: 'self-declared',
      });
    } else {
      missing.push({
        skill: s.skill,
        status: 'missing',
      });
    }
  }

  return {
    readinessScore: ctx.readinessScore,
    verified,
    selfDeclared,
    missing,
  };
}

/**
 * Route question to Fast model for simple questions and Deep reasoning (Ultra)
 * for planning / comparison / "why/how/roadmap" questions.
 */
export function routeQuestionModelTier(
  question: string,
  options?: {
    fastModelId?: string;
    ultraModelId?: string;
    ultraModelAvailable?: boolean;
  }
): ModelRouteDecision {
  const fastModel = (options?.fastModelId || DEFAULT_NEMOTRON_FAST_MODEL).trim();
  const ultraModel = (options?.ultraModelId || DEFAULT_NEMOTRON_ULTRA_MODEL).trim();
  const ultraAvailable = options?.ultraModelAvailable !== false;

  const q = String(question || '').trim();
  const isDeepReasoning =
    /\b(plan|planning|roadmap|compare|comparing|comparison|vs|versus|difference between|differ|why|how|design|architecture|strategy|\d+-day|\d+ day|week-by-week)\b/i.test(
      q
    );

  if (isDeepReasoning) {
    if (!ultraAvailable) {
      return {
        tier: 'fast',
        tierLabel: 'Fast',
        modelId: fastModel,
        usedFallbackToFast: true,
        reason: `Deep reasoning triggered by planning/comparison/why/how/roadmap query, fell back to Fast model (${fastModel}).`,
      };
    }
    return {
      tier: 'ultra',
      tierLabel: 'Deep reasoning',
      modelId: ultraModel,
      usedFallbackToFast: false,
      reason: 'Deep reasoning model selected for planning, comparison, roadmap, or why/how query.',
    };
  }

  return {
    tier: 'fast',
    tierLabel: 'Fast',
    modelId: fastModel,
    usedFallbackToFast: false,
    reason: 'Fast model selected for simple question.',
  };
}

/**
 * Build the system prompt for Copilot chat including role, rules, and the user's live proof vault as JSON.
 */
export function buildUnifiedCopilotSystemPrompt(params: {
  targetRole: string;
  mode: string;
  vault: CopilotVaultPayload;
}): string {
  const cleanMode = String(params.mode || 'jobseeker').toLowerCase().includes('student')
    ? 'student'
    : 'job seeker';
  const cleanRole = (params.targetRole || 'Full-Stack Software Engineer').trim();

  const liveVaultJson = {
    userMode: cleanMode,
    targetRole: cleanRole,
    readinessPercentage: `${params.vault.readinessScore}%`,
    skills: [
      ...(params.vault.verified || []).map((v) => ({
        skill: v.skill,
        status: 'verified' as const,
        proof: v.proofTitle
          ? {
              title: v.proofTitle,
              type: v.proofType || 'evidence',
              url: v.proofUrl || undefined,
            }
          : 'Validated proof attached',
      })),
      ...(params.vault.selfDeclared || []).map((d) => ({
        skill: typeof d === 'string' ? d : d.skill,
        status: 'self-declared' as const,
        proof: null,
      })),
      ...(params.vault.missing || []).map((m) => ({
        skill: typeof m === 'string' ? m : m.skill,
        status: 'missing' as const,
        proof: null,
      })),
    ],
  };

  return [
    'You are the ApplyWise AI Career Readiness Copilot, a practical software engineering and career mentor.',
    '',
    'RULES:',
    '- Answer the user\'s ACTUAL question directly in the first sentence. No fixed template, no repeating their question back, no mandatory sections.',
    '- Use the vault data only when relevant. Never invent verified skills, projects, or certificates.',
    '- Match the question\'s type: a how-to gets steps, a comparison gets a table, a quick question gets 2-3 sentences, small talk gets a normal reply.',
    '- Be specific and practical (tools, hours, examples), and ask ONE clarifying question only when the request is truly ambiguous.',
    '- For general career or coding questions outside the vault, answer them normally as a helpful mentor.',
    '- Keep it concise. Use markdown only when it helps.',
    '',
    'USER LIVE PROOF VAULT JSON:',
    JSON.stringify(liveVaultJson),
  ].join('\n');
}

