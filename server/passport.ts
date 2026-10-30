import crypto from 'node:crypto';
import { db } from './db';
import { loadUserProofVaultFromDb, generatePassportAiSummary } from './nebiusAi';

export interface PublicVerifiedSkill {
  skill: string;
  proofTitle: string;
  proofType: string;
  proofUrl?: string;
  verifiedAt?: string;
}

export interface PublicPassportPayload {
  displayName: string;
  targetRole: string;
  readinessScore: number;
  tier: string;
  verifiedSkills: PublicVerifiedSkill[];
  selfDeclaredCount: number;
  generatedAt: string;
  summary?: string | null;
}

export interface PassportRecord {
  id: number;
  user_id: number;
  token: string;
  show_name: number;
  summary: string | null;
  summary_hash: string | null;
  created_at: string;
  revoked_at: string | null;
}

/**
 * Pure function: compute deterministic hash of verified skills + proof titles
 */
export function computePassportSummaryHash(
  verifiedSkills: Array<{ skill: string; proofTitle: string }>
): string {
  const normalized = verifiedSkills
    .map((v) => `${(v.skill || '').trim().toLowerCase()}:${(v.proofTitle || '').trim().toLowerCase()}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Pure function: build public-facing passport payload.
 * Enforces strict server-side allow-list so private data can NEVER leak.
 */
export function buildPublicPassportPayload(params: {
  showName: boolean;
  userFullName?: string;
  targetRole?: string;
  readinessScore: number;
  tier?: string;
  verifiedSkills: PublicVerifiedSkill[];
  selfDeclaredCount: number;
  summary?: string | null;
  generatedAt?: string;
}): PublicPassportPayload {
  let displayName = 'Verified candidate';
  if (params.showName && params.userFullName) {
    const rawFirst = params.userFullName.trim().split(/\s+/)[0];
    if (rawFirst && rawFirst.toLowerCase() !== 'candidate') {
      displayName = rawFirst;
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(params.readinessScore || 0)));
  const tier =
    params.tier ||
    (score >= 80 ? 'Offer Ready' : score >= 65 ? 'Competitive Fit' : 'Building Proof');

  // Allow-list: only keep approved fields; only http/https URLs allowed
  const sanitizedVerified = params.verifiedSkills.map((v) => {
    let cleanUrl: string | undefined = undefined;
    if (v.proofUrl) {
      const trimmed = v.proofUrl.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        cleanUrl = trimmed;
      }
    }

    return {
      skill: v.skill,
      proofTitle: v.proofTitle,
      proofType: v.proofType,
      ...(cleanUrl ? { proofUrl: cleanUrl } : {}),
      ...(v.verifiedAt ? { verifiedAt: v.verifiedAt } : {}),
    };
  });

  return {
    displayName,
    targetRole: params.targetRole || 'Software Engineer',
    readinessScore: score,
    tier,
    verifiedSkills: sanitizedVerified,
    selfDeclaredCount: Math.max(0, Math.round(params.selfDeclaredCount || 0)),
    generatedAt: params.generatedAt || new Date().toISOString(),
    summary: params.summary || null,
  };
}

/**
 * Retrieve active passport for user (if any)
 */
export function getActivePassport(userId: number): PassportRecord | null {
  const row = db
    .prepare('SELECT * FROM passports WHERE user_id = ? AND revoked_at IS NULL ORDER BY id DESC LIMIT 1')
    .get(userId) as PassportRecord | undefined;
  return row || null;
}

/**
 * Create a new passport if none is active, otherwise update show_name on active passport.
 */
export async function createOrUpdatePassport(params: {
  userId: number;
  showName: boolean;
}): Promise<PassportRecord> {
  const { userId, showName } = params;
  const existing = getActivePassport(userId);

  if (existing) {
    db.prepare('UPDATE passports SET show_name = ? WHERE id = ?').run(
      showName ? 1 : 0,
      existing.id
    );
    const updated = db.prepare('SELECT * FROM passports WHERE id = ?').get(existing.id) as PassportRecord;

    // Trigger background or inline summary generation if missing or outdated
    void refreshPassportSummaryIfStale(updated);
    return updated;
  }

  // Generate 18-byte URL-safe base64 token (24 chars)
  const token = crypto.randomBytes(18).toString('base64url');
  db.prepare('INSERT INTO passports (user_id, token, show_name) VALUES (?, ?, ?)').run(
    userId,
    token,
    showName ? 1 : 0
  );

  const created = db.prepare('SELECT * FROM passports WHERE token = ?').get(token) as PassportRecord;

  // Attempt to generate initial summary
  void refreshPassportSummaryIfStale(created);
  return created;
}

/**
 * Revoke the active passport for a user.
 */
export function revokePassport(userId: number): boolean {
  const info = db
    .prepare("UPDATE passports SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL")
    .run(userId);
  return info.changes > 0;
}

/**
 * Helper to refresh AI summary when verified proof list hash changes or is missing.
 */
export async function refreshPassportSummaryIfStale(passport: PassportRecord): Promise<void> {
  try {
    const { vault } = loadUserProofVaultFromDb({ userId: passport.user_id });
    const verifiedSkills = vault.skills.filter((s) => s.status === 'verified');
    if (verifiedSkills.length === 0) return;

    const listForHash = verifiedSkills.map((s) => ({
      skill: s.skill,
      proofTitle: s.proofs[0]?.title || 'Verified project artifact',
      proofType: s.proofs[0]?.type || 'code_repository',
    }));

    const newHash = computePassportSummaryHash(listForHash);
    if (passport.summary && passport.summary_hash === newHash) {
      return; // Already up-to-date
    }

    const summary = await generatePassportAiSummary({
      userId: passport.user_id,
      targetRole: vault.targetRole,
      verifiedSkills: listForHash,
    });

    if (summary) {
      db.prepare('UPDATE passports SET summary = ?, summary_hash = ? WHERE id = ?').run(
        summary,
        newHash,
        passport.id
      );
    }
  } catch (err) {
    console.warn('[Passport Summary Refresh] Silently failed:', err);
  }
}

/**
 * Look up public passport by token and return allow-listed payload.
 * Returns null if token is unknown or revoked.
 */
export async function getPublicPassportData(token: string): Promise<PublicPassportPayload | null> {
  const passportRow = db
    .prepare('SELECT * FROM passports WHERE token = ?')
    .get(token) as PassportRecord | undefined;

  if (!passportRow || passportRow.revoked_at) {
    return null;
  }

  // Load from real data source of truth (same as proof vault)
  const { vault } = loadUserProofVaultFromDb({ userId: passportRow.user_id });

  // Get user name for first name display if show_name is true
  const userRow = db
    .prepare('SELECT name FROM users WHERE id = ?')
    .get(passportRow.user_id) as { name: string } | undefined;
  const userFullName = userRow?.name || vault.candidateName;

  // Build verified skills list
  const rawEvidenceRows = db
    .prepare('SELECT skill, title, type, url, added_at FROM evidence WHERE user_id = ?')
    .all(passportRow.user_id) as Array<{
    skill: string;
    title: string;
    type: string;
    url?: string;
    added_at?: string;
  }>;

  const verifiedSkillEntries = vault.skills.filter((s) => s.status === 'verified');

  const verifiedSkills: PublicVerifiedSkill[] = verifiedSkillEntries.map((s) => {
    const proof = s.proofs[0];
    const matchingEv = rawEvidenceRows.find(
      (e) => e.skill.toLowerCase() === s.skill.toLowerCase()
    );

    return {
      skill: s.skill,
      proofTitle: proof?.title || matchingEv?.title || 'Verified project artifact',
      proofType: proof?.type || matchingEv?.type || 'code_repository',
      proofUrl: proof?.url || matchingEv?.url,
      verifiedAt: matchingEv?.added_at,
    };
  });

  // If summary is missing or stale, trigger refresh (non-blocking)
  void refreshPassportSummaryIfStale(passportRow);

  return buildPublicPassportPayload({
    showName: Boolean(passportRow.show_name),
    userFullName,
    targetRole: vault.targetRole,
    readinessScore: vault.readinessScore,
    verifiedSkills,
    selfDeclaredCount: vault.summaryCounts.selfDeclared,
    summary: passportRow.summary,
  });
}
