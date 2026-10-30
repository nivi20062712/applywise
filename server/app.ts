import 'dotenv/config';
import express, { Request, Response } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, hashPassword, verifyPassword } from './db';
import {
  runAIAnalysis,
  extractDocumentTextFromBuffer,
  buildDeterministicAnalysis,
  getAIProviderStatus,
  runNvidiaCoachInsight,
  generateProofTask,
  runCareerCoachTab,
  auditProofSnippet,
  evaluateInterviewAnswer,
  runAICareerCopilot,
  generateResumeStudioContent,
  reviewGitHubRepoWithAI,
  extractJdRequirementsWithAI,
  explainJdGapWithAI,
  classifyUploadDocumentWithAI,
  inspectImageBufferMetadata,
  runVisionModelDocumentFallback,
} from './analyzer';
import {
  cleanHtmlText,
  identifySkills,
  calculateSkillTrends,
  FEATURED_COMPANY_JOBS,
  DEMO_PROFILES,
  JobItem,
} from '../src/utils/skillMatcher';
import {
  normalizeEvidenceItem,
  normalizeSkillName,
  parseGitHubRepoUrl,
  validateGitHubRepoProof,
  detectSkillsFromGitHubRepo,
  computeJdGapAnalysis,
  buildResumeGenerationInput,
} from '../src/utils/evidenceModel';
import {
  buildUploadCheckTestScenarios,
  runUploadCheckPipeline,
  computeUploadTrustTier,
  mapDetectedTypeToCategory,
  fixMojibake,
  UPLOAD_CHECK_TEST_SCENARIOS,
} from '../src/utils/uploadCheck';
import {
  verifyNebiusModelsOnStartup,
  getNebiusConfigState,
  checkUserAiRateLimit,
  executeNebiusStructuredTask,
  streamNebiusChatResponse,
  loadUserProofVaultFromDb,
  runUnifiedCopilotChat,
  summarizeSkillDemandWithNebius,
} from './nebiusAi';
import {
  getActivePassport,
  createOrUpdatePassport,
  revokePassport,
  getPublicPassportData,
} from './passport';
import {
  isTavilyConfigured,
  getTavilyStatus,
  tavilySearch,
  tavilyExtract,
} from './tavily';
import type {
  AttachmentItem,
  CopilotStructuredTask,
  CopilotVaultPayload,
  SelectedUploadCategory,
  UploadCheckFlag,
  UploadCheckResult,
} from '../src/types';

export const app = express();

// Run Nebius Token Factory GET /v1/models verification once on startup
void verifyNebiusModelsOnStartup();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Keep request bodies under ~4 MB per Netlify serverless constraints
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));

// Write temporary upload files ONLY to os.tmpdir()
const uploadDir = path.join(os.tmpdir(), 'applywise-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 4 * 1024 * 1024 },
});

const additionalCuratedJobs: JobItem[] = [
  ...FEATURED_COMPANY_JOBS,
  {
    id: 'live-1',
    title: 'Frontend Developer (React / TypeScript)',
    company: 'InnoTech Solutions',
    location: 'Bengaluru / Hybrid',
    created: 'Today',
    url: 'https://www.linkedin.com/jobs/search/?keywords=Frontend%20Developer',
    description:
      'Looking for a Frontend Developer proficient in React, TypeScript, and modern HTML/CSS. You will build user-facing components, consume REST APIs, and participate in code reviews via Git. Familiarity with Unit Testing (Jest/Vitest) is a plus.',
    skills: ['React', 'TypeScript', 'HTML/CSS', 'Git', 'REST APIs', 'Unit Testing'],
  },
  {
    id: 'live-2',
    title: 'Junior Full Stack Engineer',
    company: 'CloudPulse Dynamics',
    location: 'Remote',
    created: '1 day ago',
    url: 'https://www.linkedin.com/jobs/search/?keywords=Full%20Stack%20Engineer',
    description:
      'Join our agile team to build responsive web interfaces and microservices. Must have working knowledge of JavaScript/TypeScript, React, Node.js, and SQL databases. Docker and CI/CD exposure is beneficial.',
    skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'SQL', 'Git', 'Docker'],
  },
];

interface AuthUserRow {
  id: number;
  name: string;
  email: string;
  account_role?: string;
}

interface ProfileRow {
  id: number;
  user_id: number;
  name: string;
  email?: string;
  title: string;
  role: string;
  location: string;
  education: string;
  skills_text: string;
  resume_text: string;
  github_username?: string;
  onboarded: number;
}

function createSession(userId: number, user: AuthUserRow) {
  const token = randomUUID();
  db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))"
  ).run(token, userId);
  return {
    token,
    user: {
      id: userId,
      name: user.name,
      email: user.email,
      role: user.account_role || 'Student',
    },
  };
}

function getAuthUser(req: Request): AuthUserRow | null {
  const token = String(req.header('x-applywise-token') || '');
  if (token) {
    const row = db
      .prepare(
        `SELECT users.id, users.name, users.email, users.account_role 
         FROM sessions 
         JOIN users ON users.id = sessions.user_id 
         WHERE token = ? AND expires_at > datetime('now')`
      )
      .get(token) as AuthUserRow | undefined;
    if (row) return row;
  }
  return null;
}

function getOrCreateUserProfile(user: AuthUserRow): ProfileRow {
  let row = db.prepare('SELECT * FROM profile WHERE user_id=?').get(user.id) as
    | ProfileRow
    | undefined;
  if (!row) {
    const isDemo = user.email === 'demo@applywise.local';
    db.prepare(
      `INSERT INTO profile (user_id, name, title, role, location, education, skills_text, resume_text, onboarded)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      user.id,
      user.name || '',
      isDemo ? 'Junior Frontend Developer' : '',
      user.account_role || 'Student',
      isDemo ? 'Bengaluru / Remote' : '',
      isDemo ? 'B.Tech Computer Science, 2026' : '',
      isDemo ? 'React, JavaScript, HTML/CSS, Git, Figma, REST APIs' : '',
      '',
      isDemo ? 1 : 0
    );
    row = db.prepare('SELECT * FROM profile WHERE user_id=?').get(user.id) as ProfileRow;
  }
  return {
    ...row,
    email: user.email,
  };
}

// ============================================================================
// PRIORITY 1: AI ENGINE STATUS & INFERENCE INSPECTOR
// ============================================================================

app.get('/api/ai-status', (req: Request, res: Response): void => {
  const preferredModel = String(req.query.model || '').trim() || undefined;
  res.json(getAIProviderStatus(preferredModel));
});

app.get('/api/tavily-status', (_req: Request, res: Response): void => {
  res.json(getTavilyStatus());
});

// ============================================================================
// PRIORITY 3: SLIDE-OVER SKILL DRAWER -> 2-HOUR PROOF TASK GENERATOR
// ============================================================================

app.post('/api/proof-task', async (req: Request, res: Response): Promise<void> => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const { skill, targetRole, currentTier, modelId } = req.body || {};

  if (!skill || typeof skill !== 'string') {
    res.status(400).json({ error: 'Skill name is required to generate a proof task.' });
    return;
  }

  try {
    const userProf = db.prepare('SELECT * FROM profile WHERE user_id=?').get(userId) as
      | ProfileRow
      | undefined;
    const resolvedRole =
      (typeof targetRole === 'string' && targetRole.trim()) ||
      userProf?.title ||
      'Full Stack Software Engineer';

    const taskBrief = await generateProofTask({
      skill: skill.trim(),
      targetRole: resolvedRole,
      currentTier: typeof currentTier === 'string' ? currentTier : undefined,
      modelId: typeof modelId === 'string' ? modelId : undefined,
    });
    res.json(taskBrief);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not generate proof task.';
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// PRIORITY 5: TABBED AI CAREER COACH (INTERVIEW / ATS BULLETS / SALARY)
// ============================================================================

app.post('/api/career-coach', async (req: Request, res: Response): Promise<void> => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const { tab = 'interview', sampleDuty = '', modelId } = req.body || {};
  const validTab = ['interview', 'bullets', 'salary'].includes(tab)
    ? (tab as 'interview' | 'bullets' | 'salary')
    : 'interview';

  try {
    const userProf = db.prepare('SELECT * FROM profile WHERE user_id=?').get(userId) as
      | ProfileRow
      | undefined;
    const latestAnalysisRow = db
      .prepare('SELECT data FROM analyses WHERE user_id=? ORDER BY id DESC LIMIT 1')
      .get(userId) as { data: string } | undefined;

    let weakSkills: string[] = [];
    if (latestAnalysisRow?.data) {
      try {
        const parsed = JSON.parse(latestAnalysisRow.data) as {
          missingSkills?: Array<{ skill: string }>;
          unprovenSkills?: Array<{ skill: string }>;
        };
        weakSkills = [
          ...(parsed.missingSkills || []).map((m) => m.skill),
          ...(parsed.unprovenSkills || []).map((u) => u.skill),
        ];
      } catch {
        // Ignore parse error
      }
    }

    const result = await runCareerCoachTab({
      tab: validTab,
      candidateName: userProf?.name || authUser?.name || 'Candidate',
      targetRole: userProf?.title || 'Full-Stack Software Engineer',
      skills: userProf?.skills_text || 'React, TypeScript, Node.js, SQL, Git',
      weakSkills,
      sampleDuty: typeof sampleDuty === 'string' ? sampleDuty : undefined,
      modelId: typeof modelId === 'string' ? modelId : undefined,
    });

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Career coach error.';
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// INTERACTIVE AI ROUTES: PROOF AUDITOR, INTERVIEW EVALUATOR & AI COPILOT
// ============================================================================

app.post('/api/audit-proof', async (req: Request, res: Response): Promise<void> => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const { skill, targetRole, proofTitle, proofUrl, proofText, modelId } = req.body || {};

  if (!skill || !proofText || typeof proofText !== 'string' || proofText.trim().length < 5) {
    res.status(400).json({ error: 'Please provide a skill and a README or code description to audit.' });
    return;
  }

  try {
    const userProf = db.prepare('SELECT * FROM profile WHERE user_id=?').get(userId) as
      | ProfileRow
      | undefined;
    const result = await auditProofSnippet({
      skill: String(skill),
      targetRole: String(targetRole || userProf?.title || 'Software Engineer'),
      proofTitle: String(proofTitle || `${skill} Project`),
      proofUrl: typeof proofUrl === 'string' ? proofUrl : undefined,
      proofText: String(proofText),
      modelId: typeof modelId === 'string' ? modelId : undefined,
    });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Proof audit failed.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/evaluate-answer', async (req: Request, res: Response): Promise<void> => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const { question, targetSkill, targetRole, userAnswer, verifiedProofs, modelId } = req.body || {};

  if (!question || !userAnswer || typeof userAnswer !== 'string' || userAnswer.trim().length < 5) {
    res.status(400).json({ error: 'Please provide a question and your draft interview answer.' });
    return;
  }

  try {
    const userProf = db.prepare('SELECT * FROM profile WHERE user_id=?').get(userId) as
      | ProfileRow
      | undefined;
    const result = await evaluateInterviewAnswer({
      question: String(question),
      targetSkill: String(targetSkill || 'System Design'),
      targetRole: String(targetRole || userProf?.title || 'Software Engineer'),
      userAnswer: String(userAnswer),
      verifiedProofs: Array.isArray(verifiedProofs) ? verifiedProofs.map(String) : [],
      modelId: typeof modelId === 'string' ? modelId : undefined,
    });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Answer evaluation failed.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/ai-copilot', async (req: Request, res: Response): Promise<void> => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const {
    prompt,
    targetRole,
    readinessScore,
    verifiedSkills,
    unprovenSkills,
    missingSkills,
    viewerMode,
    modelId,
  } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 2) {
    res.status(400).json({ error: 'Please enter a question for the AI Career Copilot.' });
    return;
  }

  try {
    const userProf = db.prepare('SELECT * FROM profile WHERE user_id=?').get(userId) as
      | ProfileRow
      | undefined;
    const result = await runAICareerCopilot({
      prompt: String(prompt),
      targetRole: String(targetRole || userProf?.title || 'Senior Full-Stack Engineer'),
      readinessScore: typeof readinessScore === 'number' ? readinessScore : 72,
      verifiedSkills: Array.isArray(verifiedSkills) ? verifiedSkills.map(String) : [],
      unprovenSkills: Array.isArray(unprovenSkills) ? unprovenSkills.map(String) : [],
      missingSkills: Array.isArray(missingSkills) ? missingSkills.map(String) : [],
      viewerMode: viewerMode === 'student' ? 'student' : 'jobseeker',
      modelId: typeof modelId === 'string' ? modelId : undefined,
    });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI Copilot request failed.';
    res.status(500).json({ error: message });
  }
});

// Legacy single-note endpoint
app.post('/api/ai-coach', async (req: Request, res: Response): Promise<void> => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const { mode = 'evidence', modelId } = req.body || {};

  try {
    const userProf = db.prepare('SELECT * FROM profile WHERE user_id=?').get(userId) as
      | ProfileRow
      | undefined;
    const evCountRow = db
      .prepare('SELECT COUNT(*) as cnt FROM evidence WHERE user_id=?')
      .get(userId) as { cnt: number } | undefined;
    const insight = await runNvidiaCoachInsight({
      candidateName: userProf?.name || authUser?.name || 'Candidate',
      targetRole: userProf?.title || 'Full Stack Software Engineer',
      skills: userProf?.skills_text || 'React, TypeScript, Node.js, SQL, Git',
      evidenceCount: Number(evCountRow?.cnt || 0),
      mode: ['evidence', 'interview', 'bullet'].includes(mode) ? mode : 'evidence',
      modelId: typeof modelId === 'string' ? modelId : undefined,
    });
    res.json(insight);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI coach error';
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// PRIORITY 4: 1-CLICK DEMO PROFILE HYDRATION
// ============================================================================

function hydrateDemoAccountWithPreset(presetId = 'senior-fullstack') {
  const demoUser = db
    .prepare('SELECT * FROM users WHERE email=?')
    .get('demo@applywise.local') as AuthUserRow | undefined;
  const userId = demoUser?.id || 1;

  const preset = DEMO_PROFILES.find((p) => p.id === presetId) || DEMO_PROFILES[0];

  // Update demo user record name & role
  db.prepare('UPDATE users SET name=?, account_role=? WHERE id=?').run(
    preset.name,
    preset.role,
    userId
  );

  // 1. Update profile for demo account
  const existing = db.prepare('SELECT id FROM profile WHERE user_id=?').get(userId);
  if (existing) {
    db.prepare(
      `UPDATE profile SET
         name=?,
         title=?,
         role=?,
         location=?,
         education=?,
         skills_text=?,
         resume_text=?,
         onboarded=1
       WHERE user_id=?`
    ).run(
      preset.name,
      preset.title,
      preset.role,
      preset.location,
      preset.education,
      preset.skills_text,
      preset.resume_text,
      userId
    );
  } else {
    db.prepare(
      `INSERT INTO profile (user_id, name, title, role, location, education, skills_text, resume_text, onboarded)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(
      userId,
      preset.name,
      preset.title,
      preset.role,
      preset.location,
      preset.education,
      preset.skills_text,
      preset.resume_text
    );
  }

  // 2. Replace demo evidence & clear any personal attachments on demo account
  db.prepare('DELETE FROM attachments WHERE user_id=?').run(userId);
  db.prepare('DELETE FROM evidence WHERE user_id=?').run(userId);
  const insertEv = db.prepare(
    'INSERT INTO evidence (user_id, skill, type, title, url, extracted_summary) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const ev of preset.evidence) {
    insertEv.run(userId, ev.skill, ev.type, ev.title, ev.url, ev.extracted_summary);
  }

  // 3. Build deterministic readiness analysis for the preset's target role
  const savedEvidence = db
    .prepare('SELECT * FROM evidence WHERE user_id=? ORDER BY id DESC')
    .all(userId) as Array<{
    id: number;
    skill: string;
    type: string;
    title: string;
    url?: string;
    extracted_summary?: string;
  }>;

  const analysis = buildDeterministicAnalysis(
    preset.resume_text,
    preset.targetJobDescription,
    savedEvidence,
    preset.name,
    preset.title
  );

  db.prepare('DELETE FROM analyses WHERE user_id=?').run(userId);
  const insertAnalysis = db
    .prepare(
      'INSERT INTO analyses (user_id, job_title, company, job_description, data) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      userId,
      preset.targetJobTitle,
      preset.targetCompany,
      preset.targetJobDescription,
      JSON.stringify(analysis)
    );

  const updatedProfile = db.prepare('SELECT * FROM profile WHERE user_id=?').get(userId);
  const session = createSession(userId, {
    id: userId,
    name: preset.name,
    email: 'demo@applywise.local',
    account_role: preset.role,
  });

  return {
    ok: true,
    presetId: preset.id,
    label: preset.label,
    token: session.token,
    user: session.user,
    profile: updatedProfile,
    evidence: savedEvidence,
    analysis: {
      ...analysis,
      id: Number(insertAnalysis.lastInsertRowid),
      jobTitle: preset.targetJobTitle,
      company: preset.targetCompany,
      job_description: preset.targetJobDescription,
    },
  };
}

// Ensure demo@applywise.local has a clean initial analysis on startup
try {
  const demoRow = db
    .prepare('SELECT id, name FROM users WHERE email=?')
    .get('demo@applywise.local') as { id: number; name: string } | undefined;
  if (demoRow) {
    const latestDemoAnalysis = db
      .prepare('SELECT id, data FROM analyses WHERE user_id=? ORDER BY id DESC LIMIT 1')
      .get(demoRow.id) as { id: number; data: string } | undefined;
    if (
      !latestDemoAnalysis ||
      demoRow.name === 'Nivindharan' ||
      latestDemoAnalysis.data.includes('Nivindharan') ||
      latestDemoAnalysis.data.includes('demonstrates')
    ) {
      hydrateDemoAccountWithPreset('senior-fullstack');
    }
  }
} catch {
  // Ignore startup seed error
}

app.get('/api/demo-profiles', (_req: Request, res: Response): void => {
  res.json(DEMO_PROFILES);
});

app.post('/api/demo-profile', (req: Request, res: Response): void => {
  const { presetId = 'senior-fullstack' } = req.body || {};
  const payload = hydrateDemoAccountWithPreset(presetId);
  res.json(payload);
});

// ============================================================================
// AUTHENTICATION & PROFILE ROUTES
// ============================================================================

app.post('/api/auth/register', (req: Request, res: Response): void => {
  const { name, email, password, role } = req.body || {};
  if (
    typeof name !== 'string' ||
    name.trim().length < 2 ||
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof password !== 'string' ||
    password.length < 8 ||
    !['Student', 'Job seeker'].includes(role)
  ) {
    res.status(400).json({
      error:
        'Please enter your name, choose Student or Job seeker, and provide a valid email with at least an 8-character password.',
    });
    return;
  }

  try {
    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim().slice(0, 80);
    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(cleanEmail);
    if (existing) {
      res.status(409).json({ error: 'An account already exists with that email address.' });
      return;
    }

    const result = db
      .prepare('INSERT INTO users (name, email, password_hash, account_role) VALUES (?, ?, ?, ?)')
      .run(cleanName, cleanEmail, hashPassword(password), role);

    const userId = Number(result.lastInsertRowid);

    db.prepare(
      `INSERT INTO profile (user_id, name, title, role, location, education, skills_text, resume_text, onboarded)
       VALUES (?, ?, '', ?, '', '', '', '', 0)`
    ).run(userId, cleanName, role);

    const user: AuthUserRow = { id: userId, name: cleanName, email: cleanEmail, account_role: role };
    const session = createSession(user.id, user);
    res.status(201).json(session);
  } catch {
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

app.post('/api/auth/login', (req: Request, res: Response): void => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Enter your email and password.' });
    return;
  }

  const user = db
    .prepare('SELECT * FROM users WHERE email=?')
    .get(email.toLowerCase().trim()) as (AuthUserRow & { password_hash: string }) | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'Incorrect email or password.' });
    return;
  }

  getOrCreateUserProfile(user);
  const session = createSession(user.id, user);
  res.json(session);
});

