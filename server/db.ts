import Database from 'better-sqlite3';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Ensure database writes ONLY occur in os.tmpdir() at runtime (Netlify / Serverless constraint)
const tmpDbPath = path.join(os.tmpdir(), 'applywise-runtime.db');
const seedDbPath = path.resolve(process.cwd(), 'applywise.db');

if (!fs.existsSync(tmpDbPath) && fs.existsSync(seedDbPath)) {
  try {
    fs.copyFileSync(seedDbPath, tmpDbPath);
  } catch {
    // Proceed with fresh SQLite database in os.tmpdir()
  }
}

export const db = new Database(tmpDbPath);

// Base tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    account_role TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    name TEXT,
    title TEXT,
    role TEXT,
    location TEXT,
    education TEXT,
    skills_text TEXT,
    resume_text TEXT,
    github_username TEXT,
    onboarded INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    skill TEXT NOT NULL,
    skill_id TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    status TEXT DEFAULT 'valid',
    reason TEXT,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    details TEXT,
    attachment_name TEXT,
    extracted_summary TEXT
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    job_title TEXT,
    company TEXT,
    job_description TEXT,
    data TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    company TEXT NOT NULL,
    job_title TEXT NOT NULL,
    job_description TEXT,
    status TEXT NOT NULL,
    application_date TEXT,
    follow_up_date TEXT,
    notes TEXT,
    analysis_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    category TEXT DEFAULT 'resume',
    extracted_text TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    hash TEXT,
    user_title TEXT,
    selected_category TEXT,
    detected_type TEXT,
    type_confidence REAL,
    name_match TEXT,
    readability_json TEXT,
    flags_json TEXT,
    detected_skills_json TEXT,
    trust TEXT DEFAULT 'high',
    confirmed_by_user INTEGER DEFAULT 1,
    upload_check_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS passports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    show_name INTEGER NOT NULL DEFAULT 0,
    summary TEXT,
    summary_hash TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT
  );
`);

// Safely add new columns if upgrading an existing database
const alterStatements = [
  'ALTER TABLE profile ADD COLUMN user_id INTEGER',
  'ALTER TABLE profile ADD COLUMN onboarded INTEGER DEFAULT 0',
  'ALTER TABLE profile ADD COLUMN github_username TEXT',
  'ALTER TABLE evidence ADD COLUMN user_id INTEGER',
  'ALTER TABLE evidence ADD COLUMN skill_id TEXT',
  "ALTER TABLE evidence ADD COLUMN status TEXT DEFAULT 'valid'",
  'ALTER TABLE evidence ADD COLUMN reason TEXT',
  'ALTER TABLE evidence ADD COLUMN added_at TEXT',
  'ALTER TABLE evidence ADD COLUMN details TEXT',
  'ALTER TABLE evidence ADD COLUMN attachment_name TEXT',
  'ALTER TABLE evidence ADD COLUMN extracted_summary TEXT',
  'ALTER TABLE analyses ADD COLUMN user_id INTEGER',
  'ALTER TABLE applications ADD COLUMN user_id INTEGER',
  'ALTER TABLE attachments ADD COLUMN hash TEXT',
  'ALTER TABLE attachments ADD COLUMN user_title TEXT',
  'ALTER TABLE attachments ADD COLUMN selected_category TEXT',
  'ALTER TABLE attachments ADD COLUMN detected_type TEXT',
  'ALTER TABLE attachments ADD COLUMN type_confidence REAL',
  'ALTER TABLE attachments ADD COLUMN name_match TEXT',
  'ALTER TABLE attachments ADD COLUMN readability_json TEXT',
  'ALTER TABLE attachments ADD COLUMN flags_json TEXT',
  'ALTER TABLE attachments ADD COLUMN detected_skills_json TEXT',
  "ALTER TABLE attachments ADD COLUMN trust TEXT DEFAULT 'high'",
  'ALTER TABLE attachments ADD COLUMN confirmed_by_user INTEGER DEFAULT 1',
  'ALTER TABLE attachments ADD COLUMN upload_check_json TEXT',
  'ALTER TABLE passports ADD COLUMN summary TEXT',
  'ALTER TABLE passports ADD COLUMN summary_hash TEXT',
  'ALTER TABLE passports ADD COLUMN revoked_at TEXT',
];
for (const stmt of alterStatements) {
  try {
    db.exec(stmt);
  } catch {
    // Column already exists
  }
}

export function hashPassword(password: string): string {
  return scryptSync(password, 'applywise-local-salt', 64).toString('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  try {
    const key = scryptSync(password, 'applywise-local-salt', 64);
    const hashBuf = Buffer.from(hash, 'hex');
    return timingSafeEqual(key, hashBuf);
  } catch {
    return false;
  }
}

interface UserRow {
  id: number;
  name: string;
  email: string;
  account_role: string;
}

// Ensure demo@applywise.local is always a clean Demo Account (never showing stale personal login details)
const demoEmail = 'demo@applywise.local';
let demoUser = db.prepare('SELECT * FROM users WHERE email=?').get(demoEmail) as UserRow | undefined;
if (!demoUser) {
  const res = db
    .prepare('INSERT INTO users (name, email, password_hash, account_role) VALUES (?, ?, ?, ?)')
    .run('Arjun Mehta', demoEmail, hashPassword('applywise-demo'), 'Job seeker');
  demoUser = {
    id: Number(res.lastInsertRowid),
    name: 'Arjun Mehta',
    email: demoEmail,
    account_role: 'Job seeker',
  };
} else if (demoUser.name === 'Nivindharan') {
  db.prepare('UPDATE users SET name=?, account_role=? WHERE id=?').run(
    'Arjun Mehta',
    'Job seeker',
    demoUser.id
  );
  demoUser.name = 'Arjun Mehta';
  demoUser.account_role = 'Job seeker';
}

// Clean up any orphan null-user profile rows
db.prepare('DELETE FROM profile WHERE user_id IS NULL').run();

const demoProfile = db.prepare('SELECT * FROM profile WHERE user_id=?').get(demoUser.id) as
  | { id: number; name: string }
  | undefined;

const needsCleanDemoSeed = !demoProfile || demoProfile.name === 'Nivindharan';

if (needsCleanDemoSeed) {
  const defaultDemoResume = `Arjun Mehta
