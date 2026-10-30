import type {
  SkillStatus,
  EvidenceType,
  EvidenceValidationStatus,
  EvidenceItem,
  Profile,
  AttachmentItem,
  ResumeStudioOutput,
  ResumeStudioBullet,
  JdExtractionOutput,
  JdEvaluatedSkillItem,
  JdGapAnalysisResult,
} from '../types';
import { COMMON_SKILL_TERMS, identifySkills } from './skillMatcher';

// ============================================================================
// PART 0: SHARED EVIDENCE MODEL & SKILL STATUS HELPER
// ============================================================================

const SKILL_ALIAS_TO_CANONICAL: Record<string, string> = {
  react: 'React',
  'react.js': 'React',
  reactjs: 'React',
  'react 19': 'React',
  'react 18': 'React',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  javascript: 'JavaScript',
  js: 'JavaScript',
  es6: 'JavaScript',
  ecmascript: 'JavaScript',
  'html/css': 'HTML/CSS',
  html: 'HTML/CSS',
  css: 'HTML/CSS',
  html5: 'HTML/CSS',
  css3: 'HTML/CSS',
  git: 'Git',
  github: 'Git',
  'unit testing': 'Unit Testing',
  'unit tests': 'Unit Testing',
  jest: 'Unit Testing',
  vitest: 'Unit Testing',
  pytest: 'Unit Testing',
  mocha: 'Unit Testing',
  testing: 'Unit Testing',
  'node.js': 'Node.js',
  nodejs: 'Node.js',
  node: 'Node.js',
  'express.js': 'Node.js',
  express: 'Node.js',
  'next.js': 'Next.js',
  nextjs: 'Next.js',
  angular: 'Angular',
  angularjs: 'Angular',
  vue: 'Vue',
  'vue.js': 'Vue',
  vuejs: 'Vue',
  python: 'Python',
  py: 'Python',
  fastapi: 'Python',
  django: 'Python',
  flask: 'Python',
  sql: 'SQL',
  postgres: 'SQL',
  postgresql: 'SQL',
  mysql: 'SQL',
  sqlite: 'SQL',
  'oracle db': 'SQL',
  aws: 'AWS',
  'amazon web services': 'AWS',
  docker: 'Docker',
  containers: 'Docker',
  containerization: 'Docker',
  figma: 'Figma',
  'rest apis': 'REST APIs',
  'rest api': 'REST APIs',
  restful: 'REST APIs',
  'restful apis': 'REST APIs',
  api: 'REST APIs',
  'ci/cd': 'CI/CD',
  cicd: 'CI/CD',
  'github actions': 'CI/CD',
  'continuous integration': 'CI/CD',
  jenkins: 'CI/CD',
  java: 'Java',
  'c++': 'C++',
  cpp: 'C++',
  'tailwind css': 'Tailwind CSS',
  tailwind: 'Tailwind CSS',
  tailwindcss: 'Tailwind CSS',
  kubernetes: 'Kubernetes',
  k8s: 'Kubernetes',
  'spring boot': 'Spring Boot',
  springboot: 'Spring Boot',
  'cloud computing': 'Cloud Computing',
  gcp: 'Cloud Computing',
  azure: 'Cloud Computing',
  'system design': 'System Design',
  'distributed systems': 'System Design',
  architecture: 'System Design',
  linux: 'Linux',
  unix: 'Linux',
  bash: 'Linux',
  cybersecurity: 'Cybersecurity',
  'network security': 'Cybersecurity',
  infosec: 'Cybersecurity',
  owasp: 'Cybersecurity',
  secops: 'Cybersecurity',
  'machine learning': 'Machine Learning',
  ml: 'Machine Learning',
  'deep learning': 'Machine Learning',
  pytorch: 'Machine Learning',
  tensorflow: 'Machine Learning',
  'selenium / playwright': 'Selenium / Playwright',
  playwright: 'Selenium / Playwright',
  selenium: 'Selenium / Playwright',
  cypress: 'Selenium / Playwright',
  graphql: 'GraphQL',
  mongodb: 'MongoDB',
  mongo: 'MongoDB',
  nosql: 'MongoDB',
  terraform: 'Terraform',
  iac: 'Terraform',
  'quantitative aptitude': 'Quantitative Aptitude',
  quant: 'Quantitative Aptitude',
  csat: 'Quantitative Aptitude',
  'logical reasoning': 'Logical Reasoning',
  reasoning: 'Logical Reasoning',
  'general studies & polity': 'General Studies & Polity',
  'general studies': 'General Studies & Polity',
  polity: 'General Studies & Polity',
  'data interpretation': 'Data Interpretation',
  'public administration': 'Public Administration',
  'operating systems': 'Operating Systems',
  os: 'Operating Systems',
  dbms: 'DBMS',
  'database management': 'DBMS',
  'computer networks': 'Computer Networks',
  networking: 'Computer Networks',
  'tcp/ip': 'Computer Networks',
  'data structures & algorithms': 'Data Structures & Algorithms',
  'data structures': 'Data Structures & Algorithms',
  algorithms: 'Data Structures & Algorithms',
  dsa: 'Data Structures & Algorithms',
};

/**
 * Normalizes any raw skill string to ApplyWise's canonical skill vocabulary if known,
 * or preserves the cleaned unknown skill name with `isKnown: false`.
 */
export function normalizeSkillName(raw: string): { canonical: string; isKnown: boolean } {
  const cleaned = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) {
    return { canonical: '', isKnown: false };
  }

  const lower = cleaned.toLowerCase();
  if (SKILL_ALIAS_TO_CANONICAL[lower]) {
    return { canonical: SKILL_ALIAS_TO_CANONICAL[lower], isKnown: true };
  }

  const exactCanonical = COMMON_SKILL_TERMS.find((t) => t.toLowerCase() === lower);
  if (exactCanonical) {
    return { canonical: exactCanonical, isKnown: true };
  }

  return { canonical: cleaned, isKnown: false };
}

/**
 * Normalizes any raw evidence object (from SQLite or client state) into the shared EvidenceItem shape:
 * { id, skillId, type: "github" | "certificate" | "file" | "link", url, title, status: "pending" | "valid" | "rejected", reason, addedAt, details }
 */