app.get('/api/auth/me', (req: Request, res: Response): void => {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Please sign in to continue.' });
    return;
  }
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.account_role || 'Student',
  });
});

// ============================================================================
// PROOF PASSPORT ENDPOINTS
// ============================================================================

// Authenticated: GET /api/passport/me -> active passport { token, showName, createdAt } or { passport: null }
app.get('/api/passport/me', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  if (!authUser) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const active = getActivePassport(authUser.id);
  if (!active) {
    res.json({ passport: null });
    return;
  }

  const payload = {
    token: active.token,
    showName: Boolean(active.show_name),
    createdAt: active.created_at,
    summary: active.summary,
  };
  res.json({
    ...payload,
    passport: payload,
  });
});

// Authenticated: POST /api/passport { showName } -> create or update show_name
app.post('/api/passport', async (req: Request, res: Response): Promise<void> => {
  const authUser = getAuthUser(req);
  if (!authUser) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const showName = Boolean(req.body?.showName);
  try {
    const passport = await createOrUpdatePassport({
      userId: authUser.id,
      showName,
    });

    const payload = {
      token: passport.token,
      showName: Boolean(passport.show_name),
      createdAt: passport.created_at,
      summary: passport.summary,
    };
    res.json({
      ...payload,
      passport: payload,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to manage passport' });
  }
});

// Authenticated: DELETE /api/passport -> revoke active passport
app.delete('/api/passport', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  if (!authUser) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  revokePassport(authUser.id);
  res.json({ ok: true, message: 'Passport revoked.' });
});

// Public: GET /api/public/passport/:token -> read-only public verified passport
app.get('/api/public/passport/:token', async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');

  const token = String(req.params.token || '').trim();
  if (!token) {
    res.status(404).json({ error: 'Passport not found or revoked.' });
    return;
  }

  const payload = await getPublicPassportData(token);
  if (!payload) {
    res.status(404).json({ error: 'Passport not found or revoked.' });
    return;
  }

  res.json(payload);
});

app.get('/api/profile', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  if (!authUser) {
    const demo = db
      .prepare('SELECT * FROM users WHERE email=?')
      .get('demo@applywise.local') as AuthUserRow;
    res.json(getOrCreateUserProfile(demo));
    return;
  }
  const row = getOrCreateUserProfile(authUser);
  res.json(row);
});