Senior Full-Stack Engineer | Bengaluru / Remote | arjun.mehta@example.com

SUMMARY:
Full-stack engineer with 4+ years building distributed TypeScript/React frontends and high-throughput Node.js & PostgreSQL cloud services. Focused on testable architecture, observability, and sub-100ms API latency.

EXPERIENCE & PROJECTS:
1. Cloud-Native Realtime Telemetry Platform (React, TypeScript, Node.js, SQL, Docker)
- Architected multi-tenant dashboard and REST API ingestion pipeline handling 15,000+ events/sec.
- Containerized microservices with Docker and deployed automated CI/CD workflows on AWS ECS.
- Achieved 94% unit & integration test coverage across core billing and auth modules.

2. Distributed Order & Inventory Engine (Node.js, PostgreSQL, Redis, System Design)
- Designed idempotent webhook consumers and database indexing strategy reducing p95 query latency by 48%.

SKILLS:
React, TypeScript, Node.js, SQL, Docker, AWS, System Design, REST APIs, Git, Unit Testing, CI/CD`;

  if (!demoProfile) {
    db.prepare(
      `INSERT INTO profile (user_id, name, title, role, location, education, skills_text, resume_text, onboarded)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(
      demoUser.id,
      'Arjun Mehta',
      'Senior Full-Stack Engineer',
      'Job seeker',
      'Bengaluru / Remote',
      'B.Tech Computer Science, IIT Madras',
      'React, TypeScript, Node.js, SQL, Docker, AWS, System Design, REST APIs, Git, Unit Testing, CI/CD',
      defaultDemoResume
    );
  } else {
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
      'Arjun Mehta',
      'Senior Full-Stack Engineer',
      'Job seeker',
      'Bengaluru / Remote',
      'B.Tech Computer Science, IIT Madras',
      'React, TypeScript, Node.js, SQL, Docker, AWS, System Design, REST APIs, Git, Unit Testing, CI/CD',
      defaultDemoResume,
      demoUser.id
    );
  }

  // Clear stale personal attachments, analyses, and evidence from demo account and seed clean demo proofs
  db.prepare('DELETE FROM attachments WHERE user_id=?').run(demoUser.id);
  db.prepare('DELETE FROM analyses WHERE user_id=?').run(demoUser.id);
  db.prepare('DELETE FROM evidence WHERE user_id=?').run(demoUser.id);

  const insertDemoEvidence = db.prepare(
    'INSERT INTO evidence (user_id, skill, type, title, url, extracted_summary) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insertDemoEvidence.run(
    demoUser.id,
    'React',
    'GitHub link',
    'Realtime Telemetry Dashboard (React 19 + TypeScript)',
    'https://github.com/arjun-mehta/telemetry-cloud-ui',
    'Production React + TypeScript monorepo with accessible bento components and Playwright E2E suite.'
  );
  insertDemoEvidence.run(
    demoUser.id,
    'TypeScript',
    'project',
    'Type-Safe RPC & Schema Validator Library',
    'https://github.com/arjun-mehta/ts-rpc-schema',
    'Zero-dependency TypeScript validation package with 100% strict type coverage.'
  );
  insertDemoEvidence.run(
    demoUser.id,
    'Node.js',
    'GitHub link',
    'High-Throughput Event Ingestion Service (Node.js + SQL)',
    'https://github.com/arjun-mehta/event-ingestor-node',
    'Express & PostgreSQL worker service with rate limiting, idempotency keys, and integration tests.'
  );
  insertDemoEvidence.run(
    demoUser.id,
    'Docker',
    'certificate',
    'AWS & Container Architecture Professional Certificate',
    'https://www.coursera.org/account/accomplishments/verify/DEMO-DOCKER-AWS',
    'Verified credential covering multi-stage Docker builds, ECS orchestration, and CI/CD pipelines.'
  );
  insertDemoEvidence.run(
    demoUser.id,
    'Unit Testing',
    'GitHub link',
    'Automated API & UI Regression Suite (node:test + Playwright)',
    'https://github.com/arjun-mehta/telemetry-cloud-ui/actions',
    'Continuous integration test suite executing 85 unit and browser checks on every pull request.'
  );
}