export function normalizeEvidenceType(rawType?: string, url?: string, attachmentName?: string): EvidenceType {
  const t = String(rawType || '').toLowerCase().trim();
  const u = String(url || '').toLowerCase();
  if (t === 'github' || t === 'github link' || u.includes('github.com')) {
    return 'github';
  }
  if (t === 'certificate' || t.includes('cert')) {
    return 'certificate';
  }
  if (t === 'file' || Boolean(attachmentName)) {
    return 'file';
  }
  return 'link';
}

export function normalizeEvidenceItem(raw: Partial<EvidenceItem> & Record<string, unknown>): EvidenceItem {
  const rawSkill = String(raw.skillId || raw.skill || '').trim();
  const { canonical } = normalizeSkillName(rawSkill);
  const skillId = canonical || rawSkill;
  const rawTypeStr = String(raw.type || '').trim();
  const rawTitle = String(raw.title || '').trim();

  const isLegacySelfDeclared =
    rawTypeStr.toLowerCase() === 'self-declared' ||
    rawTypeStr.toLowerCase() === 'self-reported' ||
    /mentioned in r[eé]sum[eé]/i.test(rawTitle) ||
    /\(self-declared\)/i.test(rawTitle);

  let parsedDetails: Record<string, unknown> | undefined = undefined;
  const rawDetailsAny = (raw as any).details;
  if (rawDetailsAny && typeof rawDetailsAny === 'object') {
    parsedDetails = rawDetailsAny as Record<string, unknown>;
  } else if (typeof rawDetailsAny === 'string' && rawDetailsAny.trim().startsWith('{')) {
    try {
      parsedDetails = JSON.parse(rawDetailsAny);
    } catch {
      parsedDetails = undefined;
    }
  }

  let status: EvidenceValidationStatus = 'valid';
  if (raw.status === 'pending' || raw.status === 'valid' || raw.status === 'rejected') {
    status = raw.status;
  }
  if (isLegacySelfDeclared || parsedDetails?.trust === 'rejected') {
    status = 'rejected';
  } else if (
    parsedDetails?.trust === 'low' ||
    parsedDetails?.unconfirmedEvidence === true ||
    parsedDetails?.identityUnconfirmed === true
  ) {
    // Only "high" or "medium" evidence can move a skill to "verified".
    // "low" evidence leaves the skill as "declared" with an "Unconfirmed evidence" badge.
    status = 'pending';
  }

  const normalizedType = normalizeEvidenceType(
    rawTypeStr,
    typeof raw.url === 'string' ? raw.url : undefined,
    typeof raw.attachment_name === 'string' ? raw.attachment_name : undefined
  );

  return {
    id: raw.id ?? `${skillId}-${rawTitle}`,
    user_id: typeof raw.user_id === 'number' ? raw.user_id : undefined,
    skillId,
    skill: skillId,
    type: normalizedType,
    url: typeof raw.url === 'string' ? raw.url : '',
    title: rawTitle || `${skillId} Evidence`,
    status,
    reason:
      typeof raw.reason === 'string'
        ? raw.reason
        : isLegacySelfDeclared
        ? 'Self-declared claim without independent proof'
        : undefined,
    addedAt:
      typeof raw.addedAt === 'string'
        ? raw.addedAt
        : typeof raw.added_at === 'string'
        ? raw.added_at
        : new Date().toISOString(),
    details: parsedDetails,
    attachment_name: typeof raw.attachment_name === 'string' ? raw.attachment_name : undefined,
    extracted_summary: typeof raw.extracted_summary === 'string' ? raw.extracted_summary : undefined,
  };
}

export interface SkillStatusContext {
  evidence?: EvidenceItem[];
  profile?: Profile | null;
  attachments?: AttachmentItem[];
  declaredSkills?: string[];
  testedAssessments?: string[];
}

let activeGlobalSkillContext: SkillStatusContext = {
  evidence: [],
  profile: null,
  attachments: [],
  declaredSkills: [],
  testedAssessments: [],
};

/**
 * Updates the active global skill context so `getSkillStatus(skillId)` can be called anywhere
 * with just `skillId` or with an explicit `context` override (for unit tests and server handlers).
 */
export function setGlobalSkillContext(ctx: SkillStatusContext): void {
  activeGlobalSkillContext = ctx;
}

export function getGlobalSkillContext(): SkillStatusContext {
  return activeGlobalSkillContext;
}

/**
 * Extract all declared skills mentioned in profile.skills_text, profile.resume_text, or attachments.
 */
export function extractDeclaredSkillsFromContext(context: SkillStatusContext): Set<string> {
  const set = new Set<string>();

  if (Array.isArray(context.declaredSkills)) {
    for (const s of context.declaredSkills) {
      const norm = normalizeSkillName(s).canonical;
      if (norm) set.add(norm.toLowerCase());
    }
  }

  const profileSkillsText = context.profile?.skills_text || '';
  const profileResumeText = context.profile?.resume_text || '';
  const attachmentsText = (context.attachments || [])
    .filter((a) => a.trust !== 'rejected' && a.detected_type !== 'id_document' && a.detected_type !== 'marksheet')
    .map((a) => a.extracted_text || '')
    .join(' ');

  const combinedText = `${profileSkillsText} ${profileResumeText} ${attachmentsText}`;
  if (combinedText.trim()) {
    for (const sk of identifySkills(combinedText)) {
      set.add(sk.toLowerCase());
    }
  }

  if (profileSkillsText.trim()) {
    for (const token of profileSkillsText.split(',')) {
      const cleaned = token.trim();
      if (cleaned.length > 1 && cleaned.length < 40) {
        const norm = normalizeSkillName(cleaned).canonical;
        if (norm) set.add(norm.toLowerCase());
      }
    }
  }

  // Also check if a low-trust ("pending") evidence item is attached to a skill -> counts as declared
  for (const rawEv of context.evidence || []) {
    const ev = normalizeEvidenceItem(rawEv);
    if (ev.status === 'pending') {
      const norm = normalizeSkillName(ev.skillId || ev.skill).canonical;
      if (norm) set.add(norm.toLowerCase());
    }
  }

  return set;
}

/**
 * Single authoritative helper for skill status across ApplyWise.
 * Never computed by AI.
 * - "verified": at least one attached evidence item that passed validation (status === "valid" and trust is "high" or "medium"), or a tested assessment
 * - "declared": mentioned in the résumé or profile, or has low-trust/unconfirmed evidence, no valid high/medium evidence
 * - "missing": not found anywhere
 */