app.put('/api/profile', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const demoUser = db
    .prepare('SELECT id FROM users WHERE email=?')
    .get('demo@applywise.local') as { id: number } | undefined;
  const userId = authUser ? authUser.id : demoUser?.id || 1;

  const {
    name = '',
    title = '',
    role = 'Student',
    location = '',
    education = '',
    skills_text = '',
    resume_text = '',
    github_username,
  } = req.body || {};
  if (!['Student', 'Job seeker', ''].includes(role)) {
    res.status(400).json({ error: 'Please choose Student or Job seeker.' });
    return;
  }

  const cleanName = String(name).trim().slice(0, 80);
  const cleanTitle = String(title).trim().slice(0, 100);
  const isOnboarded = cleanName.length > 0 && cleanTitle.length > 0 ? 1 : 0;

  const existing = db.prepare('SELECT id, github_username FROM profile WHERE user_id=?').get(userId) as
    | { id: number; github_username?: string }
    | undefined;
  const resolvedGithubUsername =
    github_username !== undefined
      ? String(github_username).trim().replace(/^@/, '').slice(0, 60)
      : existing?.github_username || '';

  if (existing) {
    db.prepare(
      `UPDATE profile SET
         name=?,
         title=?,
         role=?,
         location=?,
         education=?,
         skills_text=?,
         resume_text=?,
         github_username=?,
         onboarded=?
       WHERE user_id=?`
    ).run(
      cleanName,
      cleanTitle,
      role || 'Student',
      String(location).trim().slice(0, 100),
      String(education).trim().slice(0, 160),
      String(skills_text).trim().slice(0, 1000),
      String(resume_text).slice(0, 50000),
      resolvedGithubUsername,
      isOnboarded,
      userId
    );
  } else {
    db.prepare(
      `INSERT INTO profile (user_id, name, title, role, location, education, skills_text, resume_text, github_username, onboarded)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      cleanName,
      cleanTitle,
      role || 'Student',
      String(location).trim().slice(0, 100),
      String(education).trim().slice(0, 160),
      String(skills_text).trim().slice(0, 1000),
      String(resume_text).slice(0, 50000),
      resolvedGithubUsername,
      isOnboarded
    );
  }

  if (cleanName) {
    db.prepare('UPDATE users SET name=?, account_role=? WHERE id=?').run(
      cleanName,
      role || 'Student',
      userId
    );
  }

  res.json({ ok: true, onboarded: isOnboarded, github_username: resolvedGithubUsername });
});

// ============================================================================
// ATTACHMENTS & EVIDENCE ROUTES (PART 0 SHARED EVIDENCE MODEL)
// ============================================================================

function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  if (raw && typeof raw === 'object') {
    return raw as T;
  }
  return fallback;
}

function formatAttachmentRow(row: Record<string, unknown>): AttachmentItem {
  const readability = safeParseJson<AttachmentItem['readability']>(row.readability_json, {
    status: 'readable',
    charCount: String(row.extracted_text || '').length,
    ocrConfidence: 95,
    source: 'Document Text Layer',
  });
  const flags = safeParseJson<UploadCheckFlag[]>(row.flags_json, []);
  const detectedSkills = safeParseJson<string[]>(
    row.detected_skills_json,
    identifySkills(String(row.extracted_text || ''))
  );
  const uploadCheck = safeParseJson<UploadCheckResult | undefined>(row.upload_check_json, undefined);

  return {
    id: Number(row.id),
    filename: String(row.filename || 'document.pdf'),
    mime_type: String(row.mime_type || 'application/pdf'),
    category: (String(row.category || 'resume') as SelectedUploadCategory) || 'resume',
    extracted_text: String(row.extracted_text || ''),
    file_size: Number(row.file_size || 0),
    created_at: String(row.created_at || new Date().toISOString()),
    hash: row.hash ? String(row.hash) : uploadCheck?.hash,
    user_title: row.user_title ? String(row.user_title) : uploadCheck?.userTitle || String(row.filename || ''),
    selected_category: (row.selected_category || row.category || 'resume') as SelectedUploadCategory,
    detected_type: (row.detected_type || uploadCheck?.detectedType || row.category || 'resume') as AttachmentItem['detected_type'],
    type_confidence: Number(row.type_confidence ?? uploadCheck?.typeConfidence ?? 0.9),
    name_match: (row.name_match || uploadCheck?.nameMatch || 'match') as 'match' | 'mismatch' | 'unknown',
    readability,
    flags,
    detectedSkills,
    trust: (row.trust || uploadCheck?.trust || 'high') as AttachmentItem['trust'],
    confirmedByUser: Boolean(row.confirmed_by_user ?? true),
    upload_check: uploadCheck,
  };
}

app.get('/api/attachments', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const rows = db
    .prepare('SELECT * FROM attachments WHERE user_id=? ORDER BY id DESC')
    .all(userId) as Array<Record<string, unknown>>;
  res.json(rows.map(formatAttachmentRow));
});

app.patch('/api/attachments/:id', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT * FROM attachments WHERE id=? AND user_id=?')
    .get(id, userId) as Record<string, unknown> | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Attachment not found.' });
    return;
  }

  const {
    filename,
    user_title,
    category,
    selected_category,
    name_match,
    flags,
    trust,
    confirmed_by_user,
    upload_check,
    updateProfileName,
  } = req.body || {};

  if (updateProfileName && typeof updateProfileName === 'string' && updateProfileName.trim()) {
    db.prepare('UPDATE profile SET name=? WHERE user_id=?').run(updateProfileName.trim().slice(0, 120), userId);
    db.prepare('UPDATE users SET name=? WHERE id=?').run(updateProfileName.trim().slice(0, 120), userId);
  }

  const nextCategory = String(category || selected_category || existing.category || 'resume');
  const nextFlagsJson =
    flags !== undefined
      ? JSON.stringify(flags)
      : String(existing.flags_json || '[]');
  const nextTrust = String(trust || existing.trust || 'high');
  const nextUploadCheckJson =
    upload_check !== undefined
      ? JSON.stringify(upload_check)
      : (existing.upload_check_json as string | null);

  db.prepare(
    `UPDATE attachments SET
       filename=COALESCE(?, filename),
       user_title=COALESCE(?, user_title),
       category=?,
       selected_category=?,
       name_match=COALESCE(?, name_match),
       flags_json=?,
       trust=?,
       confirmed_by_user=COALESCE(?, confirmed_by_user),
       upload_check_json=COALESCE(?, upload_check_json)
     WHERE id=? AND user_id=?`
  ).run(
    filename ? String(filename).trim().slice(0, 180) : null,
    user_title !== undefined ? String(user_title).trim().slice(0, 180) : null,
    nextCategory,
    nextCategory,
    name_match ? String(name_match) : null,
    nextFlagsJson,
    nextTrust,
    confirmed_by_user !== undefined ? (confirmed_by_user ? 1 : 0) : null,
    nextUploadCheckJson,
    id,
    userId
  );

  // Also sync any linked evidence items for this attachment if trust improved
  if (nextTrust === 'high' || nextTrust === 'medium') {
    const linkedEvRows = db
      .prepare('SELECT * FROM evidence WHERE user_id=? AND attachment_name=?')
      .all(userId, String(existing.filename)) as Array<Record<string, unknown>>;
    for (const evRow of linkedEvRows) {
      const detailsObj = safeParseJson<Record<string, unknown>>(evRow.details, {});
      detailsObj.trust = nextTrust;
      detailsObj.unconfirmedEvidence = false;
      detailsObj.identityUnconfirmed = false;
      db.prepare('UPDATE evidence SET details=?, status=? WHERE id=?').run(
        JSON.stringify(detailsObj),
        'valid',
        evRow.id
      );
    }
  }

  const updated = db
    .prepare('SELECT * FROM attachments WHERE id=?')
    .get(id) as Record<string, unknown>;
  res.json(formatAttachmentRow(updated));
});

app.delete('/api/attachments/:id', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const id = Number(req.params.id);
  db.prepare('DELETE FROM attachments WHERE id=? AND user_id=?').run(id, userId);
  res.json({ ok: true });
});

function formatEvidenceRow(row: Record<string, unknown>) {
  let parsedDetails = row.details;
  if (typeof row.details === 'string' && row.details.trim().startsWith('{')) {
    try {
      parsedDetails = JSON.parse(row.details);
    } catch {
      parsedDetails = undefined;
    }
  }
  return normalizeEvidenceItem({
    id: row.id as number,
    skill: String(row.skill || row.skill_id || ''),
    skillId: String(row.skill_id || row.skill || ''),
    type: String(row.type || 'link'),
    title: String(row.title || ''),
    url: row.url ? String(row.url) : '',
    status: (row.status as 'pending' | 'valid' | 'rejected') || 'valid',
    reason: row.reason ? String(row.reason) : undefined,
    addedAt: row.added_at ? String(row.added_at) : new Date().toISOString(),
    details: parsedDetails as Record<string, unknown> | undefined,
    attachment_name: row.attachment_name ? String(row.attachment_name) : undefined,
    extracted_summary: row.extracted_summary ? String(row.extracted_summary) : undefined,
  });
}

app.get('/api/evidence', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const rows = db
    .prepare('SELECT * FROM evidence WHERE user_id=? ORDER BY id DESC')
    .all(userId) as Array<Record<string, unknown>>;
  res.json(rows.map(formatEvidenceRow));
});

app.post('/api/evidence', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const {
    skill,
    skillId,
    type,
    title,
    url = '',
    status = 'valid',
    reason = '',
    addedAt,
    details,
    attachment_name = '',
    extracted_summary = '',
  } = req.body || {};

  const resolvedSkill = normalizeSkillName(String(skillId || skill || '').trim()).canonical;
  if (!resolvedSkill || !type || !title) {
    res.status(400).json({ error: 'Skill, evidence type, and title are required.' });
    return;
  }

  const validStatuses = ['pending', 'valid', 'rejected'];
  const safeStatus = validStatuses.includes(String(status)) ? String(status) : 'valid';
  const safeAddedAt = addedAt ? String(addedAt) : new Date().toISOString();
  const serializedDetails =
    details && typeof details === 'object' ? JSON.stringify(details) : typeof details === 'string' ? details : null;

  const result = db
    .prepare(
      `INSERT INTO evidence (
        user_id, skill, skill_id, type, title, url, status, reason, added_at, details, attachment_name, extracted_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      resolvedSkill.slice(0, 80),
      resolvedSkill.slice(0, 80),
      String(type).trim(),
      String(title).trim().slice(0, 180),
      String(url).trim().slice(0, 400),
      safeStatus,
      String(reason || '').slice(0, 300),
      safeAddedAt,
      serializedDetails,
      String(attachment_name).trim().slice(0, 180),
      String(extracted_summary).trim().slice(0, 500)
    );

  const inserted = db
    .prepare('SELECT * FROM evidence WHERE id=?')
    .get(result.lastInsertRowid) as Record<string, unknown>;

  res.status(201).json(inserted ? formatEvidenceRow(inserted) : { id: result.lastInsertRowid });
});

app.patch('/api/evidence/:id', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT * FROM evidence WHERE id=? AND user_id=?')
    .get(id, userId) as Record<string, unknown> | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Evidence item not found.' });
    return;
  }

  const { status, reason, details, title, extracted_summary } = req.body || {};
  const nextStatus = status ? String(status) : String(existing.status || 'valid');
  const nextReason = reason !== undefined ? String(reason) : String(existing.reason || '');
  const nextDetails =
    details !== undefined
      ? typeof details === 'object'
        ? JSON.stringify(details)
        : String(details)
      : (existing.details as string | null);

  db.prepare(
    `UPDATE evidence SET
       status=?,
       reason=?,
       details=?,
       title=COALESCE(?, title),
       extracted_summary=COALESCE(?, extracted_summary)
     WHERE id=? AND user_id=?`
  ).run(
    nextStatus,
    nextReason,
    nextDetails,
    title ? String(title) : null,
    extracted_summary !== undefined ? String(extracted_summary) : null,
    id,
    userId
  );

  const updated = db
    .prepare('SELECT * FROM evidence WHERE id=?')
    .get(id) as Record<string, unknown>;
  res.json(formatEvidenceRow(updated));
});

app.delete('/api/evidence/:id', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const id = Number(req.params.id);
  db.prepare('DELETE FROM evidence WHERE id=? AND user_id=?').run(id, userId);
  res.json({ ok: true });
});

// ============================================================================
// PART 1: RESUME STUDIO WORDING ROUTE
// ============================================================================