// Seed default demo attachments with Upload Check metadata if demo user has none
const demoAttCount = db
  .prepare('SELECT COUNT(*) as cnt FROM attachments WHERE user_id=?')
  .get(demoUser.id) as { cnt: number };

if (!demoAttCount || demoAttCount.cnt === 0) {
  const resumeText = `Arjun Mehta
Senior Full-Stack Engineer | Bengaluru / Remote | arjun.mehta@example.com | +91 9876543210

SUMMARY:
Full-stack engineer with 4+ years building distributed TypeScript/React frontends and high-throughput Node.js & PostgreSQL cloud services.

EXPERIENCE & PROJECTS:
1. Cloud-Native Realtime Telemetry Platform at CloudScale Systems (2023 - Present)
- Architected multi-tenant dashboard and REST API ingestion pipeline handling 15,000+ events/sec.
- Containerized microservices with Docker and deployed automated CI/CD workflows on AWS ECS.

EDUCATION:
B.Tech Computer Science, IIT Madras (2019 - 2023)

SKILLS:
React, TypeScript, Node.js, SQL, Docker, AWS, System Design, REST APIs, Git, Unit Testing, CI/CD`;

  const certWarningText = `Certificate of Completion
This hereby certifies that Arjun Mehta has successfully completed the online course
"Docker & Cloud Container Architecture"
Issued by: Coursera
Credential ID: CRSA-DKR-2025`;

  db.prepare(
    `INSERT INTO attachments (
      user_id, filename, mime_type, category, extracted_text, file_size,
      hash, user_title, selected_category, detected_type, type_confidence,
      name_match, readability_json, flags_json, detected_skills_json, trust, confirmed_by_user
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    demoUser.id,
    'Arjun_Mehta_FullStack_Resume_2026.pdf',
    'application/pdf',
    'resume',
    resumeText,
    48200,
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'Arjun Mehta — Full-Stack Engineer Résumé',
    'resume',
    'resume',
    0.96,
    'match',
    JSON.stringify({ status: 'readable', charCount: resumeText.length, ocrConfidence: 98, source: 'PDF Text Layer' }),
    JSON.stringify([
      {
        code: 'RESUME_UNPROVEN_SKILLS',
        checkId: 'resume_specific',
        title: '6 claimed skills need proof',
        severity: 'info',
        message: 'Claimed in this résumé but not yet backed by proof: SQL, AWS, System Design, REST APIs, Git, CI/CD.',
      },
    ]),
    JSON.stringify(['React', 'TypeScript', 'Node.js', 'SQL', 'Docker', 'AWS', 'System Design', 'REST APIs', 'Git', 'Unit Testing', 'CI/CD']),
    'high',
    1
  );

  db.prepare(
    `INSERT INTO attachments (
      user_id, filename, mime_type, category, extracted_text, file_size,
      hash, user_title, selected_category, detected_type, type_confidence,
      name_match, readability_json, flags_json, detected_skills_json, trust, confirmed_by_user
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    demoUser.id,
    'WhatsApp_Image_2026_Docker_Cert.pdf',
    'application/pdf',
    'certificate',
    certWarningText,
    29400,
    '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    'Docker & Cloud Container Certificate',
    'certificate',
    'certificate',
    0.91,
    'match',
    JSON.stringify({ status: 'readable', charCount: certWarningText.length, ocrConfidence: 92, source: 'PDF Text Layer' }),
    JSON.stringify([
      {
        code: 'GENERIC_FILENAME_NEEDS_TITLE',
        checkId: 'filename_vs_content',
        title: 'Add a short title',
        severity: 'warning',
        message: 'File is named "WhatsApp_Image_2026_Docker_Cert.pdf". Add a short descriptive title so this evidence is easy to identify.',
      },
      {
        code: 'CERT_MISSING_DATE',
        checkId: 'certificate_sanity',
        title: 'Missing issue date',
        severity: 'warning',
        message: 'No issue or completion date was found on this certificate.',
      },
    ]),
    JSON.stringify(['Docker']),
    'medium',
    1
  );
}