export function getSkillStatus(skillId: string, context?: SkillStatusContext): SkillStatus {
  const ctx = context || activeGlobalSkillContext;
  const { canonical } = normalizeSkillName(skillId);
  const targetLower = (canonical || skillId || '').trim().toLowerCase();
  if (!targetLower) return 'missing';

  // 1. Check valid evidence items (only high or medium trust can verify)
  const evidenceList = (ctx.evidence || []).map((e) => normalizeEvidenceItem(e));
  const hasValidEvidence = evidenceList.some(
    (ev) =>
      ev.status === 'valid' &&
      ev.details?.trust !== 'low' &&
      ev.details?.trust !== 'rejected' &&
      ev.details?.unconfirmedEvidence !== true &&
      (ev.skillId || ev.skill || '').trim().toLowerCase() === targetLower
  );
  if (hasValidEvidence) {
    return 'verified';
  }

  // 2. Check tested assessments
  if (
    Array.isArray(ctx.testedAssessments) &&
    ctx.testedAssessments.some(
      (a) => normalizeSkillName(a).canonical.toLowerCase() === targetLower
    )
  ) {
    return 'verified';
  }

  // 3. Check if low-trust / unconfirmed evidence is attached -> leaves skill as "declared"
  const hasLowTrustEvidence = evidenceList.some(
    (ev) =>
      (ev.status === 'pending' ||
        ev.details?.trust === 'low' ||
        ev.details?.unconfirmedEvidence === true) &&
      (ev.skillId || ev.skill || '').trim().toLowerCase() === targetLower
  );
  if (hasLowTrustEvidence) {
    return 'declared';
  }

  // 4. Check declared in profile / résumé / attachments
  const declaredSet = extractDeclaredSkillsFromContext(ctx);
  if (declaredSet.has(targetLower)) {
    return 'declared';
  }

  // Fallback verbatim word-boundary check in resume_text or skills_text for custom/unknown skills
  const rawCombined = `${ctx.profile?.skills_text || ''} ${ctx.profile?.resume_text || ''}`.toLowerCase();
  if (rawCombined.trim().length > 0 && targetLower.length >= 2) {
    const escaped = targetLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    if (regex.test(rawCombined)) {
      return 'declared';
    }
  }

  return 'missing';
}

/**
 * Returns all valid EvidenceItem objects attached for a given skillId.
 */
export function getValidEvidenceForSkill(
  skillId: string,
  evidence: EvidenceItem[] = activeGlobalSkillContext.evidence || []
): EvidenceItem[] {
  const { canonical } = normalizeSkillName(skillId);
  const targetLower = (canonical || skillId || '').trim().toLowerCase();
  return evidence
    .map((e) => normalizeEvidenceItem(e))
    .filter(
      (ev) =>
        ev.status === 'valid' &&
        ev.details?.trust !== 'low' &&
        ev.details?.trust !== 'rejected' &&
        ev.details?.unconfirmedEvidence !== true &&
        (ev.skillId || ev.skill || '').trim().toLowerCase() === targetLower
    );
}

/**
 * Returns low-trust / unconfirmed EvidenceItem objects attached for a given skillId
 * so the UI can display an "Unconfirmed evidence" badge while leaving the skill as "declared".
 */
export function getUnconfirmedEvidenceForSkill(
  skillId: string,
  evidence: EvidenceItem[] = activeGlobalSkillContext.evidence || []
): EvidenceItem[] {
  const { canonical } = normalizeSkillName(skillId);
  const targetLower = (canonical || skillId || '').trim().toLowerCase();
  return evidence
    .map((e) => normalizeEvidenceItem(e))
    .filter(
      (ev) =>
        (ev.status === 'pending' ||
          ev.details?.trust === 'low' ||
          ev.details?.unconfirmedEvidence === true ||
          ev.details?.identityUnconfirmed === true) &&
        (ev.skillId || ev.skill || '').trim().toLowerCase() === targetLower
    );
}

// ============================================================================
// PART 1: RÉSUMÉ STUDIO INPUT BUILDER, VALIDATOR & FALLBACK GENERATOR
// ============================================================================

export interface VerifiedSkillWithEvidenceInput {
  skillId: string;
  evidenceId: string | number;
  evidenceTitle: string;
  evidenceType: EvidenceType;
  evidenceUrl?: string;
  summary?: string;
}

export interface ResumeStudioGenerationInput {
  targetRole: string;
  companyName: string;
  candidateName: string;
  verifiedSkills: VerifiedSkillWithEvidenceInput[];
  declaredSkills: string[];
  sprintInProgress?: boolean;
  sprintSkills?: string[];
}

export type ResumeGenerationInput = ResumeStudioGenerationInput;

export function buildResumeGenerationInput(params: {
  context: SkillStatusContext;
  targetRole?: string;
  companyName?: string;
  candidateName?: string;
  candidateSkillsUniverse?: string[];
  sprintInProgress?: boolean;
  sprintSkills?: string[];
}): ResumeStudioGenerationInput {
  const {
    context,
    targetRole = context.profile?.title || 'Software Engineer',
    companyName = 'the hiring organization',
    candidateName = context.profile?.name || 'Candidate',
    candidateSkillsUniverse = [],
    sprintInProgress = false,
    sprintSkills = [],
  } = params;

  const normalizedEv = (context.evidence || []).map((e) => normalizeEvidenceItem(e));
  const validEv = normalizedEv.filter((e) => e.status === 'valid');

  // Collect candidate skill universe from valid evidence, declared skills, and optional universe
  const declaredSet = extractDeclaredSkillsFromContext(context);
  const allSkillCandidates = Array.from(
    new Set([
      ...validEv.map((e) => e.skillId || e.skill),
      ...Array.from(declaredSet).map((s) => normalizeSkillName(s).canonical),
      ...candidateSkillsUniverse.map((s) => normalizeSkillName(s).canonical),
    ])
  ).filter(Boolean);

  const verifiedSkills: VerifiedSkillWithEvidenceInput[] = [];
  const declaredSkills: string[] = [];

  for (const sk of allSkillCandidates) {
    const status = getSkillStatus(sk, context);
    if (status === 'verified') {
      const matchingEv = validEv.find(
        (e) => (e.skillId || e.skill).toLowerCase() === sk.toLowerCase()
      );
      if (matchingEv) {
        verifiedSkills.push({
          skillId: sk,
          evidenceId: matchingEv.id ?? `ev-${sk}`,
          evidenceTitle: matchingEv.title,
          evidenceType: normalizeEvidenceType(
            matchingEv.type,
            matchingEv.url,
            matchingEv.attachment_name
          ),
          evidenceUrl: matchingEv.url,
          summary: matchingEv.extracted_summary,
        });
      }
    } else if (status === 'declared') {
      if (!declaredSkills.some((d) => d.toLowerCase() === sk.toLowerCase())) {
        declaredSkills.push(sk);
      }
    }
    // Missing skills are strictly excluded from generation input!
  }

  return {
    targetRole,
    companyName,
    candidateName,
    verifiedSkills,
    declaredSkills,
    sprintInProgress,
    sprintSkills: sprintInProgress ? sprintSkills : [],
  };
}