app.post('/api/resume-studio/generate', async (req: Request, res: Response): Promise<void> => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const {
    targetRole,
    targetCompany,
    companyName,
    sprintInProgress = false,
    sprintSkillsInProgress = [],
    sprintSkills = [],
    evidence: bodyEvidence,
    declaredSkills: bodyDeclaredSkills,
    modelId,
  } = req.body || {};

  try {
    const userProf = db.prepare('SELECT * FROM profile WHERE user_id=?').get(userId) as
      | ProfileRow
      | undefined;

    const rawEvidence = Array.isArray(bodyEvidence)
      ? bodyEvidence
      : (
          db.prepare('SELECT * FROM evidence WHERE user_id=? ORDER BY id DESC').all(userId) as Array<
            Record<string, unknown>
          >
        ).map(formatEvidenceRow);

    const effectiveSprintSkills = Array.isArray(sprintSkills) && sprintSkills.length > 0
      ? sprintSkills.map(String)
      : Array.isArray(sprintSkillsInProgress)
      ? sprintSkillsInProgress.map(String)
      : [];

    const input = buildResumeGenerationInput({
      context: {
        evidence: rawEvidence,
        profile: (userProf as any) || null,
        declaredSkills: Array.isArray(bodyDeclaredSkills)
          ? bodyDeclaredSkills.map(String)
          : undefined,
      },
      targetRole: String(targetRole || userProf?.title || 'Full-Stack Software Engineer'),
      companyName: String(companyName || targetCompany || 'the hiring organization'),
      candidateName: String(userProf?.name || authUser?.name || 'Candidate'),
      sprintInProgress: Boolean(sprintInProgress),
      sprintSkills: effectiveSprintSkills,
    });

    const output = await generateResumeStudioContent(
      input,
      typeof modelId === 'string' ? modelId : undefined
    );
    res.json({
      ...output,
      inputSummary: {
        verifiedCount: input.verifiedSkills.length,
        declaredCount: input.declaredSkills.length,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate Résumé Studio content.';
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// PART 2: GITHUB REPOSITORY INSPECTION, VALIDATION & AI REVIEW
// ============================================================================

interface SyntheticGitHubRepoFixture {
  description: string;
  isPrivate: boolean;
  isFork: boolean;
  stargazersCount: number;
  defaultBranch: string;
  pushedAt: string;
  languages: Record<string, number>;
  treePaths: string[];
  packageJsonDependencies: Record<string, string>;
  readmeText: string;
  commitCount: number;
  commitSpanDays: number;
}

function getDemoGitHubFixture(
  owner: string,
  repo: string,
  username: string
): SyntheticGitHubRepoFixture | null {
  const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  const cleanUser = username.trim().toLowerCase();
  const isOwnerMatch = cleanUser === owner.toLowerCase();

  if (key.includes('private')) {
    return {
      description: 'Private repository fixture',
      isPrivate: true,
      isFork: false,
      stargazersCount: 0,
      defaultBranch: 'main',
      pushedAt: '2026-10-20T12:00:00Z',
      languages: {},
      treePaths: [],
      packageJsonDependencies: {},
      readmeText: '',
      commitCount: 0,
      commitSpanDays: 0,
    };
  }

  if (key.includes('fork-no-commits') || key.includes('demo-fork')) {
    return {
      description: 'Forked repository with zero user commits',
      isPrivate: false,
      isFork: true,
      stargazersCount: 2,
      defaultBranch: 'main',
      pushedAt: '2026-10-18T10:00:00Z',
      languages: { TypeScript: 25000, JavaScript: 5000 },
      treePaths: ['package.json', 'tsconfig.json', 'src/index.ts'],
      packageJsonDependencies: { react: '^19.0.0', typescript: '^5.8.0' },
      readmeText: '# Forked Project\nUnmodified upstream fork.',
      commitCount: 0,
      commitSpanDays: 0,
    };
  }

  if (key.includes('weak-commits') || key.includes('demo-weak')) {
    return {
      description: 'Single-day 2-commit repository showing weak evidence warning',
      isPrivate: false,
      isFork: false,
      stargazersCount: 1,
      defaultBranch: 'main',
      pushedAt: '2026-10-24T15:00:00Z',
      languages: { TypeScript: 14000, CSS: 2000 },
      treePaths: ['package.json', 'tsconfig.json', 'src/App.tsx', 'README.md'],
      packageJsonDependencies: { react: '^19.0.0', typescript: '^5.8.0' },
      readmeText: '# Mini React App\nInitial prototype pushed in a single day.',
      commitCount: 2,
      commitSpanDays: 1,
    };
  }

  const demoOwnerRepos: Record<string, SyntheticGitHubRepoFixture> = {
    'arjun-mehta/telemetry-cloud-ui': {
      description:
        'Cloud-native realtime telemetry dashboard built with React 19, TypeScript, Docker, and Playwright tests.',
      isPrivate: false,
      isFork: false,
      stargazersCount: 18,
      defaultBranch: 'main',
      pushedAt: '2026-10-22T14:30:00Z',
      languages: { TypeScript: 68400, HTML: 4200, CSS: 6100, Dockerfile: 980 },
      treePaths: [
        'package.json',
        'tsconfig.json',
        'Dockerfile',
        '.github/workflows/ci.yml',
        'src/App.tsx',
        'src/components/TelemetryGrid.tsx',
        'src/utils/metrics.test.ts',
        'vitest.config.ts',
        'README.md',
      ],
      packageJsonDependencies: {
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        typescript: '^5.8.0',
        vitest: '^3.0.0',
        '@playwright/test': '^1.50.0',
      },
      readmeText:
        '# Realtime Telemetry Cloud UI\nMulti-tenant observability dashboard built with React 19 and TypeScript.\n\n## Architecture\n- Streaming WebSocket consumer with backpressure buffering\n- Containerized via multi-stage Dockerfile\n- Automated CI/CD pipeline in `.github/workflows/ci.yml` running Vitest unit tests.',
      commitCount: isOwnerMatch || !cleanUser ? 24 : 0,
      commitSpanDays: 19,
    },
    'arjun-mehta/ts-rpc-schema': {
      description: 'Zero-dependency TypeScript RPC & schema validator library with 100% strict test coverage.',
      isPrivate: false,
      isFork: false,
      stargazersCount: 31,
      defaultBranch: 'main',
      pushedAt: '2026-10-19T09:15:00Z',
      languages: { TypeScript: 52000, JavaScript: 3200 },
      treePaths: [
        'package.json',
        'tsconfig.json',
        '.github/workflows/test.yml',
        'src/schema.ts',
        'src/rpc.ts',
        'tests/schema.test.ts',
        'jest.config.js',
        'README.md',
      ],
      packageJsonDependencies: {
        typescript: '^5.8.0',
        jest: '^29.7.0',
      },
      readmeText:
        '# ts-rpc-schema\nType-safe RPC contract and runtime validator written in strict TypeScript with full Jest unit tests.',
      commitCount: isOwnerMatch || !cleanUser ? 16 : 0,
      commitSpanDays: 12,
    },
    'arjun-mehta/event-ingestor-node': {
      description: 'High-throughput Node.js + PostgreSQL event ingestion service with Docker and REST APIs.',
      isPrivate: false,
      isFork: false,
      stargazersCount: 14,
      defaultBranch: 'main',
      pushedAt: '2026-10-21T18:40:00Z',
      languages: { TypeScript: 48000, SQL: 9400, Dockerfile: 1200 },
      treePaths: [
        'package.json',
        'tsconfig.json',
        'Dockerfile',
        'docker-compose.yml',
        '.github/workflows/deploy.yml',
        'src/server.ts',
        'src/db/schema.sql',
        'src/routes/ingest.test.ts',
        'README.md',
      ],
      packageJsonDependencies: {
        express: '^4.21.0',
        pg: '^8.13.0',
        typescript: '^5.8.0',
        vitest: '^3.0.0',
      },
      readmeText:
        '# Event Ingestor Service (Node.js + PostgreSQL)\nHandles 15,000+ events/sec with idempotent keys, SQL indexing, and Docker Compose local setup.',
      commitCount: isOwnerMatch || !cleanUser ? 19 : 0,
      commitSpanDays: 15,
    },
  };

  return demoOwnerRepos[key] || null;
}

app.post('/api/github/inspect', async (req: Request, res: Response): Promise<void> => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const { repoUrl, username = '', githubToken = '' } = req.body || {};

  const parsed = parseGitHubRepoUrl(String(repoUrl || ''));
  if (!parsed) {
    res.status(400).json({
      error: 'Please enter a valid GitHub repository URL (e.g. https://github.com/owner/repo).',
    });
    return;
  }

  const cleanUsername = String(username || '')
    .trim()
    .replace(/^@/, '');
  if (!cleanUsername) {
    res.status(400).json({
      error: 'Please enter your GitHub username so we can verify your commits in this repository.',
    });
    return;
  }

  // Save github_username to profile if provided
  try {
    db.prepare('UPDATE profile SET github_username=? WHERE user_id=?').run(cleanUsername, userId);
  } catch {
    // Non-fatal
  }

  const { owner, repo } = parsed;

  // Check if this matches a built-in demo/test fixture first
  const demoFixture = getDemoGitHubFixture(owner, repo, cleanUsername);
  if (demoFixture) {
    const commitDates: string[] = [];
    const now = Date.now();
    for (let i = 0; i < demoFixture.commitCount; i++) {
      const dayOffset =
        demoFixture.commitSpanDays > 1
          ? Math.floor((i / Math.max(1, demoFixture.commitCount - 1)) * demoFixture.commitSpanDays)
          : 0;
      commitDates.push(new Date(now - dayOffset * 86400000).toISOString());
    }

    const validation = validateGitHubRepoProof({
      owner,
      repo,
      username: cleanUsername,
      notFound: false,
      isPrivate: demoFixture.isPrivate,
      isFork: demoFixture.isFork,
      userCommitDates: commitDates,
    });

    const detectedSkills = detectSkillsFromGitHubRepo({
      owner,
      repo,
      username: cleanUsername,
      languages: demoFixture.languages,
      treePaths: demoFixture.treePaths,
      packageJsonDeps: demoFixture.packageJsonDependencies,
      readmeText: demoFixture.readmeText,
      description: demoFixture.description,
      userCommitDates: commitDates,
    });

    res.json({
      owner,
      repo,
      url: `https://github.com/${owner}/${repo}`,
      description: demoFixture.description,
      isFork: demoFixture.isFork,
      isPrivate: demoFixture.isPrivate,
      stargazersCount: demoFixture.stargazersCount,
      defaultBranch: demoFixture.defaultBranch,
      pushedAt: demoFixture.pushedAt,
      languages: demoFixture.languages,
      userCommitCount: validation.userCommitCount,
      singleDayCommitWarning: Boolean(validation.weakEvidenceWarning),
      weakWarningReason: validation.weakEvidenceWarning,
      validationStatus: validation.status,
      validationReason: validation.reason,
      detectedSkills,
      treePaths: demoFixture.treePaths,
      readmeExcerpt: demoFixture.readmeText.slice(0, 1200),
    });
    return;
  }

  // Live GitHub REST API fetch
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ApplyWise-Evidence-Verifier',
  };
  const cleanToken = String(githubToken || process.env.GITHUB_TOKEN || '').trim();
  if (cleanToken) {
    headers.Authorization = `Bearer ${cleanToken}`;
  }

  try {
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (repoRes.status === 403 || repoRes.status === 429) {
      const remaining = repoRes.headers.get('x-ratelimit-remaining');
      if (remaining === '0' || repoRes.status === 429) {
        res.status(429).json({
          error:
            'GitHub API rate limit reached (60 requests/hour unauthenticated). Add a GitHub Personal Access Token in Settings -> Advanced, or try again later.',
          rateLimited: true,
        });
        return;
      }
    }

    if (repoRes.status === 404) {
      const validation = validateGitHubRepoProof({
        owner,
        repo,
        username: cleanUsername,
        notFound: true,
        isPrivate: false,
        isFork: false,
        userCommitDates: [],
      });
      res.json({
        owner,
        repo,
        url: `https://github.com/${owner}/${repo}`,
        description: '',
        isFork: false,
        isPrivate: true,
        stargazersCount: 0,
        defaultBranch: 'main',
        pushedAt: '',
        languages: {},
        userCommitCount: 0,
        singleDayCommitWarning: false,
        validationStatus: validation.status,
        validationReason: validation.reason,
        detectedSkills: [],
        treePaths: [],
        readmeExcerpt: '',
      });
      return;
    }

    if (!repoRes.ok) {
      res.status(502).json({
        error: `GitHub API returned status ${repoRes.status}. Please check the repository URL.`,
      });
      return;
    }

    const repoData = (await repoRes.json()) as {
      description?: string;
      private?: boolean;
      fork?: boolean;
      stargazers_count?: number;
      default_branch?: string;
      pushed_at?: string;
      owner?: { login?: string };
    };

    const defaultBranch = repoData.default_branch || 'main';

    // Fetch languages, readme, commits by user, and file tree in parallel
    const [langRes, readmeRes, commitsRes, treeRes] = await Promise.allSettled([
      fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, {
        headers,
        signal: AbortSignal.timeout(6000),
      }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
        headers,
        signal: AbortSignal.timeout(6000),
      }),
      fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits?author=${encodeURIComponent(
          cleanUsername
        )}&per_page=30`,
        {
          headers,
          signal: AbortSignal.timeout(6000),
        }
      ),
      fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(
          defaultBranch
        )}?recursive=1`,
        {
          headers,
          signal: AbortSignal.timeout(6000),
        }
      ),
    ]);

    let languages: Record<string, number> = {};
    if (langRes.status === 'fulfilled' && langRes.value.ok) {
      languages = (await langRes.value.json()) as Record<string, number>;
    }

    let readmeText = '';
    if (readmeRes.status === 'fulfilled' && readmeRes.value.ok) {
      const readmeJson = (await readmeRes.value.json()) as { content?: string; encoding?: string };
      if (readmeJson.content && readmeJson.encoding === 'base64') {
        readmeText = Buffer.from(readmeJson.content, 'base64').toString('utf8');
      }
    }

    const userCommitDates: string[] = [];
    if (commitsRes.status === 'fulfilled' && commitsRes.value.ok) {
      const commitsJson = (await commitsRes.value.json()) as Array<{
        commit?: { author?: { date?: string }; committer?: { date?: string } };
      }>;
      if (Array.isArray(commitsJson)) {
        for (const c of commitsJson) {
          const dt = c.commit?.author?.date || c.commit?.committer?.date;
          if (dt) userCommitDates.push(dt);
        }
      }
    }

    const treePaths: string[] = [];
    if (treeRes.status === 'fulfilled' && treeRes.value.ok) {
      const treeJson = (await treeRes.value.json()) as {
        tree?: Array<{ path?: string; type?: string }>;
      };
      if (Array.isArray(treeJson.tree)) {
        for (const node of treeJson.tree.slice(0, 350)) {
          if (node.path) treePaths.push(node.path);
        }
      }
    }

    // Optional: fetch package.json if present in root to inspect dependencies
    let packageJsonDependencies: Record<string, string> = {};
    if (treePaths.includes('package.json')) {
      try {
        const pkgRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/package.json`,
          {
            headers,
            signal: AbortSignal.timeout(4000),
          }
        );
        if (pkgRes.ok) {
          const pkgData = (await pkgRes.json()) as { content?: string; encoding?: string };
          if (pkgData.content && pkgData.encoding === 'base64') {
            const parsedPkg = JSON.parse(
              Buffer.from(pkgData.content, 'base64').toString('utf8')
            ) as {
              dependencies?: Record<string, string>;
              devDependencies?: Record<string, string>;
            };
            packageJsonDependencies = {
              ...(parsedPkg.dependencies || {}),
              ...(parsedPkg.devDependencies || {}),
            };
          }
        }
      } catch {
        // Ignore package.json fetch error
      }
    }

    const validation = validateGitHubRepoProof({
      owner: repoData.owner?.login || owner,
      repo,
      username: cleanUsername,
      notFound: false,
      isPrivate: Boolean(repoData.private),
      isFork: Boolean(repoData.fork),
      userCommitDates,
    });

    const detectedSkills = detectSkillsFromGitHubRepo({
      owner,
      repo,
      username: cleanUsername,
      languages,
      treePaths,
      packageJsonDeps: packageJsonDependencies,
      readmeText,
      description: repoData.description || '',
      userCommitDates,
    });

    res.json({
      owner,
      repo,
      url: `https://github.com/${owner}/${repo}`,
      description: repoData.description || '',
      isFork: Boolean(repoData.fork),
      isPrivate: Boolean(repoData.private),
      stargazersCount: Number(repoData.stargazers_count || 0),
      defaultBranch,
      pushedAt: repoData.pushed_at || '',
      languages,
      userCommitCount: validation.userCommitCount,
      singleDayCommitWarning: Boolean(validation.weakEvidenceWarning),
      weakWarningReason: validation.weakEvidenceWarning,
      validationStatus: validation.status,
      validationReason: validation.reason,
      detectedSkills,
      treePaths: treePaths.slice(0, 120),
      readmeExcerpt: readmeText.slice(0, 1500),
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unable to reach GitHub API. Please try again.';
    res.status(502).json({ error: message });
  }
});

app.post('/api/github/review', async (req: Request, res: Response): Promise<void> => {
  const {
    owner = '',
    repo = '',
    description = '',
    readmeText = '',
    treePaths = [],
    languages = {},
    detectedSkills = [],
    modelId,
  } = req.body || {};

  if (!owner || !repo) {
    res.status(400).json({ error: 'Repository owner and name are required for review.' });
    return;
  }

  try {
    const review = await reviewGitHubRepoWithAI({
      owner: String(owner),
      repo: String(repo),
      description: String(description || ''),
      readmeText: String(readmeText || ''),
      treePaths: Array.isArray(treePaths) ? treePaths.map(String) : [],
      languages: languages && typeof languages === 'object' ? languages : {},
      detectedSkills: Array.isArray(detectedSkills) ? detectedSkills.map(String) : [],
      requestedModelId: typeof modelId === 'string' ? modelId : undefined,
    });
    res.json(review);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not review repository.';
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// PART 3: JD-TO-PROFILE GAP ANALYSIS ROUTES
// ============================================================================

app.post('/api/jd-fetch-url', async (req: Request, res: Response): Promise<void> => {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
    res.status(400).json({
      error: 'Please enter a valid http/https job URL, or paste the job description text directly.',
    });
    return;
  }

  const tryTavilyFallback = async (originalReason: string) => {
    if (isTavilyConfigured()) {
      try {
        const extracted = await tavilyExtract([url.trim()]);
        const first = extracted?.[0];
        if (first && first.raw_content && first.raw_content.trim().length >= 100) {
          const cleaned = cleanHtmlText(first.raw_content);
          if (cleaned.length >= 100) {
            res.json({
              ok: true,
              text: cleaned.slice(0, 12000),
              via: 'tavily-extract',
            });
            return true;
          }
        }
      } catch (tavilyErr) {
        console.warn(
          '[POST /api/jd-fetch-url] Tavily extract fallback failed:',
          tavilyErr instanceof Error ? tavilyErr.message : tavilyErr
        );
      }
    }
    res.status(422).json({
      blocked: true,
      error: originalReason,
    });
    return false;
  };

  try {
    const resp = await fetch(url.trim(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; ApplyWiseBot/1.0; +https://applywise.local)',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!resp.ok) {
      await tryTavilyFallback(
        `This job board blocked automated fetching (HTTP ${resp.status}). Please copy and paste the job description text below.`
      );
      return;
    }

    const html = await resp.text();
    const cleaned = cleanHtmlText(html);
    if (cleaned.length < 150) {
      await tryTavilyFallback(
        'This page requires JavaScript or login to view the full job description. Please paste the job description text directly.'
      );
      return;
    }

    res.json({ ok: true, text: cleaned.slice(0, 12000) });
  } catch {
    await tryTavilyFallback(
      'Could not fetch that URL directly (blocked by site CORS/firewall). Please paste the job description text below.'
    );
  }
});

app.post('/api/jd-analyze', async (req: Request, res: Response): Promise<void> => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const {
    jdText = '',
    jobDescription = '',
    roleTitle = '',
    company = '',
    manualSkills,
    simulateParseFailure = false,
    saveToHistory = true,
    modelId,
  } = req.body || {};

  const cleanJd = String(jdText || jobDescription || '').trim();
  if (cleanJd.length < 150) {
    res.status(400).json({
      error: `Job description is too short (${cleanJd.length} characters). Please paste at least 150 characters so we can extract accurate skill requirements.`,
    });
    return;
  }

  try {
    const userProf = db.prepare('SELECT * FROM profile WHERE user_id=?').get(userId) as
      | ProfileRow
      | undefined;
    const userEvidenceRows = db
      .prepare('SELECT * FROM evidence WHERE user_id=? ORDER BY id DESC')
      .all(userId) as Array<Record<string, unknown>>;
    const userEvidence = userEvidenceRows.map(formatEvidenceRow);
    const userAttachments = db
      .prepare('SELECT * FROM attachments WHERE user_id=? ORDER BY id DESC')
      .all(userId) as Array<{
      id: number;
      user_id: number;
      filename: string;
      mime_type: string;
      file_size: number;
      category: string;
      extracted_text: string;
      created_at: string;
    }>;

    // If user submitted manual skills fallback after an AI parse failure, use them directly
    if (simulateParseFailure && !Array.isArray(manualSkills)) {
      res.status(422).json({
        aiParseFailed: true,
        requiresManualEntry: true,
        error:
          'AI JSON extraction failed after 1 retry. You can enter or confirm the required skills manually below.',
      });
      return;
    }

    let extractionResult = await extractJdRequirementsWithAI({
      jdText: cleanJd,
      roleHint: String(roleTitle || '').trim() || undefined,
      companyHint: String(company || '').trim() || undefined,
      requestedModelId: typeof modelId === 'string' ? modelId : undefined,
    });

    if (Array.isArray(manualSkills) && manualSkills.length > 0) {
      extractionResult = {
        ...extractionResult,
        aiParseFailed: false,
        extraction: {
          ...extractionResult.extraction,
          mustHave: manualSkills.map(
            (item: { skill: string; importance?: string; quote?: string }) => ({
              skill: normalizeSkillName(String(item.skill || '')).canonical,
              importance: item.importance === 'core' ? 'core' : 'important',
              quote: String(
                item.quote || `Manually specified requirement for ${item.skill}.`
              ),
            })
          ),
        },
      };
    }

    const baseGap = computeJdGapAnalysis({
      extraction: extractionResult.extraction,
      roleOverride: String(roleTitle || '').trim() || undefined,
      companyOverride: String(company || '').trim() || undefined,
      context: {
        evidence: userEvidence,
        profile: (userProf as any) || null,
        attachments: userAttachments,
      },
    });

    // Second AI call: plain-language explanation, effort estimates for top 3 skills, and strategy
    const explanation = await explainJdGapWithAI({
      gapAnalysis: baseGap,
      requestedModelId: typeof modelId === 'string' ? modelId : undefined,
    });

    const enrichedWhatToDoFirst = baseGap.whatToDoFirst.map((item) => ({
      ...item,
      estimatedEffort:
        explanation.effortBySkill?.[item.skill] || item.estimatedEffort,
    }));

    const finalGap: typeof baseGap = {
      ...baseGap,
      whatToDoFirst: enrichedWhatToDoFirst,
      aiSummary: explanation.summary || baseGap.aiSummary,
      applicationStrategy: explanation.strategy || baseGap.applicationStrategy,
      strategyLabel: explanation.strategyLabel || baseGap.strategyLabel,
    };

    let savedAnalysisRecord: Record<string, unknown> | undefined;
    if (saveToHistory) {
      const compatAnalysis = buildDeterministicAnalysis(
        userProf?.resume_text || userProf?.skills_text || 'Software Engineer',
        cleanJd,
        userEvidence.filter((e) => e.status === 'valid'),
        userProf?.name || authUser?.name || 'Candidate',
        finalGap.roleTitle
      );
      compatAnalysis.readinessScore = finalGap.score;
      compatAnalysis.summary = finalGap.aiSummary || 'Job match gap analysis completed.';

      const payloadToStore = {
        ...compatAnalysis,
        gapAnalysis: finalGap,
        jdGapAnalysis: finalGap,
      };

      const insertRes = db
        .prepare(
          'INSERT INTO analyses (user_id, job_title, company, job_description, data) VALUES (?, ?, ?, ?, ?)'
        )
        .run(
          userId,
          finalGap.roleTitle,
          finalGap.company,
          cleanJd,
          JSON.stringify(payloadToStore)
        );
      const savedAnalysisId = Number(insertRes.lastInsertRowid);
      savedAnalysisRecord = {
        ...payloadToStore,
        id: savedAnalysisId,
        jobTitle: finalGap.roleTitle,
        company: finalGap.company,
        job_description: cleanJd,
        created_at: new Date().toISOString(),
      };
    }

    res.json({
      ok: true,
      ...finalGap,
      gapAnalysis: finalGap,
      savedAnalysis: savedAnalysisRecord,
      aiParseFailed: extractionResult.aiParseFailed,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'JD gap analysis failed.';
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// JOBS & SECTOR MAPPING
// ============================================================================

app.get('/api/jobs', async (req: Request, res: Response): Promise<void> => {
  const query = String(req.query.query || '').trim().slice(0, 100);
  const location = String(req.query.location || '').trim().slice(0, 100);
  const companyFilter = String(req.query.company || '').trim().toLowerCase();

  const matchingFeatured = FEATURED_COMPANY_JOBS.filter((j) => {
    if (companyFilter && companyFilter !== 'all' && companyFilter !== 'remote') {
      if (companyFilter === 'government' || companyFilter === 'gov') {
        if (j.sector !== 'Government & PSU') return false;
      } else if (companyFilter === 'enterprise' || companyFilter === 'private') {
        if (j.sector === 'Government & PSU') return false;
      } else if (
        j.company.toLowerCase() !== companyFilter &&
        !j.company.toLowerCase().includes(companyFilter)
      ) {
        return false;
      }
    }
    if (location && !j.location.toLowerCase().includes(location.toLowerCase())) {
      return false;
    }
    if (!query || query.toLowerCase() === 'software developer' || query.toLowerCase() === 'all') {
      return true;
    }
    const q = query.toLowerCase();
    return (
      j.title.toLowerCase().includes(q) ||
      j.company.toLowerCase().includes(q) ||
      (j.examCode && j.examCode.toLowerCase().includes(q)) ||
      j.skills.some((s) => s.toLowerCase().includes(q)) ||
      j.description.toLowerCase().includes(q)
    );
  });

  const featuredToInclude = matchingFeatured.length > 0 ? matchingFeatured : FEATURED_COMPANY_JOBS;

  let liveTavilyJobs: JobItem[] = [];
  if (isTavilyConfigured()) {
    try {
      const qParts = [
        query || 'software developer',
        'jobs',
        location || '',
        companyFilter && companyFilter !== 'all' && companyFilter !== 'remote' ? companyFilter : '',
        'hiring 2026',
      ].filter(Boolean);
      const tavilyQuery = qParts.join(' ');
      const tavilyRes = await tavilySearch({
        query: tavilyQuery,
        maxResults: 8,
        topic: 'general',
        includeDomains: [
          'linkedin.com/jobs',
          'naukri.com',
          'indeed.com',
          'internshala.com',
          'wellfound.com',
        ],
      });

      if (tavilyRes && tavilyRes.results && tavilyRes.results.length > 0) {
        liveTavilyJobs = tavilyRes.results.map((r, idx) => {
          const cleanTitle = cleanHtmlText(r.title || 'Software Role');
          const snippet = cleanHtmlText(r.content || '');
          let comp = 'Tech Employer';
          try {
            const parsedUrl = new URL(r.url);
            comp = parsedUrl.hostname.replace('www.', '').split('.')[0];
            comp = comp.charAt(0).toUpperCase() + comp.slice(1);
          } catch {
            // fallback
          }
          if (cleanTitle.includes(' at ')) {
            const parts = cleanTitle.split(' at ');
            if (parts[1]) comp = parts[1].split(/[-–|]/)[0].trim();
          } else if (cleanTitle.includes(' - ')) {
            const parts = cleanTitle.split(' - ');
            if (parts[1]) comp = parts[1].split(/[-–|]/)[0].trim();
          }

          const combinedText = `${cleanTitle} ${snippet}`;
          return {
            id: `tavily-${idx}-${Buffer.from(r.url).toString('base64url').slice(0, 10)}`,
            title: cleanTitle,
            company: comp || 'Company',
            location: location || 'Flexible / Remote',
            created: 'Active hiring',
            url: r.url,
            description: snippet,
            skills: identifySkills(combinedText),
            featured: true,
            source: 'Live · Tavily',
            badge: 'Live · Tavily',
            sector: 'Enterprise & Private' as const,
          };
        });
      }
    } catch (tavilyErr) {
      console.warn(
        '[GET /api/jobs] Tavily search fallback:',
        tavilyErr instanceof Error ? tavilyErr.message : tavilyErr
      );
    }
  }

  let liveRemoteJobs: JobItem[] = [];
  if (!companyFilter || companyFilter === 'all' || companyFilter === 'remote') {
    try {
      const searchQ = query || 'software developer';
      const remotiveUrl = `https://remotive.com/api/remote-jobs?${new URLSearchParams({
        search: searchQ,
        limit: '10',
      })}`;
      const remoteRes = await fetch(remotiveUrl, { signal: AbortSignal.timeout(3500) });
      if (remoteRes.ok) {
        const data = (await remoteRes.json()) as {
          jobs?: Array<{
            id: number | string;
            title: string;
            company_name?: string;
            candidate_required_location?: string;
            publication_date?: string;
            url?: string;
            description?: string;
          }>;
        };
        if (Array.isArray(data.jobs)) {
          liveRemoteJobs = data.jobs.slice(0, 10).map((j) => {
            const desc = cleanHtmlText(j.description || '');
            const combined = `${j.title} ${desc}`;
            return {
              id: String(j.id),
              title: cleanHtmlText(j.title),
              company: cleanHtmlText(j.company_name || 'Tech Company'),
              location: cleanHtmlText(j.candidate_required_location || 'Remote'),
              created: j.publication_date
                ? new Date(j.publication_date).toLocaleDateString()
                : 'Recently posted',
              url: j.url || 'https://remotive.com',
              description: desc,
              skills: identifySkills(combined),
              featured: false,
              sector: 'Enterprise & Private' as const,
            };
          });
        }
      }
    } catch {
      // Offline / timeout fallback
    }
  }

  // Merge live Tavily jobs ABOVE featured jobs, and dedupe by normalized URL
  const rawList: JobItem[] =
    companyFilter && companyFilter !== 'all' && companyFilter !== 'remote'
      ? [...liveTavilyJobs, ...matchingFeatured]
      : companyFilter === 'remote'
      ? liveTavilyJobs.length > 0 || liveRemoteJobs.length > 0
        ? [...liveTavilyJobs, ...liveRemoteJobs]
        : additionalCuratedJobs
      : [...liveTavilyJobs, ...featuredToInclude, ...liveRemoteJobs];

  const seenUrls = new Set<string>();
  const deduplicatedJobs: JobItem[] = [];
  for (const j of rawList) {
    const normUrl = (j.url || '').trim().toLowerCase();
    if (normUrl && seenUrls.has(normUrl)) continue;
    if (normUrl) seenUrls.add(normUrl);
    deduplicatedJobs.push(j);
  }

  const finalJobs = deduplicatedJobs.length > 0 ? deduplicatedJobs : FEATURED_COMPANY_JOBS;
  const trends = calculateSkillTrends(finalJobs);

  res.json({
    source: 'live',
    provider:
      liveTavilyJobs.length > 0
        ? 'Live Web Search via Tavily + Enterprise & Government Network'
        : liveRemoteJobs.length > 0
        ? 'Enterprise + Govt Sector (UPSC/SSC/ISRO) + Remotive Live API'
        : 'Enterprise + Government Sector Direct Network',
    attributionUrl: liveTavilyJobs.length > 0 ? 'https://tavily.com/' : 'https://remotive.com/',
    updatedAt: new Date().toISOString(),
    jobs: finalJobs,
    trends,
  });
});

// ============================================================================
// DOCUMENT UPLOAD & AI ANALYSIS
// ============================================================================

async function processAndSaveUploadedFile(params: {
  req: Request;
  buffer: Buffer;
  originalName: string;
  mime: string;
  fileSize: number;
  category: string;
  saveToProfile: boolean;
}) {
  const { req, buffer, originalName, mime, fileSize, category, saveToProfile } = params;
  const authUser = getAuthUser(req);
  const demoUser = db
    .prepare('SELECT * FROM users WHERE email=?')
    .get('demo@applywise.local') as AuthUserRow | undefined;
  const effectiveUser: AuthUserRow = authUser ||
    demoUser || {
      id: 1,
      name: 'Candidate',
      email: 'demo@applywise.local',
      account_role: 'Student',
    };
  const userId = effectiveUser.id;

  const userProf = getOrCreateUserProfile(effectiveUser);
  const candidateHint = userProf
    ? `${userProf.name || ''} - ${userProf.title || ''} (${userProf.skills_text || ''})`
    : '';

  const { text, source } = await extractDocumentTextFromBuffer(
    buffer,
    mime,
    originalName,
    candidateHint
  );
  const detectedSkills = identifySkills(text);

  const insertAtt = db
    .prepare(
      `INSERT INTO attachments (user_id, filename, mime_type, category, extracted_text, file_size)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(userId, originalName, mime, category, text, fileSize);

  let updatedReadinessScore: number | undefined = undefined;

  const isResumeLike =
    category === 'resume' ||
    saveToProfile ||
    /resume|cv|curriculum/i.test(originalName) ||
    !userProf?.resume_text;

  if (isResumeLike) {
    const existingSkills = String(userProf?.skills_text || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const mergedSkills = Array.from(new Set([...existingSkills, ...detectedSkills])).join(', ');

    db.prepare('UPDATE profile SET resume_text=?, skills_text=? WHERE user_id=?').run(
      text,
      mergedSkills || userProf?.skills_text || '',
      userId
    );

    try {
      const userEvidence = db
        .prepare('SELECT * FROM evidence WHERE user_id=?')
        .all(userId) as Array<{ skill: string; type: string; title: string; url?: string }>;
      const latestAnalysisRow = db
        .prepare('SELECT * FROM analyses WHERE user_id=? ORDER BY id DESC LIMIT 1')
        .get(userId) as { job_title?: string; company?: string; job_description?: string } | undefined;

      const targetRoleTitle =
        userProf?.title || latestAnalysisRow?.job_title || 'Junior Frontend Developer';
      const targetCompany = latestAnalysisRow?.company || 'Target Company';
      const targetJobDesc =
        latestAnalysisRow?.job_description ||
        `${targetRoleTitle} at ${targetCompany}\nRequired Skills: ${
          mergedSkills || 'React, TypeScript, JavaScript, HTML/CSS, Git, REST APIs, SQL'
        }`;

      const refreshedAnalysis = buildDeterministicAnalysis(
        text,
        targetJobDesc,
        userEvidence,
        userProf?.name || effectiveUser.name || 'Candidate',
        targetRoleTitle
      );
      updatedReadinessScore = refreshedAnalysis.readinessScore;

      db.prepare(
        'INSERT INTO analyses (user_id, job_title, company, job_description, data) VALUES (?, ?, ?, ?, ?)'
      ).run(
        userId,
        targetRoleTitle,
        targetCompany,
        targetJobDesc,
        JSON.stringify(refreshedAnalysis)
      );
    } catch {
      // Non-fatal
    }
  }

  return {
    id: Number(insertAtt.lastInsertRowid),
    filename: originalName,
    mimeType: mime,
    category,
    text,
    source,
    detectedSkills,
    readinessScore: updatedReadinessScore,
  };
}

app.post('/api/upload', (req: Request, res: Response): void => {
  const uploader = upload.any();
  uploader(req, res, async (uploadErr: unknown) => {
    if (uploadErr) {
      const errMsg = uploadErr instanceof Error ? uploadErr.message : 'File exceeds 4 MB limit.';
      res.status(400).json({
        error: `Upload error: ${errMsg}`,
      });
      return;
    }

    const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
    const uploadedFile = files[0];
    if (!uploadedFile) {
      res.status(400).json({
        error: 'Please select a file (PDF, DOCX, JPG, PNG, or TXT) to upload.',
      });
      return;
    }

    const filePath = uploadedFile.path;
    const mime = uploadedFile.mimetype || 'application/octet-stream';
    const originalName = fixMojibake(uploadedFile.originalname || 'resume.pdf');
    const fileSize = uploadedFile.size || 0;
    const category = String(req.body?.category || 'resume');
    const saveToProfile = req.body?.saveToProfile !== 'false';

    try {
      const buffer = fs.readFileSync(filePath);
      const result = await processAndSaveUploadedFile({
        req,
        buffer,
        originalName,
        mime,
        fileSize,
        category,
        saveToProfile,
      });
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({
        error: 'Failed to process file: ' + msg,
      });
    } finally {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // Ignore cleanup error
      }
    }
  });
});

app.post('/api/upload-base64', async (req: Request, res: Response): Promise<void> => {
  const {
    filename = 'resume.pdf',
    mimeType = 'application/pdf',
    fileSize = 0,
    base64Data = '',
    category = 'resume',
    saveToProfile = true,
  } = req.body || {};

  if (!base64Data || typeof base64Data !== 'string') {
    res.status(400).json({ error: 'No file content received for upload.' });
    return;
  }

  try {
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 4 * 1024 * 1024) {
      res.status(400).json({ error: 'File size must be under 4 MB.' });
      return;
    }
    const result = await processAndSaveUploadedFile({
      req,
      buffer,
      originalName: String(filename),
      mime: String(mimeType),
      fileSize: Number(fileSize) || buffer.length,
      category: String(category || 'resume'),
      saveToProfile: saveToProfile !== false && saveToProfile !== 'false',
    });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to process uploaded file: ' + msg,
    });
  }
});

// ============================================================================
// PART 4: CONTENT-FIRST UPLOAD CHECK PIPELINE (/api/upload-check & /api/upload-confirm)
// ============================================================================

async function runUploadCheckForUser(params: {
  req: Request;
  buffer?: Buffer;
  preprocessedBuffer?: Buffer;
  imageMeta?: {
    originalWidth?: number;
    originalHeight?: number;
    exifOrientation?: number;
    wasRotated?: boolean;
    wasUpscaled?: boolean;
    isLikelyPhoto?: boolean;
    suspectedFailureReason?: 'blurry' | 'rotated' | 'too_small' | 'not_a_document';
  };
  rawTextOverride?: string;
  ocrConfidenceOverride?: number;
  originalName: string;
  mime: string;
  fileSize: number;
  selectedCategory: SelectedUploadCategory;
  userTitle?: string;
  targetSkill?: string;
  simulateDuplicateOfExisting?: boolean;
}) {
  const {
    req,
    buffer,
    preprocessedBuffer,
    imageMeta,
    rawTextOverride,
    ocrConfidenceOverride,
    originalName,
    mime,
    fileSize,
    selectedCategory,
    userTitle = '',
    targetSkill,
    simulateDuplicateOfExisting = false,
  } = params;

  const authUser = getAuthUser(req);
  const demoUser = db
    .prepare('SELECT * FROM users WHERE email=?')
    .get('demo@applywise.local') as AuthUserRow | undefined;
  const effectiveUser: AuthUserRow = authUser ||
    demoUser || {
      id: 1,
      name: '',
      email: 'demo@applywise.local',
      account_role: 'Student',
    };
  const userId = effectiveUser.id;
  const userProf = getOrCreateUserProfile(effectiveUser);

  let extractedText = '';
  let extractionSource = 'Document Text Layer';
  let ocrConfidence = ocrConfidenceOverride ?? 95;
  let retriedWithPreprocessed = false;
  let usedVisionFallback = false;
  let ocrFailureReason: 'blurry' | 'rotated' | 'too_small' | 'not_a_document' | undefined =
    imageMeta?.suspectedFailureReason;
  let isNonDocumentPhoto = Boolean(imageMeta?.isLikelyPhoto);

  const isImageFile =
    mime.startsWith('image/') ||
    /\.(jfif|jpe?g|webp|png|bmp|gif)$/i.test(originalName);

  const serverImgMeta = buffer && isImageFile ? inspectImageBufferMetadata(buffer) : {};
  const imageWidth = imageMeta?.originalWidth || serverImgMeta.width;
  const imageHeight = imageMeta?.originalHeight || serverImgMeta.height;
  if (!ocrFailureReason) {
    if (imageMeta?.wasRotated || serverImgMeta.wasRotated) {
      ocrFailureReason = 'rotated';
    } else if (
      (imageWidth && imageWidth < 600) ||
      (imageHeight && imageHeight < 400)
    ) {
      ocrFailureReason = 'too_small';
    }
  }

  let visionOverride:
    | {
        type: UploadCheckResult['detectedType'];
        confidence: number;
        reasons: string[];
        extractedPersonName?: string;
      }
    | undefined;

  if (typeof rawTextOverride === 'string') {
    extractedText = rawTextOverride;
    extractionSource = ocrConfidence < 60 ? 'Scanned Image OCR' : 'Document Text Layer';
  } else if (buffer) {
    const extracted = await extractDocumentTextFromBuffer(
      buffer,
      mime,
      originalName,
      userProf ? `${userProf.name || ''} - ${userProf.title || ''}` : ''
    );
    extractedText = extracted.text;
    extractionSource = extracted.source;
    ocrConfidence = ocrConfidenceOverride ?? extracted.ocrConfidence;

    // Requirement 3: If OCR confidence is below 60%, retry once with the preprocessed image
    if (isImageFile && (ocrConfidence < 60 || extractedText.trim().length < 100) && preprocessedBuffer) {
      retriedWithPreprocessed = true;
      const retryExtracted = await extractDocumentTextFromBuffer(
        preprocessedBuffer,
        'image/png',
        originalName.replace(/\.[^.]+$/, '.png'),
        userProf ? `${userProf.name || ''} - ${userProf.title || ''}` : ''
      );
      if (
        retryExtracted.ocrConfidence > ocrConfidence ||
        retryExtracted.text.trim().length > extractedText.trim().length
      ) {
        extractedText = retryExtracted.text;
        extractionSource = `${retryExtracted.source} (Preprocessed 1600px PNG)`;
        ocrConfidence = retryExtracted.ocrConfidence;
      }
    }

    // Requirement 3: If OCR confidence is still low (< 60%), use the vision model (Nemotron/Gemini)
    // to read the document text and return JSON {documentType, personName, text}
    if (isImageFile && (ocrConfidence < 60 || extractedText.trim().length < 100)) {
      const visionRes = await runVisionModelDocumentFallback({
        buffer: preprocessedBuffer || buffer,
        mimeType: preprocessedBuffer ? 'image/png' : mime,
        filename: originalName,
      });
      if (visionRes) {
        usedVisionFallback = true;
        extractionSource = visionRes.source;
        if (visionRes.failureReason) {
          ocrFailureReason = visionRes.failureReason;
        }
        if (visionRes.documentType === 'non_document_photo') {
          isNonDocumentPhoto = true;
          ocrFailureReason = 'not_a_document';
          ocrConfidence = 0;
        } else if (visionRes.text.trim().length >= 100) {
          extractedText = visionRes.text.trim();
          ocrConfidence = Math.max(72, Math.round(visionRes.confidence * 100));
          visionOverride = {
            type: visionRes.documentType,
            confidence: visionRes.confidence,
            reasons: [`Vision model (${visionRes.source}) read and classified the document`],
            extractedPersonName: visionRes.personName || undefined,
          };
        }
      }
    }
  }

  // Load existing attachments & evidence for duplicate/reuse & résumé checks
  const attRows = db
    .prepare('SELECT * FROM attachments WHERE user_id=? ORDER BY id DESC')
    .all(userId) as Array<Record<string, unknown>>;
  const existingAttachments = attRows.map(formatAttachmentRow);

  if (simulateDuplicateOfExisting && existingAttachments.length > 0) {
    existingAttachments.unshift({
      ...existingAttachments[0],
      id: existingAttachments[0].id || 1,
      filename: originalName.replace('_copy', ''),
      extracted_text: extractedText,
    });
  }

  const evRows = db
    .prepare('SELECT * FROM evidence WHERE user_id=? ORDER BY id DESC')
    .all(userId) as Array<Record<string, unknown>>;
  const existingEvidence = evRows.map(formatEvidenceRow);

  // Run AI content classifier when readable
  let aiClassificationOverride:
    | {
        type: UploadCheckResult['detectedType'];
        confidence: number;
        reasons: string[];
        extractedPersonName?: string;
        issuer?: string;
        courseTitle?: string;
        issueDate?: string;
        credentialId?: string;
      }
    | undefined = visionOverride;

  if (!aiClassificationOverride && extractedText.trim().length >= 100 && ocrConfidence >= 60) {
    try {
      aiClassificationOverride = await classifyUploadDocumentWithAI({
        extractedText,
      });
    } catch {
      aiClassificationOverride = undefined;
    }
  }

  const checkResult = runUploadCheckPipeline({
    filename: originalName,
    mimeType: mime,
    fileSize,
    fileBytes: buffer ? new Uint8Array(buffer) : extractedText,
    extractedText,
    ocrConfidence,
    extractionSource,
    ocrFailureReason,
    isNonDocumentPhoto,
    retriedWithPreprocessed,
    usedVisionFallback,
    imageWidth,
    imageHeight,
    selectedCategory,
    userTitle,
    targetSkill,
    profile: userProf
      ? {
          name: userProf.name,
          email: effectiveUser.email,
          title: userProf.title,
          role: userProf.role,
          location: userProf.location,
          education: userProf.education,
          skills_text: userProf.skills_text,
          resume_text: userProf.resume_text,
          github_username: userProf.github_username,
        }
      : null,
    existingAttachments,
    existingEvidence,
    aiClassificationOverride,
  });

  return {
    checkResult,
    // Rule B & Section 5 Privacy: Never return or store extracted text for ID documents or marksheets
    extractedText: checkResult.privacyRedacted ? '' : extractedText,
    source: extractionSource,
  };
}

app.post('/api/upload-check', (req: Request, res: Response): void => {
  const contentType = String(req.headers['content-type'] || '');
  if (contentType.includes('multipart/form-data')) {
    const uploader = upload.any();
    uploader(req, res, async (uploadErr: unknown) => {
      if (uploadErr) {
        const errMsg = uploadErr instanceof Error ? uploadErr.message : 'File exceeds 4 MB limit.';
        res.status(400).json({ error: `Upload error: ${errMsg}` });
        return;
      }
      const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
      const uploadedFile = files[0];
      if (!uploadedFile) {
        res.status(400).json({ error: 'Please select a file to check.' });
        return;
      }
      const filePath = uploadedFile.path;
      const mime = uploadedFile.mimetype || 'application/octet-stream';
      const originalName = fixMojibake(uploadedFile.originalname || 'document.pdf');
      const fileSize = uploadedFile.size || 0;
      const selectedCategory = (String(req.body?.category || req.body?.selectedCategory || 'resume') as SelectedUploadCategory) || 'resume';
      const userTitle = String(req.body?.userTitle || '');
      const targetSkill = req.body?.targetSkill ? String(req.body.targetSkill) : undefined;

      try {
        const buffer = fs.readFileSync(filePath);
        const result = await runUploadCheckForUser({
          req,
          buffer,
          originalName,
          mime,
          fileSize,
          selectedCategory,
          userTitle,
          targetSkill,
        });
        res.json(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ error: 'Failed to run Upload Check: ' + msg });
      } finally {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {
          // Ignore cleanup
        }
      }
    });
    return;
  }

  // JSON body (supports base64Data, preprocessedBase64, imageMeta, or extractedText / scenarioId)
  (async () => {
    try {
      const {
        filename = 'document.pdf',
        mimeType = 'application/pdf',
        fileSize = 0,
        base64Data,
        preprocessedBase64,
        imageMeta,
        extractedText,
        ocrConfidence,
        selectedCategory = 'resume',
        category,
        userTitle = '',
        targetSkill,
        scenarioId,
      } = req.body || {};

      if (scenarioId) {
        const authUserForScenario = getAuthUser(req);
        const demoUserForScenario = db
          .prepare('SELECT * FROM users WHERE email=?')
          .get('demo@applywise.local') as AuthUserRow | undefined;
        const effectiveScenarioUser: AuthUserRow = authUserForScenario ||
          demoUserForScenario || {
            id: 1,
            name: '',
            email: 'demo@applywise.local',
            account_role: 'Student',
          };
        const scenarioProf = getOrCreateUserProfile(effectiveScenarioUser);
        const dynamicScenarios = buildUploadCheckTestScenarios({
          name: scenarioProf?.name,
          email: effectiveScenarioUser.email,
          github_username: scenarioProf?.github_username,
        });
        const scenario =
          dynamicScenarios.find((s) => s.id === scenarioId) ||
          UPLOAD_CHECK_TEST_SCENARIOS.find((s) => s.id === scenarioId);
        if (!scenario) {
          res.status(404).json({ error: `Test scenario "${scenarioId}" not found.` });
          return;
        }
        const result = await runUploadCheckForUser({
          req,
          rawTextOverride: scenario.extractedText,
          ocrConfidenceOverride: scenario.ocrConfidence,
          originalName: scenario.filename,
          mime: scenario.filename.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf',
          fileSize: scenario.extractedText.length,
          selectedCategory: scenario.selectedCategory,
          userTitle: '',
          targetSkill: scenario.targetSkill,
          simulateDuplicateOfExisting: scenario.simulateDuplicateOfExisting,
        });
        res.json(result);
        return;
      }

      const resolvedCategory = ((category || selectedCategory || 'resume') as SelectedUploadCategory);
      const buffer =
        typeof base64Data === 'string' && base64Data.length > 0
          ? Buffer.from(base64Data, 'base64')
          : undefined;
      const preprocessedBuffer =
        typeof preprocessedBase64 === 'string' && preprocessedBase64.length > 0
          ? Buffer.from(preprocessedBase64, 'base64')
          : undefined;

      const result = await runUploadCheckForUser({
        req,
        buffer,
        preprocessedBuffer,
        imageMeta: imageMeta && typeof imageMeta === 'object' ? imageMeta : undefined,
        rawTextOverride: typeof extractedText === 'string' ? extractedText : undefined,
        ocrConfidenceOverride: typeof ocrConfidence === 'number' ? ocrConfidence : undefined,
        originalName: String(filename),
        mime: String(mimeType),
        fileSize: Number(fileSize) || (buffer ? buffer.length : String(extractedText || '').length),
        selectedCategory: resolvedCategory,
        userTitle: String(userTitle || ''),
        targetSkill: targetSkill ? String(targetSkill) : undefined,
      });
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'Upload Check failed: ' + msg });
    }
  })();
});

app.post('/api/upload-confirm', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const demoUser = db
    .prepare('SELECT * FROM users WHERE email=?')
    .get('demo@applywise.local') as AuthUserRow | undefined;
  const effectiveUser: AuthUserRow = authUser ||
    demoUser || {
      id: 1,
      name: '',
      email: 'demo@applywise.local',
      account_role: 'Student',
    };
  const userId = effectiveUser.id;
  const userProf = getOrCreateUserProfile(effectiveUser);

  const {
    checkResult,
    selectedCategory,
    userTitle,
    filename,
    extractedText = '',
    selectedSkills = [],
    attachAnyway = false,
    updateProfileName = false,
    overwriteProfileResume = true,
    keepExistingResumeOnConflict = false,
    linkExistingAttachmentId,
    saveToProfile = true,
  } = req.body || {};

  if (!checkResult || typeof checkResult !== 'object') {
    res.status(400).json({ error: 'Upload check result is required before confirming.' });
    return;
  }

  const typedCheck = checkResult as UploadCheckResult;
  const finalCategory = ((selectedCategory || typedCheck.selectedCategory || 'resume') as SelectedUploadCategory);
  const expectedCategoryForType = mapDetectedTypeToCategory(typedCheck.detectedType);

  // Enforce hard blocks in code:
  // 1. Check A: unreadable
  // 2. Check B: non_document_photo, id_document, marksheet, job_description, other, typeConfidence < 0.6, or category mismatch
  // 3. Check C: mismatch (< 0.5), unreadable, or not_found on résumé/certificate
  if (
    typedCheck.readability?.status === 'unreadable' ||
    typedCheck.detectedType === 'non_document_photo' ||
    typedCheck.detectedType === 'id_document' ||
    typedCheck.detectedType === 'marksheet' ||
    typedCheck.detectedType === 'job_description' ||
    typedCheck.detectedType === 'other' ||
    (typeof typedCheck.typeConfidence === 'number' && typedCheck.typeConfidence < 0.6) ||
    expectedCategoryForType !== finalCategory ||
    typedCheck.nameMatch === 'mismatch' ||
    typedCheck.nameMatch === 'unreadable' ||
    (typedCheck.nameMatch === 'not_found' &&
      (finalCategory === 'resume' || finalCategory === 'certificate'))
  ) {
    res.status(400).json({
      error:
        typedCheck.detectedType === 'non_document_photo'
          ? 'This looks like a photo, not a document.'
          : typedCheck.detectedType === 'id_document' || typedCheck.detectedType === 'marksheet'
          ? 'Personal IDs and marksheets cannot be saved as evidence. Extracted text was discarded for your privacy.'
          : typedCheck.readability?.status === 'unreadable'
          ? 'Unreadable files cannot be saved as evidence. Please upload a clearer file.'
          : typedCheck.nameMatch === 'mismatch'
          ? `This document appears to belong to ${typedCheck.extractedPersonName || 'another person'}, not ${userProf?.name || 'your profile'}. Upload your own document.`
          : typedCheck.nameMatch === 'not_found'
          ? 'No candidate or recipient name was found on this document. Cannot verify identity.'
          : expectedCategoryForType !== finalCategory
          ? 'Selected category does not match the detected document type.'
          : 'Document failed Upload Check validation and cannot be saved.',
    });
    return;
  }

  const finalFilename = fixMojibake(
    String(filename || typedCheck.filename || 'document.pdf').trim()
  ).slice(0, 180);
  const finalTitle = fixMojibake(
    String(userTitle || typedCheck.userTitle || finalFilename.replace(/\.[^.]+$/, '')).trim()
  ).slice(0, 180);

  if (!finalTitle) {
    res.status(400).json({ error: 'Please provide a short descriptive title for this file.' });
    return;
  }

  // If user confirmed a PARTIAL match (0.5 - 0.8)
  let finalNameMatch = typedCheck.nameMatch;
  let finalIdentityUnconfirmed = Boolean(typedCheck.identityUnconfirmed);
  if (updateProfileName && typedCheck.extractedPersonName && typedCheck.nameMatch === 'partial') {
    const newProfileName = String(typedCheck.extractedPersonName).trim().slice(0, 120);
    db.prepare('UPDATE profile SET name=? WHERE user_id=?').run(newProfileName, userId);
    db.prepare('UPDATE users SET name=? WHERE id=?').run(newProfileName, userId);
    finalNameMatch = 'match';
    finalIdentityUnconfirmed = false;
  } else if (typedCheck.nameMatch === 'partial') {
    finalIdentityUnconfirmed = false;
  }

  // Mark category mismatch or partial identity flags resolved when user took action
  const resolvedFlags: UploadCheckFlag[] = (typedCheck.flags || []).map((f) => {
    if (f.code === 'CATEGORY_MISMATCH' && expectedCategoryForType === finalCategory) {
      return { ...f, resolved: true, resolutionAction: `Saved as ${finalCategory}` };
    }
    if (f.code === 'IDENTITY_PARTIAL_MATCH') {
      return { ...f, resolved: true, resolutionAction: 'Confirmed by user' };
    }
    if (f.code === 'GENERIC_FILENAME_NEEDS_TITLE' && finalTitle.length >= 3) {
      return { ...f, resolved: true, resolutionAction: `Titled "${finalTitle}"` };
    }
    return f;
  });

  // Compute authoritative trust tier in code
  const remainingActiveFlags = resolvedFlags.filter((f) => !f.resolved);
  const finalTrust = computeUploadTrustTier({
    readabilityStatus: typedCheck.readability?.status || 'readable',
    detectedType: typedCheck.detectedType,
    selectedCategory: finalCategory,
    typeConfidence: typedCheck.typeConfidence,
    nameMatch: finalNameMatch,
    identityUnconfirmed: finalIdentityUnconfirmed,
    targetSkill: typedCheck.targetSkill,
    targetSkillMentioned: typedCheck.targetSkillMentioned,
    attachedAnywayUnconfirmed: Boolean(attachAnyway),
    flags: remainingActiveFlags,
  });

  const finalCheckResult: UploadCheckResult = {
    ...typedCheck,
    filename: finalFilename,
    userTitle: finalTitle,
    selectedCategory: finalCategory,
    nameMatch: finalNameMatch,
    identityUnconfirmed: finalIdentityUnconfirmed,
    flags: resolvedFlags,
    trust: finalTrust,
    confirmedByUser: true,
  };

  // Privacy rule: never store extracted text for ID documents or marksheets
  const safeExtractedText = typedCheck.privacyRedacted ? '' : String(extractedText || typedCheck.extractedTextPreview || '');

  let attachmentRow: Record<string, unknown> | undefined;

  if (linkExistingAttachmentId) {
    attachmentRow = db
      .prepare('SELECT * FROM attachments WHERE id=? AND user_id=?')
      .get(Number(linkExistingAttachmentId), userId) as Record<string, unknown> | undefined;
  }

  if (!attachmentRow) {
    const insertRes = db
      .prepare(
        `INSERT INTO attachments (
          user_id, filename, mime_type, category, extracted_text, file_size,
          hash, user_title, selected_category, detected_type, type_confidence,
          name_match, readability_json, flags_json, detected_skills_json,
          trust, confirmed_by_user, upload_check_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        finalFilename,
        typedCheck.mimeType || 'application/pdf',
        finalCategory,
        safeExtractedText,
        Number(typedCheck.fileSize || safeExtractedText.length),
        typedCheck.hash,
        finalTitle,
        finalCategory,
        typedCheck.detectedType,
        typedCheck.typeConfidence,
        finalNameMatch,
        JSON.stringify(typedCheck.readability),
        JSON.stringify(resolvedFlags),
        JSON.stringify(typedCheck.detectedSkills || []),
        finalTrust,
        1,
        JSON.stringify(finalCheckResult)
      );

    attachmentRow = db
      .prepare('SELECT * FROM attachments WHERE id=?')
      .get(insertRes.lastInsertRowid) as Record<string, unknown>;
  }

  // Create evidence items for selected skills (or targetSkill if attachAnyway)
  const skillsToAttach: string[] = Array.isArray(selectedSkills)
    ? selectedSkills.map((s) => String(s).trim()).filter(Boolean)
    : [];
  if (attachAnyway && typedCheck.targetSkill && !skillsToAttach.includes(typedCheck.targetSkill)) {
    skillsToAttach.push(typedCheck.targetSkill);
  }

  const createdEvidence: ReturnType<typeof formatEvidenceRow>[] = [];
  const evType = finalCategory === 'certificate' ? 'certificate' : 'file';
  const isUnconfirmedEvidence =
    finalTrust === 'low' ||
    Boolean(attachAnyway) ||
    finalIdentityUnconfirmed;

  for (const rawSkill of skillsToAttach) {
    const canonicalSkill = normalizeSkillName(rawSkill).canonical || rawSkill;
    const skillDirectlyMentioned = (typedCheck.detectedSkills || []).some(
      (ds) => ds.toLowerCase() === canonicalSkill.toLowerCase()
    );
    const itemTrust =
      !skillDirectlyMentioned && attachAnyway ? 'low' : finalTrust;
    const itemUnconfirmed = isUnconfirmedEvidence || itemTrust === 'low';

    const evDetails = {
      trust: itemTrust,
      unconfirmedEvidence: itemUnconfirmed,
      identityUnconfirmed: finalIdentityUnconfirmed,
      uploadCheckId: typedCheck.id,
      sha256: typedCheck.hash,
      detectedType: typedCheck.detectedType,
      selectedCategory: finalCategory,
      certificateMeta: typedCheck.certificateMeta,
      verifyUrl: typedCheck.certificateMeta?.verifyUrl,
      issuer: typedCheck.certificateMeta?.issuer,
      credentialId: typedCheck.certificateMeta?.credentialId,
    };

    const evInsert = db
      .prepare(
        `INSERT INTO evidence (
          user_id, skill, skill_id, type, title, url, status, reason, added_at, details, attachment_name, extracted_summary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        canonicalSkill.slice(0, 80),
        canonicalSkill.slice(0, 80),
        evType,
        finalTitle,
        typedCheck.certificateMeta?.verifyUrl || '',
        itemTrust === 'rejected' ? 'rejected' : 'valid',
        itemUnconfirmed
          ? finalIdentityUnconfirmed
            ? 'Identity unconfirmed — does not count toward verified status until resolved'
            : `Unconfirmed evidence (${itemTrust} trust) — leaves skill as declared`
          : `Verified via Upload Check (${itemTrust} trust)`,
        new Date().toISOString(),
        JSON.stringify(evDetails),
        finalFilename,
        safeExtractedText.slice(0, 280)
      );

    const insertedEv = db
      .prepare('SELECT * FROM evidence WHERE id=?')
      .get(evInsert.lastInsertRowid) as Record<string, unknown>;
    if (insertedEv) {
      createdEvidence.push(formatEvidenceRow(insertedEv));
    }
  }

  // If this is a confirmed résumé and user wants to update profile résumé
  let updatedReadinessScore: number | undefined = undefined;
  if (
    finalCategory === 'resume' &&
    saveToProfile !== false &&
    overwriteProfileResume !== false &&
    !keepExistingResumeOnConflict &&
    safeExtractedText.length >= 100
  ) {
    const existingSkills = String(userProf?.skills_text || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const mergedSkills = Array.from(
      new Set([...existingSkills, ...(typedCheck.detectedSkills || [])])
    ).join(', ');

    db.prepare('UPDATE profile SET resume_text=?, skills_text=? WHERE user_id=?').run(
      safeExtractedText,
      mergedSkills || userProf?.skills_text || '',
      userId
    );

    try {
      const userEvidence = db
        .prepare('SELECT * FROM evidence WHERE user_id=?')
        .all(userId) as Array<{ skill: string; type: string; title: string; url?: string }>;
      const latestAnalysisRow = db
        .prepare('SELECT * FROM analyses WHERE user_id=? ORDER BY id DESC LIMIT 1')
        .get(userId) as { job_title?: string; company?: string; job_description?: string } | undefined;

      const targetRoleTitle =
        userProf?.title || latestAnalysisRow?.job_title || 'Full-Stack Software Engineer';
      const targetCompany = latestAnalysisRow?.company || 'CloudScale Systems';
      const targetJobDesc =
        latestAnalysisRow?.job_description ||
        `${targetRoleTitle} at ${targetCompany}\nRequired Skills: ${
          mergedSkills || 'React, TypeScript, Node.js, SQL, Docker'
        }`;

      const refreshedAnalysis = buildDeterministicAnalysis(
        safeExtractedText,
        targetJobDesc,
        userEvidence,
        userProf?.name || effectiveUser.name || 'Arjun Mehta',
        targetRoleTitle
      );
      updatedReadinessScore = refreshedAnalysis.readinessScore;
    } catch {
      // Non-fatal
    }
  }

  res.status(201).json({
    ok: true,
    attachment: attachmentRow ? formatAttachmentRow(attachmentRow) : null,
    createdEvidence,
    checkResult: finalCheckResult,
    text: safeExtractedText,
    detectedSkills: typedCheck.detectedSkills || [],
    readinessScore: updatedReadinessScore,
  });
});

app.post('/api/analyze', async (req: Request, res: Response): Promise<void> => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const { resumeText, jobDescription, evidence = [], modelId } = req.body || {};

  if (
    typeof resumeText !== 'string' ||
    typeof jobDescription !== 'string' ||
    resumeText.trim().length < 20 ||
    jobDescription.trim().length < 20
  ) {
    res.status(400).json({
      error: 'Please provide both a résumé and job description (at least 20 characters each).',
    });
    return;
  }

  try {
    const userProf = db.prepare('SELECT * FROM profile WHERE user_id=?').get(userId) as
      | ProfileRow
      | undefined;
    const candidateName = userProf?.name || authUser?.name || 'Candidate';
    const candidateRole = userProf?.title || 'Software Engineer';

    const analysis = await runAIAnalysis(
      resumeText,
      jobDescription,
      Array.isArray(evidence) ? evidence : [],
      candidateName,
      candidateRole,
      typeof modelId === 'string' ? modelId : undefined
    );

    db.prepare('UPDATE profile SET resume_text=? WHERE user_id=?').run(resumeText, userId);

    const match = /([^\n]{2,70})\s+(?:at|@)\s+([^\n]{2,60})/i.exec(jobDescription);
    const jobTitle = match ? match[1].trim() : candidateRole || 'Software Engineer';
    const company = match ? match[2].trim() : 'Target Company';

    const insertResult = db
      .prepare(
        'INSERT INTO analyses (user_id, job_title, company, job_description, data) VALUES (?, ?, ?, ?, ?)'
      )
      .run(userId, jobTitle, company, jobDescription, JSON.stringify(analysis));

    res.json({
      ...analysis,
      id: Number(insertResult.lastInsertRowid),
      jobTitle,
      company,
      job_description: jobDescription,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Analysis service unavailable.';
    res.status(502).json({ error: msg });
  }
});

app.get('/api/analyses/latest', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const row = db
    .prepare('SELECT * FROM analyses WHERE user_id=? ORDER BY id DESC LIMIT 1')
    .get(userId) as
    | { id: number; job_title: string; company: string; job_description: string; data: string }
    | undefined;
  if (!row) {
    res.json(null);
    return;
  }
  try {
    const data = JSON.parse(row.data);
    res.json({
      ...data,
      id: row.id,
      jobTitle: row.job_title,
      company: row.company,
      job_description: row.job_description,
    });
  } catch {
    res.json(null);
  }
});

app.get('/api/analyses', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const rows = db
    .prepare('SELECT * FROM analyses WHERE user_id=? ORDER BY id DESC LIMIT 15')
    .all(userId) as Array<{
    id: number;
    job_title: string;
    company: string;
    job_description: string;
    data: string;
    created_at: string;
  }>;
  const parsed = rows
    .map((r) => {
      try {
        return {
          ...JSON.parse(r.data),
          id: r.id,
          jobTitle: r.job_title,
          company: r.company,
          job_description: r.job_description,
          created_at: r.created_at,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  res.json(parsed);
});

app.get('/api/applications', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const rows = db
    .prepare('SELECT * FROM applications WHERE user_id=? ORDER BY created_at DESC')
    .all(userId);
  res.json(rows);
});

app.post('/api/applications', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const {
    company,
    job_title,
    status = 'Saved',
    application_date = new Date().toISOString().slice(0, 10),
    follow_up_date = '',
    notes = '',
    analysis_id = null,
  } = req.body || {};

  if (!company || !job_title) {
    res.status(400).json({ error: 'Company and job title are required.' });
    return;
  }

  const validStatuses = ['Saved', 'Preparing', 'Applied', 'Interview', 'Offer', 'Rejected'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: 'Invalid application status.' });
    return;
  }

  const result = db
    .prepare(
      `INSERT INTO applications (user_id, company, job_title, status, application_date, follow_up_date, notes, analysis_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      String(company).trim().slice(0, 100),
      String(job_title).trim().slice(0, 100),
      status,
      application_date,
      follow_up_date,
      String(notes).slice(0, 1000),
      analysis_id
    );

  res.status(201).json({ id: result.lastInsertRowid });
});

app.patch('/api/applications/:id', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const id = Number(req.params.id);
  const { status, notes, follow_up_date } = req.body || {};
  const current = db
    .prepare('SELECT * FROM applications WHERE id=? AND user_id=?')
    .get(id, userId);
  if (!current) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  db.prepare(
    `UPDATE applications SET 
      status = COALESCE(?, status),
      notes = COALESCE(?, notes),
      follow_up_date = COALESCE(?, follow_up_date)
     WHERE id=? AND user_id=?`
  ).run(
    status || null,
    notes !== undefined ? notes : null,
    follow_up_date !== undefined ? follow_up_date : null,
    id,
    userId
  );

  res.json({ ok: true });
});

app.delete('/api/applications/:id', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const id = Number(req.params.id);
  db.prepare('DELETE FROM applications WHERE id=? AND user_id=?').run(id, userId);
  res.json({ ok: true });
});

// ============================================================================
// NEBIUS TOKEN FACTORY AI COPILOT & STRUCTURED FEATURES
// Routes:
//   - GET  /api/ai/models-status
//   - POST /api/ai/structured (JSON features & 4 suggestion chips)
//   - POST /api/ai/chat       (SSE streaming chat)
// ============================================================================

const VALID_STRUCTURED_TASKS = new Set<CopilotStructuredTask>([
  'chip_fastest_skills',
  'chip_weekend_project',
  'chip_compare_roles',
  'chip_honest_resume',
  'honest_rewrite',
  'why_this_score',
  'close_the_gap',
]);

app.get('/api/ai/models-status', (req: Request, res: Response): void => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const { vault } = loadUserProofVaultFromDb({ userId });
  res.json({
    nebius: getNebiusConfigState(),
    proofVaultSummary: {
      role: vault.role,
      targetRole: vault.targetRole,
      readinessScore: vault.readinessScore,
      verifiedCount: vault.summaryCounts.verified,
      selfDeclaredCount: vault.summaryCounts.selfDeclared,
      missingCount: vault.summaryCounts.missing,
    },
  });
});

app.post('/api/ai/structured', async (req: Request, res: Response): Promise<void> => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const userKey = `user-${userId}-${req.ip || 'local'}`;

  const rateCheck = checkUserAiRateLimit(userKey);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: `Rate limit reached for AI Copilot requests. Please wait ${rateCheck.retryAfterSeconds}s and try again.`,
      retryAfterSeconds: rateCheck.retryAfterSeconds,
    });
    return;
  }

  const { task, viewerMode, targetRole, payload } = req.body || {};
  const cleanTask = String(task || '').trim() as CopilotStructuredTask;

  if (!VALID_STRUCTURED_TASKS.has(cleanTask)) {
    res.status(400).json({
      error: `Unsupported structured AI task "${cleanTask}". Expected one of: ${Array.from(
        VALID_STRUCTURED_TASKS
      ).join(', ')}.`,
    });
    return;
  }

  try {
    const result = await executeNebiusStructuredTask({
      userId,
      task: cleanTask,
      viewerMode: typeof viewerMode === 'string' ? viewerMode : undefined,
      targetRole: typeof targetRole === 'string' ? targetRole : undefined,
      payload: payload && typeof payload === 'object' ? payload : {},
    });
    res.json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : 'Could not complete structured AI request. Please try again.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/ai/chat', async (req: Request, res: Response): Promise<void> => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const userKey = `user-${userId}-${req.ip || 'local'}`;

  const rateCheck = checkUserAiRateLimit(userKey);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: `Rate limit reached for AI Copilot requests. Please wait ${rateCheck.retryAfterSeconds}s and try again.`,
      retryAfterSeconds: rateCheck.retryAfterSeconds,
    });
    return;
  }

  const { messages, message, viewerMode, targetRole, vault, webSearch } = req.body || {};

  const normalizedMessages: Array<{ role: 'user' | 'assistant'; content: string }> =
    Array.isArray(messages) && messages.length > 0
      ? messages
          .filter(
            (m: any) =>
              m &&
              (m.role === 'user' || m.role === 'assistant') &&
              typeof (m.content ?? m.text) === 'string' &&
              String(m.content ?? m.text).trim().length > 0
          )
          .map((m: any) => ({
            role: m.role as 'user' | 'assistant',
            content: String(m.content ?? m.text).trim(),
          }))
      : typeof message === 'string' && message.trim()
      ? [{ role: 'user', content: message.trim() }]
      : [];

  if (normalizedMessages.length === 0) {
    res.status(400).json({ error: 'Please provide messages: [{ role, content }] for the AI Career Readiness Copilot.' });
    return;
  }

  // Configure Server-Sent Events (SSE) headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  const writeSseEvent = (eventPayload: Record<string, unknown>) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(eventPayload)}\n\n`);
  };

  try {
    await streamNebiusChatResponse({
      userId,
      messages: normalizedMessages,
      viewerMode: typeof viewerMode === 'string' ? viewerMode : undefined,
      targetRole: typeof targetRole === 'string' ? targetRole : undefined,
      vaultOverride: vault && typeof vault === 'object' ? (vault as CopilotVaultPayload) : undefined,
      webSearch: Boolean(webSearch),
      signal: abortController.signal,
      onMeta: (meta) => {
        writeSseEvent({ type: 'meta', ...meta });
      },
      onToken: (delta) => {
        writeSseEvent({ type: 'delta', content: delta });
      },
      onDone: (summary) => {
        writeSseEvent({ type: 'done', ...summary });
      },
    });
  } catch (err: unknown) {
    console.error('[POST /api/ai/chat] Error:', err instanceof Error ? err.message : err);
    writeSseEvent({ type: 'error', error: 'AI is unavailable, retry' });
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
});

// Unified Copilot endpoint: POST /api/copilot accepting { question, messages, mode, targetRole, vault }
app.post('/api/copilot', async (req: Request, res: Response): Promise<void> => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : 1;
  const userKey = `user-${userId}-${req.ip || 'local'}`;

  const rateCheck = checkUserAiRateLimit(userKey);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: `Rate limit reached for AI Copilot requests. Please wait ${rateCheck.retryAfterSeconds}s and try again.`,
      retryAfterSeconds: rateCheck.retryAfterSeconds,
    });
    return;
  }

  const { question, messages, mode, targetRole, vault } = req.body || {};
  const cleanQuestion = String(question || '').trim();
  const hasMessages = Array.isArray(messages) && messages.length > 0;
  if (!cleanQuestion && !hasMessages) {
    res.status(400).json({ error: 'Please enter a question for the AI Career Readiness Copilot.' });
    return;
  }

  try {
    const result = await runUnifiedCopilotChat({
      userId,
      question: cleanQuestion || undefined,
      messages: hasMessages ? messages : undefined,
      mode: typeof mode === 'string' ? mode : undefined,
      targetRole: typeof targetRole === 'string' ? targetRole : undefined,
      vault: vault && typeof vault === 'object' ? (vault as CopilotVaultPayload) : undefined,
    });
    res.json(result);
  } catch (err: unknown) {
    console.error('[POST /api/copilot] Error:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'AI is unavailable, retry' });
  }
});