const BANNED_INTERNAL_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /self-declared/i, label: 'contains "self-declared"' },
  { pattern: /mentioned in/i, label: 'contains "Mentioned in"' },
  { pattern: /\bunverified\b/i, label: 'contains "unverified"' },
  {
    pattern: /\(\s*(?:verified|declared|self-declared|unverified|needs proof|missing)\s*\)/i,
    label: 'contains parenthesized status label',
  },
];

/**
 * Code validator executed after AI generation in Résumé Studio.
 * Enforces:
 * 1. Every bullet.evidenceId must exist and belong to a verified skill.
 * 2. Rejects text containing "self-declared", "Mentioned in", "unverified", or any parentheses status label.
 * 3. Rejects any cover letter sentence that names a skill that is not verified or declared
 *    (unless sprintInProgress is true and the sentence says "currently building" that skill).
 *    Also ensures cover letter does not claim unverified/declared skills as verified.
 * 4. Bans duplicate openings: no two bullets may start with the same first two words.
 */
export function validateResumeOutput(
  output: ResumeStudioOutput,
  input: ResumeStudioGenerationInput
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Output is not a valid object.'] };
  }

  if (!Array.isArray(output.bullets)) {
    errors.push('bullets must be an array.');
  }
  if (typeof output.skillsLine !== 'string') {
    errors.push('skillsLine must be a string.');
  }
  if (typeof output.coverLetter !== 'string' || !output.coverLetter.trim()) {
    errors.push('coverLetter must be a non-empty string.');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const verifiedByEvId = new Map<string, VerifiedSkillWithEvidenceInput>();
  const verifiedSkillLower = new Set<string>();
  for (const v of input.verifiedSkills) {
    verifiedByEvId.set(String(v.evidenceId), v);
    verifiedSkillLower.add(v.skillId.toLowerCase());
  }

  const declaredSkillLower = new Set<string>(
    input.declaredSkills.map((s) => s.toLowerCase())
  );
  const sprintSkillLower = new Set<string>(
    (input.sprintInProgress ? input.sprintSkills || [] : []).map((s) => s.toLowerCase())
  );

  // If user has 0 verified skills, bullets must be empty
  if (input.verifiedSkills.length === 0 && output.bullets.length > 0) {
    errors.push('User has zero verified skills, so achievement bullets must be empty.');
  }

  const seenTwoWordOpenings = new Set<string>();

  for (let i = 0; i < output.bullets.length; i++) {
    const b = output.bullets[i];
    if (!b || typeof b.text !== 'string' || !b.text.trim()) {
      errors.push(`Bullet #${i + 1} has empty text.`);
      continue;
    }

    // Rule 1: every bullet.evidenceId must exist and belong to a verified skill
    const matchedVerified = verifiedByEvId.get(String(b.evidenceId));
    if (!matchedVerified) {
      errors.push(
        `Bullet #${i + 1} references unknown or unverified evidenceId "${b.evidenceId}".`
      );
    } else if (
      b.skillId &&
      b.skillId.trim().toLowerCase() !== matchedVerified.skillId.toLowerCase()
    ) {
      errors.push(
        `Bullet #${i + 1} skillId "${b.skillId}" does not match evidenceId "${b.evidenceId}" (${matchedVerified.skillId}).`
      );
    }

    // Rule 2: banned internal status strings
    for (const rule of BANNED_INTERNAL_PATTERNS) {
      if (rule.pattern.test(b.text)) {
        errors.push(`Bullet #${i + 1} ${rule.label}.`);
      }
    }

    // Rule 4: ban duplicate openings (first two words)
    const words = b.text
      .trim()
      .replace(/^[•\-*]\s*/, '')
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.replace(/[^a-z0-9]/gi, '').toLowerCase())
      .filter(Boolean);

    if (words.length >= 2) {
      const openingKey = `${words[0]} ${words[1]}`;
      if (seenTwoWordOpenings.has(openingKey)) {
        errors.push(
          `Duplicate bullet opening "${words[0]} ${words[1]}" found in bullet #${i + 1}.`
        );
      }
      seenTwoWordOpenings.add(openingKey);
    }
  }

  // Check skillsLine for banned strings or "verified" / "developed" claims
  for (const rule of BANNED_INTERNAL_PATTERNS) {
    if (rule.pattern.test(output.skillsLine)) {
      errors.push(`skillsLine ${rule.label}.`);
    }
  }
  if (/\b(verified|developed)\b/i.test(output.skillsLine)) {
    errors.push('skillsLine must be neutral (e.g. "Familiar with X") and never use "verified" or "developed".');
  }

  // Check coverLetter for banned strings
  for (const rule of BANNED_INTERNAL_PATTERNS) {
    if (rule.pattern.test(output.coverLetter)) {
      errors.push(`coverLetter ${rule.label}.`);
    }
  }

  // Rule 3: Reject any cover letter sentence that names a skill that is not verified or declared
  // (or claims a declared skill as verified, or mentions a missing skill without sprintInProgress + "currently building")
  const sentences = output.coverLetter
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const verifiedEvidenceTitles = input.verifiedSkills
    .map((v) => v.evidenceTitle?.trim())
    .filter((t): t is string => Boolean(t));

  for (const sentence of sentences) {
    // Strip exact verified evidence titles before scanning for skill names so quoting a verified project title
    // (e.g. "Automated API & UI Regression Suite (node:test + Playwright)") does not falsely trigger on words inside the title.
    let scrubbedSentence = sentence;
    for (const title of verifiedEvidenceTitles) {
      if (title.length > 3 && scrubbedSentence.includes(title)) {
        scrubbedSentence = scrubbedSentence.split(title).join('verified project');
      }
    }
    const mentionedSkills = identifySkills(scrubbedSentence);
    for (const sk of mentionedSkills) {
      const skLower = sk.toLowerCase();
      const isVerified = verifiedSkillLower.has(skLower);
      const isDeclared = declaredSkillLower.has(skLower);
      const isSprintBuilding =
        Boolean(input.sprintInProgress) &&
        sprintSkillLower.has(skLower) &&
        /currently building/i.test(sentence);

      if (!isVerified && !isDeclared && !isSprintBuilding) {
        errors.push(
          `Cover letter sentence mentions unverified/missing skill "${sk}": "${sentence}"`
        );
      } else if (isDeclared && !isVerified && /\b(verified|proven|demonstrated)\b/i.test(sentence)) {
        errors.push(
          `Cover letter claims declared skill "${sk}" as verified/proven: "${sentence}"`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

const STRONG_ACTION_VERB_TEMPLATES: Array<
  (skill: string, evidenceTitle: string) => string
> = [
  (skill, title) =>
    `Architected production ${skill} modules in "${title}", reducing p95 latency by [X%] across [N] endpoints.`,
  (skill, title) =>
    `Engineered resilient ${skill} workflows for "${title}", sustaining [N]+ concurrent operations with automated checks.`,
  (skill, title) =>
    `Implemented modular ${skill} architecture within "${title}", cutting manual verification time by [X%].`,
  (skill, title) =>
    `Built and validated "${title}" using ${skill}, maintaining [X%] automated test coverage across core paths.`,
  (skill, title) =>
    `Designed fault-tolerant ${skill} services in "${title}", improving release reliability across [N] deployments.`,
  (skill, title) =>
    `Delivered end-to-end ${skill} capabilities in "${title}", streamlining data processing throughput by [X%].`,
  (skill, title) =>
    `Automated critical ${skill} pipelines inside "${title}", catching [N] regression edge cases before release.`,
  (skill, title) =>
    `Optimized core ${skill} execution paths in "${title}", lowering resource consumption by [X%] under load.`,
];

/**
 * Plain deterministic fallback generator for Résumé Studio guaranteed to pass `validateResumeOutput`.
 */
export function buildFallbackResumeStudioOutput(
  input: ResumeStudioGenerationInput
): ResumeStudioOutput {
  const bullets: ResumeStudioBullet[] = input.verifiedSkills.map((v, idx) => {
    const templateFn =
      STRONG_ACTION_VERB_TEMPLATES[idx % STRONG_ACTION_VERB_TEMPLATES.length];
    return {
      skillId: v.skillId,
      evidenceId: v.evidenceId,
      evidenceTitle: v.evidenceTitle,
      evidenceType: v.evidenceType,
      evidenceUrl: v.evidenceUrl,
      text: templateFn(v.skillId, v.evidenceTitle),
    };
  });

  const skillsLine =
    input.declaredSkills.length > 0
      ? `Familiar with ${input.declaredSkills.join(', ')}.`
      : '';

  const verifiedNames = input.verifiedSkills.map((v) => v.skillId);
  const projectNames = Array.from(
    new Set(input.verifiedSkills.map((v) => `"${v.evidenceTitle}"`))
  );

  const sprintSentence =
    input.sprintInProgress && input.sprintSkills && input.sprintSkills.length > 0
      ? `\n\nIn addition, I am currently building ${input.sprintSkills
          .slice(0, 2)
          .join(' and ')} through a structured 7-day engineering proof sprint.`
      : '';

  const declaredSentence =
    input.declaredSkills.length > 0
      ? ` I am also familiar with ${input.declaredSkills.slice(0, 4).join(', ')} from my coursework and development environment.`
      : '';

  const coverLetter =
    verifiedNames.length > 0
      ? `Dear Hiring Team at ${input.companyName},\n\nI am writing to apply for the ${
          input.targetRole
        } position. Through my attached engineering artifacts—including ${projectNames
          .slice(0, 2)
          .join(' and ')}—I have hands-on experience in ${verifiedNames.join(
          ', '
        )}.${declaredSentence}${sprintSentence}\n\nEvery technical achievement bullet in my application links directly to an inspectable repository, certificate, or project file in my portfolio.\n\nThank you for your time and consideration.\n\nSincerely,\n${
          input.candidateName || 'Candidate'
        }`
      : `Dear Hiring Team at ${input.companyName},\n\nI am writing to express my interest in the ${
          input.targetRole
        } position.${
          input.declaredSkills.length > 0
            ? ` I am familiar with ${input.declaredSkills.slice(0, 4).join(', ')}.`
            : ''
        }${sprintSentence}\n\nThank you for your time and consideration.\n\nSincerely,\n${
          input.candidateName || 'Candidate'
        }`;

  return {
    bullets,
    skillsLine,
    coverLetter,
    validationPassed: true,
    validationErrors: [],
    usedFallback: true,
  };
}

/**
 * Generates a single replacement bullet for a verified skill using a different action verb opening.
 */
export function buildSingleBulletVariation(
  v: VerifiedSkillWithEvidenceInput,
  currentText: string,
  existingBullets: ResumeStudioBullet[]
): string {
  const usedOpenings = new Set<string>();
  for (const b of existingBullets) {
    const words = b.text
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.replace(/[^a-z0-9]/gi, '').toLowerCase());
    if (words.length >= 2) {
      usedOpenings.add(`${words[0]} ${words[1]}`);
    }
  }

  for (const fn of STRONG_ACTION_VERB_TEMPLATES) {
    const candidate = fn(v.skillId, v.evidenceTitle);
    if (candidate === currentText) continue;
    const words = candidate
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.replace(/[^a-z0-9]/gi, '').toLowerCase());
    const key = words.join(' ');
    if (!usedOpenings.has(key)) {
      return candidate;
    }
  }

  return STRONG_ACTION_VERB_TEMPLATES[0](v.skillId, v.evidenceTitle);
}

// ============================================================================
// PART 2: GITHUB REPOSITORY VALIDATION & SKILL DETECTION (PURE CODE)
// ============================================================================

export function parseGitHubRepoUrl(url: string): { owner: string; repo: string } | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim().replace(/\/+$/, '').replace(/\.git$/i, '');

  // Support https://github.com/owner/repo or github.com/owner/repo or owner/repo
  const fullMatch = /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i.exec(
    trimmed
  );
  if (fullMatch) {
    return {
      owner: fullMatch[1],
      repo: fullMatch[2],
    };
  }

  const shortMatch = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(trimmed);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
    };
  }

  return null;
}