// ============================================================================
// STEP 5: SKILL READINESS 2026 MARKET DEMAND (TAVILY + NEBIUS FAST MODEL)
// ============================================================================

interface SkillDemandCacheEntry {
  data: {
    skill: string;
    role: string;
    summary: string;
    sources: Array<{ title: string; url: string }>;
    cachedAt: string;
  };
  expiresAt: number;
}
const skillDemandCache = new Map<string, SkillDemandCacheEntry>();

app.post('/api/skill-demand', async (req: Request, res: Response): Promise<void> => {
  const { skill, role } = req.body || {};
  const cleanSkill = String(skill || '').trim().slice(0, 80);
  const cleanRole = String(role || '').trim().slice(0, 100) || 'Software Engineer';

  if (!cleanSkill) {
    res.status(400).json({ error: 'Skill is required' });
    return;
  }

  const cacheKey = `${cleanSkill.toLowerCase()}:::${cleanRole.toLowerCase()}`;
  const now = Date.now();
  const cached = skillDemandCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    res.json(cached.data);
    return;
  }

  let searchResults: Array<{ title: string; url: string; content: string }> = [];
  let answer: string | null = null;

  if (isTavilyConfigured()) {
    try {
      const tavilyRes = await tavilySearch({
        query: `${cleanSkill} skill hiring demand for ${cleanRole} in 2026`,
        maxResults: 3,
        topic: 'general',
        includeAnswer: true,
      });
      searchResults = tavilyRes.results || [];
      answer = tavilyRes.answer || null;
    } catch (tavilyErr) {
      console.warn(
        '[POST /api/skill-demand] Tavily search fallback:',
        tavilyErr instanceof Error ? tavilyErr.message : tavilyErr
      );
    }
  }

  const summary = await summarizeSkillDemandWithNebius({
    skill: cleanSkill,
    role: cleanRole,
    searchResults,
    tavilyAnswer: answer,
  });

  const payload = {
    skill: cleanSkill,
    role: cleanRole,
    summary,
    sources: searchResults.slice(0, 3).map((r) => ({ title: r.title, url: r.url })),
    cachedAt: new Date().toISOString(),
  };

  // Cache aggressively for 1 hour
  skillDemandCache.set(cacheKey, {
    data: payload,
    expiresAt: now + 60 * 60 * 1000,
  });

  res.json(payload);
});