export interface GitHubRepoInspectionInput {
  owner: string;
  repo: string;
  username: string;
  notFound?: boolean;
  isPrivate?: boolean;
  isFork?: boolean;
  description?: string;
  stars?: number;
  pushedAt?: string;
  defaultBranch?: string;
  languages?: Record<string, number>;
  readmeText?: string;
  userCommitDates?: string[]; // ISO timestamps of commits by `username`
  treePaths?: string[]; // file paths from /git/trees/{branch}?recursive=1
  packageJsonDeps?: Record<string, string>;
}

export interface GitHubValidationOutcome {
  status: 'valid' | 'rejected';
  reason?: string;
  weakEvidenceWarning?: string;
  userCommitCount: number;
  allCommitsSingleDay: boolean;
}

/**
 * Validates a GitHub repository strictly in code (never AI):
 * - Rejects if private or not found
 * - Rejects if fork with 0 commits by user
 * - Rejects if repo owner !== username AND user has 0 commits
 * - Shows a "weak evidence" warning (still "valid") if user has < 3 commits,
 *   or all commits are within a single day with < 5 commits.
 */
export function validateGitHubRepoProof(
  input: GitHubRepoInspectionInput
): GitHubValidationOutcome {
  const commitDates = Array.isArray(input.userCommitDates) ? input.userCommitDates : [];
  const userCommitCount = commitDates.length;

  const uniqueDays = new Set(
    commitDates
      .map((d) => String(d || '').slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  );
  const allCommitsSingleDay = userCommitCount > 0 && uniqueDays.size <= 1;

  if (input.notFound || input.isPrivate) {
    return {
      status: 'rejected',
      reason: input.isPrivate
        ? 'Repository is private. Only public repositories can be verified as evidence.'
        : 'Repository was not found or is private on GitHub.',
      userCommitCount,
      allCommitsSingleDay,
    };
  }

  const cleanOwner = String(input.owner || '').trim().toLowerCase();
  const cleanUser = String(input.username || '').trim().toLowerCase();
  const isOwner = Boolean(cleanOwner && cleanUser && cleanOwner === cleanUser);

  if (input.isFork && userCommitCount === 0) {
    return {
      status: 'rejected',
      reason: `Repository is a fork with 0 commits authored by "${input.username}".`,
      userCommitCount,
      allCommitsSingleDay,
    };
  }

  if (!isOwner && userCommitCount === 0) {
    return {
      status: 'rejected',
      reason: `Repository is owned by "${input.owner}" and has 0 commits authored by "${input.username}".`,
      userCommitCount,
      allCommitsSingleDay,
    };
  }

  let weakEvidenceWarning: string | undefined = undefined;
  if (userCommitCount < 3) {
    weakEvidenceWarning = `Weak evidence: only ${userCommitCount} commit${
      userCommitCount === 1 ? '' : 's'
    } authored by ${input.username} (3+ commits recommended).`;
  } else if (allCommitsSingleDay && userCommitCount < 5) {
    weakEvidenceWarning = `Weak evidence: all ${userCommitCount} commits were pushed within a single day.`;
  }

  return {
    status: 'valid',
    weakEvidenceWarning,
    userCommitCount,
    allCommitsSingleDay,
  };
}

/**
 * Deterministically maps repository languages, file tree paths, and package.json dependencies
 * to ApplyWise skills.
 */
export function detectSkillsFromGitHubRepo(
  input: GitHubRepoInspectionInput
): Array<{ skill: string; signal: string }> {
  const detected = new Map<string, string>();
  const languages = input.languages || {};
  const langKeys = Object.keys(languages);
  const paths = (input.treePaths || []).map((p) => p.toLowerCase());
  const deps = Object.keys(input.packageJsonDeps || {}).map((d) => d.toLowerCase());
  const readmeLower = String(input.readmeText || '').toLowerCase();

  const addSkill = (skill: string, signal: string) => {
    if (!detected.has(skill)) {
      detected.set(skill, signal);
    }
  };

  // TypeScript
  if (
    langKeys.some((l) => l.toLowerCase() === 'typescript') ||
    paths.some((p) => p.endsWith('tsconfig.json') || p.endsWith('.ts') || p.endsWith('.tsx'))
  ) {
    addSkill(
      'TypeScript',
      paths.some((p) => p.endsWith('tsconfig.json'))
        ? 'tsconfig.json & TypeScript source files'
        : 'TypeScript language breakdown'
    );
  }

  // JavaScript
  if (
    langKeys.some((l) => l.toLowerCase() === 'javascript') ||
    paths.some((p) => p.endsWith('.js') || p.endsWith('.jsx') || p.endsWith('.mjs'))
  ) {
    addSkill('JavaScript', 'JavaScript source files');
  }

  // React
  if (
    deps.includes('react') ||
    deps.includes('react-dom') ||
    paths.some((p) => p.endsWith('.tsx') || p.endsWith('.jsx')) ||
    /\breact\b/.test(readmeLower)
  ) {
    addSkill(
      'React',
      deps.includes('react')
        ? 'package.json react dependency'
        : 'React JSX/TSX component files'
    );
  }

  // Next.js
  if (
    deps.includes('next') ||
    paths.some((p) => p.includes('next.config'))
  ) {
    addSkill('Next.js', 'Next.js configuration & dependencies');
  }

  // Node.js
  const nodeServerDeps = [
    'express',
    'fastify',
    '@nestjs/core',
    'koa',
    'hono',
    'better-sqlite3',
    'pg',
    'mongoose',
    'Prisma',
    'socket.io',
  ];
  if (
    deps.some((d) => nodeServerDeps.map((x) => x.toLowerCase()).includes(d)) ||
    paths.some(
      (p) =>
        p === 'server.ts' ||
        p === 'server.js' ||
        p.startsWith('server/') ||
        (p === 'package.json' && /\b(node|express|fastify)\b/.test(readmeLower))
    )
  ) {
    addSkill('Node.js', 'package.json server dependencies & backend entrypoint');
  }

  // Python
  if (
    langKeys.some((l) => l.toLowerCase() === 'python') ||
    paths.some(
      (p) =>
        p.endsWith('requirements.txt') ||
        p.endsWith('pyproject.toml') ||
        p.endsWith('.py')
    )
  ) {
    addSkill(
      'Python',
      paths.some((p) => p.endsWith('requirements.txt') || p.endsWith('pyproject.toml'))
        ? 'Python project manifest (requirements.txt / pyproject.toml)'
        : 'Python source files'
    );
  }

  // Java & Spring Boot
  if (
    langKeys.some((l) => l.toLowerCase() === 'java') ||
    paths.some((p) => p.endsWith('pom.xml') || p.endsWith('build.gradle') || p.endsWith('.java'))
  ) {
    addSkill('Java', 'Java source & build configuration');
    if (paths.some((p) => p.includes('spring')) || /\bspring boot\b/.test(readmeLower)) {
      addSkill('Spring Boot', 'Spring Boot project configuration');
    }
  }

  // C++
  if (
    langKeys.some((l) => l.toLowerCase() === 'c++') ||
    paths.some((p) => p.endsWith('cmakelists.txt') || p.endsWith('.cpp') || p.endsWith('.hpp'))
  ) {
    addSkill('C++', 'C++ source files');
  }

  // Docker
  if (
    paths.some(
      (p) =>
        p === 'dockerfile' ||
        p.endsWith('/dockerfile') ||
        p.includes('docker-compose')
    ) ||
    langKeys.some((l) => l.toLowerCase() === 'dockerfile')
  ) {
    addSkill('Docker', 'Dockerfile / container configuration');
  }

  // CI/CD
  if (
    paths.some(
      (p) =>
        p.startsWith('.github/workflows/') ||
        p === '.gitlab-ci.yml' ||
        p === 'jenkinsfile'
    )
  ) {
    addSkill('CI/CD', '.github/workflows automated pipeline');
  }

  // Unit Testing
  if (
    paths.some(
      (p) =>
        p.includes('__tests__/') ||
        p.startsWith('test/') ||
        p.startsWith('tests/') ||
        p.includes('.test.') ||
        p.includes('.spec.') ||
        p.includes('jest.config') ||
        p.includes('vitest.config') ||
        p.includes('pytest.ini')
    ) ||
    deps.some((d) => ['jest', 'vitest', 'mocha', 'chai', 'pytest'].includes(d))
  ) {
    addSkill('Unit Testing', 'Automated test files / test runner config');
  }

  // Selenium / Playwright
  if (
    paths.some((p) => p.includes('playwright.config') || p.includes('cypress.config')) ||
    deps.some((d) => ['@playwright/test', 'playwright', 'cypress', 'selenium-webdriver'].includes(d))
  ) {
    addSkill('Selenium / Playwright', 'Browser E2E automation configuration');
  }

  // SQL
  if (
    langKeys.some((l) => l.toLowerCase() === 'sql' || l.toLowerCase() === 'plpgsql') ||
    paths.some(
      (p) =>
        p.endsWith('.sql') ||
        p.includes('prisma/schema.prisma') ||
        p.includes('drizzle.config')
    ) ||
    deps.some((d) => ['pg', 'mysql2', 'sqlite3', 'better-sqlite3', 'prisma', 'drizzle-orm'].includes(d))
  ) {
    addSkill('SQL', 'SQL schema / relational database integration');
  }

  // HTML/CSS & Tailwind CSS
  if (
    langKeys.some((l) => ['html', 'css', 'scss'].includes(l.toLowerCase())) ||
    paths.some((p) => p.endsWith('.html') || p.endsWith('.css'))
  ) {
    addSkill('HTML/CSS', 'HTML & CSS stylesheet files');
  }
  if (
    paths.some((p) => p.includes('tailwind.config')) ||
    deps.includes('tailwindcss')
  ) {
    addSkill('Tailwind CSS', 'Tailwind CSS configuration');
  }

  // REST APIs
  if (
    paths.some((p) => p.includes('routes/') || p.includes('controllers/') || p.includes('api/')) ||
    deps.some((d) => ['axios', 'express', 'fastify'].includes(d))
  ) {
    addSkill('REST APIs', 'API route handlers & HTTP client/server modules');
  }

  // Git
  if ((input.userCommitDates || []).length > 0 || paths.length > 0) {
    addSkill('Git', 'Git repository & commit history');
  }

  return Array.from(detected.entries()).map(([skill, signal]) => ({ skill, signal }));
}

/**
 * A skill becomes "verified" from a GitHub repo ONLY IF the repo passes validation
 * AND the signal for that skill is present in detectedSkills.
 */
export function canGitHubRepoVerifySkill(
  validation: GitHubValidationOutcome,
  detectedSkills: Array<{ skill: string; signal: string }>,
  skillId: string
): boolean {
  if (validation.status !== 'valid') return false;
  const normTarget = normalizeSkillName(skillId).canonical.toLowerCase();
  return detectedSkills.some(
    (d) => normalizeSkillName(d.skill).canonical.toLowerCase() === normTarget
  );
}

// ============================================================================
// PART 3: JD-TO-PROFILE GAP ANALYSIS (DETERMINISTIC SCORING IN CODE)
// ============================================================================

/**
 * Deterministic JD-to-Profile Gap Analysis scorer:
 * - Points: verified = 1.0, declared = 0.4, missing = 0
 * - Weights: core = 3, important = 2, nice-to-have = 1
 * - Score = Math.round((sum(points * weight) / sum(weights)) * 100)
 * - Confidence = "High" if >= 5 JD skills extracted, "Low" otherwise
 */
export function computeJdGapAnalysis(params: {
  extraction: JdExtractionOutput;
  context: SkillStatusContext;
  companyOverride?: string;
  roleOverride?: string;
}): JdGapAnalysisResult {
  const { extraction, context, companyOverride, roleOverride } = params;
  const roleTitle = (roleOverride || extraction.roleTitle || 'Target Role').trim();
  const company = (companyOverride || extraction.company || 'Target Company').trim();
  const seniority = (extraction.seniority || 'Mid-Level').trim();

  const seenSkillsLower = new Set<string>();
  const allEvaluatedSkills: JdEvaluatedSkillItem[] = [];

  const pushSkill = (
    rawSkill: string,
    importance: 'core' | 'important' | 'nice-to-have',
    quote: string
  ) => {
    const cleanedRaw = String(rawSkill || '').trim();
    if (!cleanedRaw) return;
    const { canonical, isKnown } = normalizeSkillName(cleanedRaw);
    const keyLower = canonical.toLowerCase();
    if (seenSkillsLower.has(keyLower)) return;
    seenSkillsLower.add(keyLower);

    const status = getSkillStatus(canonical, context);
    const points: 1.0 | 0.4 | 0 =
      status === 'verified' ? 1.0 : status === 'declared' ? 0.4 : 0;
    const weight: 3 | 2 | 1 =
      importance === 'core' ? 3 : importance === 'important' ? 2 : 1;
    const weightedPoints = Number((points * weight).toFixed(2));
    const potentialPointGain = Number(((1.0 - points) * weight).toFixed(2));

    const evidenceItems =
      status === 'verified' ? getValidEvidenceForSkill(canonical, context.evidence) : [];

    const defaultEffort: 'low' | 'medium' | 'high' =
      status === 'declared'
        ? 'low'
        : importance === 'core'
        ? 'high'
        : 'medium';

    allEvaluatedSkills.push({
      rawSkill: cleanedRaw,
      skill: canonical,
      isKnown,
      importance,
      weight,
      status,
      points,
      weightedPoints,
      potentialPointGain,
      quote: String(quote || `Required for ${roleTitle}`).trim(),
      evidenceItems,
      estimatedEffort: defaultEffort,
      effortReason:
        status === 'declared'
          ? 'Already in your profile; attach a repo or certificate to verify.'
          : importance === 'core'
          ? 'Core requirement; complete a 7-day sprint project to build proof.'
          : 'Build a focused 2-hour deliverable and link it in Proof Vault.',
    });
  };

  for (const item of extraction.mustHave || []) {
    pushSkill(
      item.skill,
      item.importance === 'core' ? 'core' : 'important',
      item.quote
    );
  }

  for (const item of extraction.niceToHave || []) {
    pushSkill(item.skill, 'nice-to-have', item.quote);
  }

  const totalPossibleWeight = allEvaluatedSkills.reduce((acc, s) => acc + s.weight, 0);
  const totalWeightedPoints = Number(
    allEvaluatedSkills.reduce((acc, s) => acc + s.weightedPoints, 0).toFixed(2)
  );

  const score =
    totalPossibleWeight > 0
      ? Math.round((totalWeightedPoints / totalPossibleWeight) * 100)
      : 0;

  const confidence: 'High' | 'Low' = allEvaluatedSkills.length >= 5 ? 'High' : 'Low';
  const confidenceReason =
    confidence === 'High'
      ? `${allEvaluatedSkills.length} distinct skills extracted and weighted from the job description.`
      : `Only ${allEvaluatedSkills.length} skill${
          allEvaluatedSkills.length === 1 ? '' : 's'
        } detected in the job description (5+ recommended for high confidence).`;

  const knownTechCount = allEvaluatedSkills.filter((s) => s.isKnown).length;
  const nonTechNotice =
    knownTechCount < 2
      ? 'This job description contains few standard software/technical skills. Custom domain skills are shown as separate entries.'
      : undefined;

  const mustHaveSkills = allEvaluatedSkills.filter(
    (s) => s.importance !== 'nice-to-have'
  );
  const niceToHaves = allEvaluatedSkills.filter(
    (s) => s.importance === 'nice-to-have'
  );

  // Groups include all evaluated skills (or we show nice-to-haves in their collapsible section too)
  const youCanProve = allEvaluatedSkills.filter((s) => s.status === 'verified');
  const needsProof = allEvaluatedSkills.filter((s) => s.status === 'declared');
  const gaps = allEvaluatedSkills.filter((s) => s.status === 'missing');

  // Top 3 highest-impact skills to prove (declared or missing), ranked by weight & potential point gain
  const whatToDoFirst = [...allEvaluatedSkills]
    .filter((s) => s.status !== 'verified')
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      if (b.potentialPointGain !== a.potentialPointGain) {
        return b.potentialPointGain - a.potentialPointGain;
      }
      // Prefer declared skills slightly when weight is tied because proving them is faster
      if (a.status === 'declared' && b.status !== 'declared') return -1;
      if (b.status === 'declared' && a.status !== 'declared') return 1;
      return 0;
    })
    .slice(0, 3);

  const verdictOneLiner =
    score >= 75
      ? `Strong verified match (${score}%): you can prove ${youCanProve.length} of ${allEvaluatedSkills.length} skills for ${roleTitle} at ${company}.`
      : score >= 45
      ? `Moderate match (${score}%): you have ${youCanProve.length} verified and ${needsProof.length} declared skills—attach proof for ${
          whatToDoFirst
            .slice(0, 2)
            .map((s) => s.skill)
            .join(' and ') || 'your top skills'
        } before applying.`
      : `Early readiness (${score}%): ${gaps.length} required skills are currently missing—start a 7-day proof sprint for ${
          whatToDoFirst
            .slice(0, 2)
            .map((s) => s.skill)
            .join(' and ') || roleTitle
        }.`;

  const computedStrategy: 'apply now' | 'apply after proving X and Y' | 'build skills first' =
    score >= 72
      ? 'apply now'
      : needsProof.length > 0 || score >= 40
      ? 'apply after proving X and Y'
      : 'build skills first';

  const computedStrategyLabel =
    score >= 72
      ? 'Apply now'
      : needsProof.length > 0 || score >= 40
      ? `Apply after proving ${
          whatToDoFirst
            .slice(0, 2)
            .map((s) => s.skill)
            .join(' and ') || 'key skills'
        }`
      : 'Build skills first';

  return {
    roleTitle,
    company,
    seniority,
    score,
    totalWeightedPoints,
    totalPossibleWeight,
    confidence,
    confidenceReason,
    verdictOneLiner,
    verdict: verdictOneLiner,
    aiSummary: verdictOneLiner,
    strategyLabel: computedStrategyLabel,
    applicationStrategy: computedStrategy,
    nonTechNotice,
    youCanProve,
    needsProof,
    gaps,
    niceToHaves,
    allEvaluatedSkills,
    whatToDoFirst,
    responsibilities: extraction.responsibilities || [],
    softSkills: extraction.softSkills || [],
    experienceRequired: extraction.experienceRequired || 'Not specified',
    redFlags: extraction.redFlags || [],
    aiExplanation: {
      summary: verdictOneLiner,
      strategy: computedStrategy,
      strategyLabel: computedStrategyLabel,
      effortBySkill: Object.fromEntries(
        whatToDoFirst.map((s) => [
          s.skill,
          {
            effort: s.estimatedEffort || 'medium',
            reason: s.effortReason || 'Attach verifiable proof in Proof Vault.',
          },
        ])
      ),
    },
  };
}
