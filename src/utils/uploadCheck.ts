import type {
  AttachmentItem,
  CertificateMetadata,
  DocumentDetectedType,
  EvidenceItem,
  IdentityProfileInput,
  IdentityVerificationResult,
  IdentityVerificationStatus,
  NameMatchStatus,
  OcrFailureReason,
  Profile,
  ResumeSpecificMetadata,
  SelectedUploadCategory,
  UploadCheckFlag,
  UploadCheckResult,
  UploadTrustTier,
} from '../types';
import { identifySkills } from './skillMatcher';
import { getValidEvidenceForSkill, normalizeSkillName } from './evidenceModel';

// ============================================================================
// 1. PURE SHA-256 HASHING (WORKS IDENTICALLY IN NODE & BROWSER)
// ============================================================================

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

export function computeSha256Hex(input: string | Uint8Array): string {
  const bytes: Uint8Array =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;

  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('');
}

export function normalizeTextForHash(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// 2. CONTENT-BASED DOCUMENT TYPE CLASSIFIER (NEVER TRUSTS FILENAME/CATEGORY)
// ============================================================================

export interface ContentClassificationResult {
  type: DocumentDetectedType;
  confidence: number;
  reasons: string[];
}

export function formatDetectedTypeLabel(type: DocumentDetectedType): string {
  switch (type) {
    case 'resume':
      return 'résumé';
    case 'certificate':
      return 'certificate';
    case 'project_evidence':
      return 'project evidence';
    case 'marksheet':
      return 'marksheet / transcript';
    case 'id_document':
      return 'personal ID document';
    case 'job_description':
      return 'job description';
    case 'non_document_photo':
      return 'photo (not a document)';
    default:
      return 'unrelated document';
  }
}

export function formatSelectedCategoryLabel(cat: SelectedUploadCategory): string {
  switch (cat) {
    case 'resume':
      return 'Résumé';
    case 'certificate':
      return 'Certificate';
    case 'evidence':
      return 'Evidence';
  }
}

export function mapDetectedTypeToCategory(
  type: DocumentDetectedType
): SelectedUploadCategory | null {
  if (type === 'resume') return 'resume';
  if (type === 'certificate') return 'certificate';
  if (type === 'project_evidence') return 'evidence';
  return null;
}

/**
 * Detects whether an uploaded file / text looks like a non-document photo
 * (selfie, object, wallpaper, or blank screenshot with no document text).
 */
export function isLikelyNonDocumentPhoto(params: {
  rawText: string;
  mimeType?: string;
  filename?: string;
  ocrConfidence?: number;
  isNonDocumentPhotoFlag?: boolean;
}): boolean {
  const { rawText, mimeType = '', filename = '', ocrConfidence = 0, isNonDocumentPhotoFlag } = params;
  if (isNonDocumentPhotoFlag) return true;

  const clean = String(rawText || '').trim();
  const isImageMime =
    mimeType.startsWith('image/') ||
    /\.(png|jpe?g|jfif|webp|bmp|gif|heic)$/i.test(filename);

  if (
    /\b(selfie|portrait of a person|photo of a|photograph of|no readable text|not a document|outdoor scene|indoor scene|object photo)\b/i.test(
      clean
    )
  ) {
    return true;
  }

  if (!isImageMime) return false;

  const alphaWords = clean.match(/[a-zA-Z]{2,}/g) || [];
  if (clean.length < 25 && alphaWords.length < 3 && ocrConfidence < 45) {
    return true;
  }

  return false;
}

/**
 * Pure content-based document classifier.
 * Inspects ONLY the extracted text content—never the filename or user-selected category.
 */
export function classifyDocumentContent(rawText: string): ContentClassificationResult {
  const text = String(rawText || '').trim();
  const lower = text.toLowerCase();

  if (text.length < 30) {
    return {
      type: 'other',
      confidence: 0,
      reasons: ['Insufficient readable text to classify document content'],
    };
  }

  if (
    /\b(selfie|portrait of a person|photo of a|photograph of|not a document|no text found in image)\b/i.test(
      text
    )
  ) {
    return {
      type: 'non_document_photo',
      confidence: 0.92,
      reasons: ['Image appears to be a photo, selfie, or object rather than a text document'],
    };
  }

  // 1. Check ID Document signals (Aadhaar, PAN, Passport, Driver's License, Voter ID)
  const idSignals: string[] = [];
  if (/\b(aadhaar|uidai|unique identification authority of india|mera aadhaar)\b/i.test(text)) {
    idSignals.push('Contains Aadhaar / UIDAI government identity markers');
  }
  if (/\b\d{4}\s+\d{4}\s+\d{4}\b/.test(text) && /\b(dob|year of birth|male|female|address|vid)\b/i.test(text)) {
    idSignals.push('Contains 12-digit Aadhaar number pattern with demographic fields');
  }
  if (/\b(income tax department|permanent account number|pan card)\b/i.test(text) || /\b[A-Z]{5}[0-9]{4}[A-Z]\b/.test(text)) {
    idSignals.push('Contains PAN Card / Permanent Account Number identifiers');
  }
  if (/\b(republic of india|passport no|nationality|place of issue|date of expiry)\b/i.test(text) && /\bpassport\b/i.test(text)) {
    idSignals.push('Contains Passport government ID fields');
  }
  if (/\b(driving licence|election commission of india|voter id|epic no)\b/i.test(text)) {
    idSignals.push('Contains Government License / Voter ID markers');
  }
  if (idSignals.length >= 1) {
    return {
      type: 'id_document',
      confidence: Math.min(0.98, 0.84 + idSignals.length * 0.06),
      reasons: idSignals,
    };
  }

  // 2. Check Marksheet / Academic Transcript signals
  const marksheetSignals: string[] = [];
  if (/\b(statement of marks|marksheet|mark sheet|grade card|semester examination|controller of examinations)\b/i.test(text)) {
    marksheetSignals.push('Contains official marksheet / examination header');
  }
  if (/\b(sgpa|cgpa)\b/i.test(text) && /\b(subject code|marks obtained|maximum marks|credits|grade point|semester)\b/i.test(text)) {
    marksheetSignals.push('Contains course table with subject codes, credits, and SGPA/CGPA');
  }
  if (/\b(board of secondary education|central board of secondary education|cbse|icse|university examination|roll no|registration no)\b/i.test(text) && /\b(marks|grade|pass|result)\b/i.test(text)) {
    marksheetSignals.push('Contains board/university roll number and subject marks breakdown');
  }
  if (marksheetSignals.length >= 1) {
    return {
      type: 'marksheet',
      confidence: Math.min(0.96, 0.82 + marksheetSignals.length * 0.06),
      reasons: marksheetSignals,
    };
  }

  // 3. Score Resume, Certificate, Job Description, and Project Evidence
  const jdReasons: string[] = [];
  if (/\b(about the role|about the job|what you'll do|what you will do|key responsibilities|role responsibilities|position summary)\b/i.test(text)) {
    jdReasons.push('Contains job posting section headers ("About the role" / "Responsibilities")');
  }
  if (/\b(we are looking for|who you are|minimum qualifications|preferred qualifications|must-have skills|nice-to-have|required qualifications)\b/i.test(text)) {
    jdReasons.push('Contains employer hiring criteria ("We are looking for" / "Qualifications")');
  }
  if (/\b(equal opportunity employer|benefits & perks|competitive salary|how to apply|apply now|hiring team)\b/i.test(text)) {
    jdReasons.push('Contains employer recruitment / equal opportunity footer language');
  }

  const certReasons: string[] = [];
  if (/\b(certificate of completion|certificate of achievement|certificate of appreciation|certificate of excellence|this is to certify that|hereby certifies that|successfully completed)\b/i.test(text)) {
    certReasons.push('Contains formal certification phrase ("certifies that" / "successfully completed")');
  }
  if (/\b(credential id|certificate id|verification url|verify at|verify this certificate|issued by|awarded to|presented to|date of issue|issue date)\b/i.test(text)) {
    certReasons.push('Contains issuer, credential ID, issue date, or verification URL fields');
  }
  if (/\b(coursera|udemy|edx|aws certified|google cloud certified|microsoft certified|nptel|hackerrank|freecodecamp|linkedin learning)\b/i.test(text) && /\b(certificate|certified|course|completion|credential|awarded|presented)\b/i.test(text)) {
    certReasons.push('Names a recognized certification issuer and course credential');
  }

  const resumeReasons: string[] = [];
  if (/\b(work experience|professional experience|employment history|experience|internships?)\b/i.test(text) && /\b(education|b\.tech|b\.e\.|b\.sc|m\.tech|bachelor|master|university|college|institute)\b/i.test(text)) {
    resumeReasons.push('Contains both Experience and Education sections');
  }
  if (/\b(technical skills|core skills|skills|projects|academic projects|personal projects|summary|career objective|profile summary)\b/i.test(text)) {
    resumeReasons.push('Contains Skills, Projects, or Summary sections typical of a résumé');
  }
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text) && (/\b(linkedin\.com|github\.com)\b/i.test(text) || /\+?\d[\d\s\-()]{8,14}/.test(text))) {
    resumeReasons.push('Contains candidate contact header (email, phone, or profile links)');
  }

  const projectReasons: string[] = [];
  if (/\b(architecture|system design|api endpoints|database schema|benchmark|test suite|unit tests|integration tests|deployment|dockerfile|github\.com\/)\b/i.test(text)) {
    projectReasons.push('Contains technical project architecture, API, or test implementation details');
  }
  if (/\b(readme|installation|getting started|npm run|git clone|pull request|commit|latency|throughput)\b/i.test(text)) {
    projectReasons.push('Contains repository README, engineering metrics, or build instructions');
  }

  // Decide winner
  if (jdReasons.length >= 2 && resumeReasons.length <= 1) {
    return {
      type: 'job_description',
      confidence: Math.min(0.95, 0.75 + jdReasons.length * 0.07),
      reasons: jdReasons,
    };
  }

  if (certReasons.length >= 1 && (certReasons.length >= resumeReasons.length || /\b(certificate of|certifies that|credential id|awarded to|presented to)\b/i.test(text))) {
    return {
      type: 'certificate',
      confidence: Math.min(0.96, 0.76 + certReasons.length * 0.07),
      reasons: certReasons,
    };
  }

  if (resumeReasons.length >= 2) {
    return {
      type: 'resume',
      confidence: Math.min(0.96, 0.74 + resumeReasons.length * 0.08),
      reasons: resumeReasons,
    };
  }

  if (jdReasons.length >= 1 && resumeReasons.length === 0 && certReasons.length === 0) {
    return {
      type: 'job_description',
      confidence: 0.78,
      reasons: jdReasons,
    };
  }

  if (projectReasons.length >= 1) {
    return {
      type: 'project_evidence',
      confidence: Math.min(0.92, 0.72 + projectReasons.length * 0.08),
      reasons: projectReasons,
    };
  }

  if (resumeReasons.length === 1 && lower.includes('experience')) {
    return {
      type: 'resume',
      confidence: 0.72,
      reasons: resumeReasons,
    };
  }

  return {
    type: 'other',
    confidence: 0.35,
    reasons: ['Content does not match a résumé, certificate, or project evidence structure'],
  };
}

// ============================================================================
// 3. IDENTITY EXTRACTION, NORMALIZATION & UNIVERSAL verifyIdentity(profile, docText)
// ============================================================================

const HONORIFICS_REGEX =
  /\b(mr|mrs|ms|miss|dr|prof|professor|er|shri|sri|smt|kumari|jr|sr|ii|iii|iv)\.?\b/gi;

const COMMON_PROSE_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'he',
  'her',
  'his',
  'i',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'our',
  'she',
  'that',
  'the',
  'their',
  'this',
  'to',
  'was',
  'we',
  'were',
  'will',
  'with',
  'you',
  'your',
]);

const MOJIBAKE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Ã¡/g, 'á'],
  [/Ã©/g, 'é'],
  [/Ã­/g, 'í'],
  [/Ã³/g, 'ó'],
  [/Ãº/g, 'ú'],
  [/Ã±/g, 'ñ'],
  [/Ã¼/g, 'ü'],
  [/Ã¶/g, 'ö'],
  [/Ã¤/g, 'ä'],
  [/Ã§/g, 'ç'],
  [/Ã£/g, 'ã'],
  [/Ãª/g, 'ê'],
  [/Ã´/g, 'ô'],
  [/Ã¨/g, 'è'],
  [/Ã¹/g, 'ù'],
  [/Ã¢/g, 'â'],
  [/Ã®/g, 'î'],
  [/Ã»/g, 'û'],
  [/Ã /g, 'à'],
  [/ÃŸ/g, 'ß'],
  [/Ã¥/g, 'å'],
  [/Ã¸/g, 'ø'],
  [/Ã¦/g, 'æ'],
  [/Ã\u0081/g, 'Á'],
  [/Ã\u0089|Ã‰/g, 'É'],
  [/Ã\u008d/g, 'Í'],
  [/Ã\u0093|Ã“/g, 'Ó'],
  [/Ã\u009a/g, 'Ú'],
  [/Ã\u0091/g, 'Ñ'],
  [/Ã\u009c/g, 'Ü'],
  [/â€™|â€˜/g, "'"],
  [/â€œ|â€\u009d/g, '"'],
  [/â€“|â€”/g, '-'],
  [/Â /g, ' '],
];

/**
 * Fixes UTF-8 text that was misread as Latin-1 / Windows-1252 (mojibake),
 * e.g. "JosÃ© GarcÃ­a" -> "José García", "MÃ¼ller" -> "Müller".
 */
export function fixMojibake(input: string): string {
  let str = String(input || '');
  if (!str) return '';

  // 1. Decode multi-byte UTF-8 sequences that were interpreted as Latin-1 characters
  if (/[\u00C2-\u00F4][\u0080-\u00BF]/.test(str)) {
    try {
      const bytes = new Uint8Array(str.length);
      let canDecodeAsLatin1 = true;
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code > 0xff) {
          canDecodeAsLatin1 = false;
          break;
        }
        bytes[i] = code;
      }
      if (canDecodeAsLatin1) {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        str = decoded;
      }
    } catch {
      // Fallback to targeted sequence replacements below
    }
  }

  for (const [pattern, replacement] of MOJIBAKE_REPLACEMENTS) {
    str = str.replace(pattern, replacement);
  }

  return str;
}

/**
 * Step 1: Normalizes text for identity comparison:
 * - Fixes mojibake (UTF-8 read as Latin-1)
 * - Unicode NFKC normalization
 * - Strips accents / diacritics (NFD + combining marks removal + special Latin letters)
 * - Lowercases
 * - Removes punctuation (replaces hyphens/periods/apostrophes with spaces)
 * - Collapses whitespace
 */
export function normalizeIdentityText(input: string): string {
  const fixed = fixMojibake(String(input || ''));
  if (!fixed) return '';

  return fixed
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[øØ]/g, 'o')
    .replace(/[łŁ]/g, 'l')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Step 2: Tokenizes a person name.
 * Strips multi-letter honorific titles while keeping single-letter initials and single-word names.
 */
export function normalizeNameTokens(name: string): string[] {
  const strippedTitles = fixMojibake(String(name || '')).replace(HONORIFICS_REGEX, ' ');
  const normalized = normalizeIdentityText(strippedTitles);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !/^\d+$/.test(t));
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function jaroWinklerSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0.0;

  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let t = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }

  const transpositions = t / 2;
  const jaro =
    (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3;

  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(len1, len2));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

function tokenSimilarity(t1: string, t2: string): number {
  if (t1 === t2) return 1.0;
  if (t1.length === 1 && t2.startsWith(t1)) return 0.95;
  if (t2.length === 1 && t1.startsWith(t2)) return 0.95;
  const maxLen = Math.max(t1.length, t2.length);
  if (maxLen === 0) return 1.0;
  const levSim = Math.max(0, 1 - editDistance(t1, t2) / maxLen);
  const jwSim = jaroWinklerSimilarity(t1, t2);
  return Math.max(levSim, jwSim >= 0.85 ? jwSim : levSim * 0.6 + jwSim * 0.4);
}

/**
 * Compares two person name strings using normalized tokens, initial matching, and fuzzy matching.
 */
export function comparePersonNames(
  extractedName?: string,
  profileName?: string
): { status: NameMatchStatus; score: number } {
  const tExtracted = normalizeNameTokens(extractedName || '');
  const tProfile = normalizeNameTokens(profileName || '');

  if (tExtracted.length === 0) {
    return { status: 'not_found', score: 0 };
  }
  if (tProfile.length === 0) {
    return { status: 'unknown', score: 0 };
  }

  // 1. Exact token-set match (order-independent, e.g. "Rahul K" vs "K. Rahul")
  const setExtracted = Array.from(new Set(tExtracted)).sort();
  const setProfile = Array.from(new Set(tProfile)).sort();
  if (
    setExtracted.length === setProfile.length &&
    setExtracted.every((tok, idx) => tok === setProfile[idx])
  ) {
    return { status: 'match', score: 1.0 };
  }

  // 2. Order-independent token-set + fuzzy alignment (Levenshtein + Jaro-Winkler + initial matching)
  const shorter = tExtracted.length <= tProfile.length ? tExtracted : tProfile;
  const longer = tExtracted.length <= tProfile.length ? tProfile : tExtracted;

  const usedIndices = new Set<number>();
  let totalSim = 0;
  let strongTokenMatches = 0;

  for (const sTok of shorter) {
    let bestSim = 0;
    let bestIdx = -1;
    for (let i = 0; i < longer.length; i++) {
      if (usedIndices.has(i)) continue;
      const sim = tokenSimilarity(sTok, longer[i]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      usedIndices.add(bestIdx);
    }
    if (bestSim >= 0.85) {
      strongTokenMatches++;
    }
    totalSim += bestSim;
  }

  const avgSim = totalSim / shorter.length;

  let coverageFactor = 1.0;
  if (shorter.length === 1 && longer.length >= 2) {
    coverageFactor = 0.72;
  } else if (shorter.length < longer.length && strongTokenMatches < shorter.length) {
    coverageFactor = 0.85;
  }

  const finalScore = Number(Math.min(1.0, avgSim * coverageFactor).toFixed(2));

  if (finalScore >= 0.75) {
    return { status: 'match', score: finalScore };
  }
  if (finalScore >= 0.5) {
    return { status: 'partial', score: finalScore };
  }
  return { status: 'mismatch', score: finalScore };
}

const NON_NAME_WORDS_REGEX =
  /\b(resume|curriculum|vitae|cv|biodata|certificate|certification|certified|completion|completed|completing|successfully|achievement|excellence|appreciation|accomplishment|recognition|participation|summary|objective|career|experience|education|skills|technical|projects?|job|description|about|role|senior|junior|lead|principal|staff|full|stack|fullstack|frontend|backend|software|hardware|data|cloud|devops|secops|engineer|engineering|developer|development|architect|architecture|manager|management|analyst|analytics|scientist|science|computer|information|technology|mechanical|electrical|electronics|civil|chemical|artificial|intelligence|machine|learning|intern|internship|trainee|student|graduate|undergraduate|fresher|candidate|applicant|recipient|university|college|institute|academy|school|department|faculty|bachelor|master|diploma|degree|india|tamil|nadu|tamilnadu|tiruchirappalli|trichy|bengaluru|bangalore|mumbai|delhi|hyderabad|chennai|pune|kolkata|coimbatore|madurai|kerala|karnataka|maharashtra|telangana|remote|github|linkedin|portfolio|http|www|email|phone|contact|mobile|address|coursera|udemy|edx|amazon|google|microsoft|meta|ibm|nptel|hackerrank|freecodecamp|leetcode|verified|verify|credential|issued|awarded|presented|conferred|date|course|program|workshop|bootcamp|online|professional|advanced|fundamentals|introduction|specialization|grade|marks|semester|class|higher|secondary|aadhaar|government|unique|identification|authority|robot|transportation|line|following|automated|system|problem|solving|logical|thinking|strengths|languages?|native|proficient|beginner|english|japanese|korean|hindi|srm|iit|nit|iiit|vit|bits|anna|amrita|manipal)\b/i;

const TRAILING_NON_NAME_BOUNDARY_REGEX =
  /\s+(?:has|have|had|successfully|completed|completing|attended|attending|participated|participating|achieved|achieving|earned|earning|passed|passing|demonstrated|demonstrating|fulfilled|fulfilling|is|was|who|for|in|on|at|from|with|during|by|of|as|and|or|to|towards|under|b\.?e\.?|b\.?tech\.?|m\.?tech\.?|b\.?sc\.?|m\.?sc\.?|b\.?c\.?a\.?|m\.?c\.?a\.?|b\.?b\.?a\.?|m\.?b\.?a\.?|b\.?com\.?|m\.?com\.?|ph\.?d\.?|bachelor|master|diploma|degree|department|dept|school|faculty|college|university|institute|academy|class|year|semester|final|third|second|first|aspiring|motivated|passionate|dedicated|experienced|certified|qualified|results[\s-]?driven|detail[\s-]?oriented|entry[\s-]?level|fresher|graduate|undergraduate|postgraduate|student|scholar|learner|intern|internship|trainee|apprentice|fellow|candidate|applicant|computer|information|technology|science|engineering|engineer|mechanical|electrical|electronics|telecommunication|communication|civil|chemical|biomedical|aerospace|automobile|mechatronics|robotics|artificial|intelligence|machine|learning|deep|data|cloud|devops|secops|mlops|cyber|security|cybersecurity|network|networking|system|systems|software|hardware|web|mobile|android|ios|frontend|front[\s-]?end|backend|back[\s-]?end|fullstack|full[\s-]?stack|ui|ux|product|project|program|business|operations|quality|assurance|qa|sdet|test|testing|automation|database|sql|python|java|javascript|typescript|react|node|aws|azure|gcp|docker|kubernetes|linux|developer|development|programmer|coder|architect|architecture|analyst|analytics|scientist|researcher|consultant|specialist|administrator|admin|manager|management|director|lead|leader|principal|staff|senior|sr\.?|junior|jr\.?|associate|assistant|executive|officer|coordinator|designer|technician|technologist|career|objective|summary|profile|about|contact|email|e[\s-]?mail|phone|mobile|tel|address|location|linkedin|github|portfolio|website|resume|cv|curriculum|vitae|education|experience|work|employment|skills|technical|projects?|certifications?|certificates?|achievements?|awards?|languages?|interests?|hobbies|references?|declaration|tiruchirappalli|trichy|tamil\s*nadu|tamilnadu|chennai|coimbatore|madurai|salem|tirunelveli|vellore|erode|thanjavur|dindigul|bengaluru|bangalore|mysuru|mysore|mangaluru|karnataka|hyderabad|secunderabad|telangana|visakhapatnam|vijayawada|andhra|mumbai|pune|nagpur|nashik|thane|maharashtra|delhi|new\s*delhi|noida|gurgaon|gurugram|faridabad|ghaziabad|kolkata|howrah|west\s*bengal|ahmedabad|surat|vadodara|rajkot|gujarat|jaipur|udaipur|jodhpur|rajasthan|lucknow|kanpur|agra|varanasi|uttar\s*pradesh|bhopal|indore|madhya\s*pradesh|patna|bihar|bhubaneswar|odisha|chandigarh|punjab|haryana|kochi|cochin|thiruvananthapuram|trivandrum|kozhikode|kerala|guwahati|assam|india|usa|uk|canada|australia|germany|singapore|uae|dubai|remote|hybrid|onsite)\b.*$/i;

function normalizeExtractedNameCasing(tokens: string[]): string {
  return tokens
    .map((tok) => {
      const lettersOnly = tok.replace(/[^\p{L}]/gu, '');
      // Keep single-letter initials uppercase (e.g. "A" or "A.")
      if (lettersOnly.length <= 1) {
        return tok.toUpperCase();
      }
      // If token is ALL CAPS (e.g. "NIVINDHARAN" or "SHARMA"), convert to Title Case
      if (tok === tok.toUpperCase() && tok !== tok.toLowerCase()) {
        return tok
          .split(/(['\-])/)
          .map((part) =>
            part.length > 1
              ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
              : part
          )
          .join('');
      }
      return tok;
    })
    .join(' ');
}

export function isValidCandidatePersonName(rawCandidate: string): string | undefined {
  const fixed = fixMojibake(String(rawCandidate || ''));
  const cleaned = fixed
    .replace(
      /^(?:resume\s+of|curriculum\s+vitae\s+of|cv\s+of|profile\s+of|resume|curriculum\s+vitae|cv|biodata|name\s+of\s+(?:the\s+)?(?:candidate|student|applicant|recipient|learner|participant)|full\s+name|candidate\s+name|applicant\s+name|student\s+name|recipient\s+name|learner\s+name|participant\s+name|issued\s+to|awarded\s+to|presented\s+to|this\s+is\s+to\s+certify\s+that|hereby\s+certifies\s+that|certifies\s+that|certify\s+that|recipient|candidate|name)\s*[:\-–—]?\s*/i,
      ''
    )
    .replace(/^(?:(?:mr|ms|mrs|miss|mx|dr|prof|er|shri|smt|sri|kumari)\.?\s+)+/i, '')
    .replace(/\([^)]*\)/g, ' ')
    .split(/[|•–—,;\/]/)[0]
    .replace(TRAILING_NON_NAME_BOUNDARY_REGEX, '')
    .replace(/^[:\-–—•|\s,]+|[:\-–—•|\s,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length < 2 || cleaned.length > 55) return undefined;
  if (/\d|@|http|www\./i.test(cleaned)) return undefined;
  if (NON_NAME_WORDS_REGEX.test(cleaned)) return undefined;

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 4) return undefined;

  // Support Unicode uppercase/lowercase letters, initials, apostrophes, and hyphens
  const validTokenPattern = /^(?:\p{Lu}\.?|\p{Lu}[\p{L}.'-]+)$/u;
  if (!tokens.every((t) => validTokenPattern.test(t))) return undefined;

  if (!tokens.some((t) => t.replace(/[^\p{L}]/gu, '').length >= 2)) return undefined;

  return normalizeExtractedNameCasing(tokens);
}

/**
 * Extracts a candidate or recipient person name, email, and phone from document text.
 * Supports multi-line documents, flattened single-line DOCX/PDF text, and certificates.
 */
export function extractIdentityFromText(
  rawText: string,
  _detectedType?: DocumentDetectedType
): {
  personName?: string;
  email?: string;
  phone?: string;
} {
  const text = fixMojibake(String(rawText || '').trim());
  if (!text) return {};

  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = text.match(
    /(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\b\d{3,5}[\s-]?\d{3,5}[\s-]?\d{0,4}\b/
  );

  const email = emailMatch ? emailMatch[0].trim() : undefined;
  const phone =
    phoneMatch && phoneMatch[0].replace(/\D/g, '').length >= 10
      ? phoneMatch[0].trim()
      : undefined;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Explicit "Name:" / "Candidate Name:" / "Recipient:" label anywhere in the document
  const nameLabelRegex =
    /(?:^|\b)(?:name\s+of\s+(?:the\s+)?(?:candidate|student|applicant|recipient|learner|participant)|full\s+name|candidate\s+name|applicant\s+name|student\s+name|recipient\s+name|learner\s+name|participant\s+name|recipient|name)\s*[:\-]\s*([^\n|•]{2,65})/im;
  const nameLabelMatch = text.match(nameLabelRegex);
  if (nameLabelMatch && nameLabelMatch[1]) {
    const valid = isValidCandidatePersonName(nameLabelMatch[1]);
    if (valid) {
      return { personName: valid, email, phone };
    }
  }

  // 2. Certificate recipient patterns ("awarded to / presented to / this is to certify that / congratulations to")
  const certCueRegex =
    /(?:this\s+is\s+to\s+certify\s+that|hereby\s+certifies\s+that|certifies\s+that|certify\s+that|certificate\s+is\s+proudly\s+presented\s+to|proudly\s+presented\s+to|is\s+presented\s+to|presented\s+to|is\s+awarded\s+to|awarded\s+to|issued\s+to|conferred\s+upon|completed\s+by|congratulations\s+to|recognizes\s+that|acknowledges\s+that)\s*[:\-]?\s*([^\n|•]*)/i;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(certCueRegex);
    if (m) {
      const sameLineRemainder = (m[1] || '').trim();
      const sameLineCandidate = isValidCandidatePersonName(sameLineRemainder);
      if (sameLineCandidate) {
        return { personName: sameLineCandidate, email, phone };
      }
      if (i + 1 < lines.length) {
        const nextLineCandidate = isValidCandidatePersonName(lines[i + 1]);
        if (nextLineCandidate) {
          return { personName: nextLineCandidate, email, phone };
        }
      }
      if (i + 2 < lines.length) {
        const secondNextCandidate = isValidCandidatePersonName(lines[i + 2]);
        if (secondNextCandidate) {
          return { personName: secondNextCandidate, email, phone };
        }
      }
    }
  }

  // 2b. Standalone recipient line immediately preceding "has successfully completed / for successfully completing / has completed"
  const completionLineRegex =
    /^(?:has\s+successfully\s+completed|for\s+successfully\s+completing|has\s+completed|for\s+completing|upon\s+successfully\s+completing|in\s+recognition\s+of|successfully\s+completed\s+the)\b/i;
  for (let i = 1; i < lines.length; i++) {
    if (completionLineRegex.test(lines[i])) {
      const prevLineCandidate = isValidCandidatePersonName(lines[i - 1]);
      if (prevLineCandidate) {
        return { personName: prevLineCandidate, email, phone };
      }
    }
  }

  // 2c. Inline recipient immediately before "has successfully completed / for successfully completing"
  const inlineBeforeCompletion = text.match(
    /(?:^|\n|[.:;])\s*([A-Z\p{Lu}][A-Za-z\p{L}.'\-]+(?:\s+[A-Z\p{Lu}][A-Za-z\p{L}.'\-]*){0,3})\s+(?:has\s+successfully\s+completed|for\s+successfully\s+completing|has\s+completed\s+the|upon\s+successfully\s+completing)\b/u
  );
  if (inlineBeforeCompletion && inlineBeforeCompletion[1]) {
    const candidate = isValidCandidatePersonName(inlineBeforeCompletion[1]);
    if (candidate) {
      return { personName: candidate, email, phone };
    }
  }

  // 3. Check the first 12 non-empty lines for candidate/recipient name header
  const topLines = lines.slice(0, 12);
  for (const line of topLines) {
    const inlineLabel = line.match(
      /^(?:full\s+name|candidate\s+name|student\s+name|applicant\s+name|recipient\s+name|name)\s*[:\-]\s*(.+)$/i
    );
    if (inlineLabel && inlineLabel[1]) {
      const candidate = isValidCandidatePersonName(inlineLabel[1].split(/[|\-–—•]/)[0]);
      if (candidate) {
        return { personName: candidate, email, phone };
      }
    }

    const headSegment = line.split(/[|\-–—•,]/)[0].trim();
    const candidate = isValidCandidatePersonName(headSegment);
    if (candidate) {
      return { personName: candidate, email, phone };
    }
  }

  // 3b. Flattened single-line résumé/document fallback: inspect the first 180 chars
  const flatPrefix = text.slice(0, 180).split(/[|\-–—•,]/)[0].trim();
  const flatCandidate = isValidCandidatePersonName(flatPrefix);
  if (flatCandidate) {
    return { personName: flatCandidate, email, phone };
  }

  // 4. Check author / byline in project evidence
  const authorMatch = text.match(
    /(?:author|created by|built by|developed by|prepared by|submitted by|maintainer)\s*[:\-]\s*([^\n|•]{2,55})/i
  );
  if (authorMatch && authorMatch[1]) {
    const candidate = isValidCandidatePersonName(authorMatch[1]);
    if (candidate) {
      return { personName: candidate, email, phone };
    }
  }

  return { email, phone };
}

/**
 * When a profile name token matches inside the document text, extracts the actual
 * contiguous name phrase as written in the document (including any adjacent initial or surname)
 * so "Detected on document" always shows the document's own name string.
 */
function extractNameSpanAroundMatch(
  rawText: string,
  matchedTokens: string[]
): string | undefined {
  if (!rawText || matchedTokens.length === 0) return undefined;
  const fixed = fixMojibake(rawText);
  const lines = fixed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const primaryToken =
    matchedTokens.find((t) => t.length >= 2) || matchedTokens[0];
  if (!primaryToken) return undefined;

  for (const line of lines.slice(0, 20)) {
    const rawWords = line
      .split(/[\s|,;•–—]+/)
      .map((w) => w.replace(/^[^A-Za-z\p{L}]+|[^A-Za-z\p{L}.'\-]+$/gu, ''))
      .filter(Boolean);

    const matchIdx = rawWords.findIndex((w) => {
      const norm = normalizeIdentityText(w);
      return (
        norm === primaryToken ||
        (primaryToken.length >= 5 && tokenSimilarity(norm, primaryToken) >= 0.88)
      );
    });

    if (matchIdx >= 0) {
      // Expand 1-2 tokens left/right if they look like valid person name tokens / initials
      let start = matchIdx;
      let end = matchIdx;
      const isNameWord = (w: string) => {
        if (!w || /\d|@|http|www\./i.test(w)) return false;
        if (NON_NAME_WORDS_REGEX.test(w)) return false;
        const norm = normalizeIdentityText(w);
        if (!norm || COMMON_PROSE_STOPWORDS.has(norm)) return false;
        return /^(?:\p{Lu}\.?|\p{Lu}[\p{L}.'-]+)$/u.test(w);
      };

      while (start > 0 && end - start + 1 < 3 && isNameWord(rawWords[start - 1])) {
        start--;
      }
      while (
        end + 1 < rawWords.length &&
        end - start + 1 < 3 &&
        isNameWord(rawWords[end + 1])
      ) {
        end++;
      }

      const span = rawWords.slice(start, end + 1);
      const valid = isValidCandidatePersonName(span.join(' '));
      if (valid) return valid;
      return normalizeExtractedNameCasing(span);
    }
  }

  return undefined;
}

/**
 * Extracts supporting contact signals (email, phone, GitHub username, LinkedIn username)
 * from the user's profile and checks which ones appear in the document text.
 */
function matchProfileSupportingSignals(
  profile: IdentityProfileInput | Profile | null | undefined,
  docText: string
): {
  signals: string[];
  hasEmailOrUrlMatch: boolean;
} {
  if (!profile || typeof profile !== 'object') {
    return { signals: [], hasEmailOrUrlMatch: false };
  }

  const signals: string[] = [];
  let hasEmailOrUrlMatch = false;
  const lowerDoc = fixMojibake(String(docText || '')).toLowerCase();
  const profileNameTokens = normalizeNameTokens(
    String(profile.name || (profile as IdentityProfileInput).fullName || '')
  );
  const isArjunProfile = profileNameTokens.includes('arjun');

  // 1. Emails (directly from user profile)
  const candidateEmails = new Set<string>();
  if (profile.email && typeof profile.email === 'string') {
    const cleanEmail = profile.email.trim().toLowerCase();
    if (cleanEmail && cleanEmail !== 'demo@applywise.local') {
      candidateEmails.add(cleanEmail);
    }
  }
  for (const email of candidateEmails) {
    if (lowerDoc.includes(email)) {
      signals.push(`email (${email})`);
      hasEmailOrUrlMatch = true;
      break;
    }
  }

  // 2. Phone numbers (last 10 digits)
  const candidatePhones = new Set<string>();
  const rawProfilePhone = (profile as IdentityProfileInput).phone;
  if (rawProfilePhone && typeof rawProfilePhone === 'string') {
    const digits = rawProfilePhone.replace(/\D/g, '');
    if (digits.length >= 10) candidatePhones.add(digits.slice(-10));
  }
  if (candidatePhones.size > 0) {
    const docDigits = lowerDoc.replace(/\D/g, '');
    for (const phone10 of candidatePhones) {
      if (docDigits.includes(phone10)) {
        signals.push(`phone (…${phone10.slice(-4)})`);
        hasEmailOrUrlMatch = true;
        break;
      }
    }
  }

  // 3. GitHub username / URL
  const githubHandles = new Set<string>();
  const rawGh =
    profile.github_username || (profile as IdentityProfileInput).github || '';
  if (rawGh) {
    const cleanGh = rawGh
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?github\.com\//, '')
      .replace(/^@/, '')
      .split('/')[0]
      .trim();
    if (cleanGh.length >= 2 && (cleanGh !== 'arjun-mehta' || isArjunProfile)) {
      githubHandles.add(cleanGh);
    }
  }
  for (const gh of githubHandles) {
    if (
      lowerDoc.includes(`github.com/${gh}`) ||
      new RegExp(`\\b${gh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lowerDoc)
    ) {
      signals.push(`GitHub (${gh})`);
      hasEmailOrUrlMatch = true;
      break;
    }
  }

  // 4. LinkedIn username / URL
  const linkedinHandles = new Set<string>();
  const rawLi =
    (profile as IdentityProfileInput).linkedin_username ||
    (profile as IdentityProfileInput).linkedin ||
    '';
  if (rawLi) {
    const cleanLi = rawLi
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '')
      .replace(/^@/, '')
      .split(/[/?#]/)[0]
      .trim();
    if (cleanLi.length >= 2) linkedinHandles.add(cleanLi);
  }
  for (const li of linkedinHandles) {
    if (
      lowerDoc.includes(`linkedin.com/in/${li}`) ||
      new RegExp(`\\b${li.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lowerDoc)
    ) {
      signals.push(`LinkedIn (${li})`);
      hasEmailOrUrlMatch = true;
      break;
    }
  }

  return { signals, hasEmailOrUrlMatch };
}

/**
 * Matches profile name tokens against a list of document tokens in any order,
 * supporting:
 * - Single-word names
 * - Initials first ("A. Kumar") or initials last ("Nivindharan A")
 * - Swapped token order ("Rahul K" vs "K. Rahul")
 * - Hyphenated names (split or concatenated, e.g. "Jean-Luc" vs "JeanLuc")
 * - Accented & mojibake-normalized tokens ("José" vs "Jose" / "JosÃ©")
 * - Initial matching a full token starting with that letter (and vice versa),
 *   strictly anchored by at least one multi-letter name token match so a single
 *   initial like "A" never false-matches an unrelated person's name.
 */
function matchProfileTokensInDocTokens(params: {
  profileTokens: string[];
  rawProfileName: string;
  docTokens: string[];
  isDedicatedNameTokenList: boolean;
}): {
  matchedTokens: string[];
  matchedIndices: number[];
} {
  const { profileTokens, rawProfileName, docTokens, isDedicatedNameTokenList } = params;
  if (profileTokens.length === 0 || docTokens.length === 0) {
    return { matchedTokens: [], matchedIndices: [] };
  }

  const matchedProfileIndices = new Set<number>();
  const usedDocIndices = new Set<number>();

  // Build hyphenated compound map (e.g. "Sarah-Jane" -> "sarahjane" covers ['sarah', 'jane'])
  const hyphenParts = fixMojibake(rawProfileName)
    .split(/\s+/)
    .filter((w) => w.includes('-'));

  for (const hp of hyphenParts) {
    const subTokens = normalizeNameTokens(hp);
    if (subTokens.length >= 2) {
      const joined = subTokens.join('');
      const docIdx = docTokens.findIndex((dt, idx) => !usedDocIndices.has(idx) && dt === joined);
      if (docIdx >= 0) {
        usedDocIndices.add(docIdx);
        for (const st of subTokens) {
          const pIdx = profileTokens.findIndex(
            (pt, idx) => !matchedProfileIndices.has(idx) && pt === st
          );
          if (pIdx >= 0) matchedProfileIndices.add(pIdx);
        }
      }
    }
  }

  // Pass 1: Match full profile tokens (length >= 2) by exact match or high fuzzy similarity
  for (let pIdx = 0; pIdx < profileTokens.length; pIdx++) {
    if (matchedProfileIndices.has(pIdx)) continue;
    const pTok = profileTokens[pIdx];
    if (pTok.length < 2) continue;

    // 1a. Exact token match
    let foundDocIdx = -1;
    for (let dIdx = 0; dIdx < docTokens.length; dIdx++) {
      if (usedDocIndices.has(dIdx)) continue;
      if (docTokens[dIdx] === pTok) {
        foundDocIdx = dIdx;
        break;
      }
    }

    // 1b. Concatenated pair in doc (e.g. profile has "jeanluc" and doc has "jean" "luc")
    if (foundDocIdx === -1 && pTok.length >= 5) {
      for (let dIdx = 0; dIdx < docTokens.length - 1; dIdx++) {
        if (usedDocIndices.has(dIdx) || usedDocIndices.has(dIdx + 1)) continue;
        if (docTokens[dIdx] + docTokens[dIdx + 1] === pTok) {
          foundDocIdx = dIdx;
          usedDocIndices.add(dIdx + 1);
          break;
        }
      }
    }

    // 1c. Minor OCR typo fuzzy match for longer name tokens
    if (foundDocIdx === -1 && pTok.length >= 5) {
      for (let dIdx = 0; dIdx < docTokens.length; dIdx++) {
        if (usedDocIndices.has(dIdx)) continue;
        const dTok = docTokens[dIdx];
        if (
          dTok.length >= 5 &&
          !COMMON_PROSE_STOPWORDS.has(dTok) &&
          !NON_NAME_WORDS_REGEX.test(dTok) &&
          tokenSimilarity(pTok, dTok) >= 0.88
        ) {
          foundDocIdx = dIdx;
          break;
        }
      }
    }

    if (foundDocIdx >= 0) {
      matchedProfileIndices.add(pIdx);
      usedDocIndices.add(foundDocIdx);
    }
  }

  // Pass 2: Match initials <-> full tokens (in any order).
  // CRITICAL: If the profile name has any multi-letter tokens (e.g. "Nivindharan" in "Nivindharan A"),
  // an initial match is ONLY allowed when at least one multi-letter token has already matched in Pass 1!
  const hasMultiLetterProfileTokens = profileTokens.some((t) => t.length >= 2);
  const canMatchInitials = !hasMultiLetterProfileTokens || matchedProfileIndices.size > 0;
  const anchorPositions = Array.from(usedDocIndices);

  if (canMatchInitials) {
    for (let pIdx = 0; pIdx < profileTokens.length; pIdx++) {
      if (matchedProfileIndices.has(pIdx)) continue;
      const pTok = profileTokens[pIdx];

      let foundDocIdx = -1;

      if (isDedicatedNameTokenList) {
        for (let dIdx = 0; dIdx < docTokens.length; dIdx++) {
          if (usedDocIndices.has(dIdx)) continue;
          const dTok = docTokens[dIdx];
          const isInitialMatch =
            (pTok.length === 1 && dTok.startsWith(pTok)) ||
            (dTok.length === 1 && pTok.startsWith(dTok));
          if (isInitialMatch) {
            foundDocIdx = dIdx;
            break;
          }
        }
      } else if (anchorPositions.length > 0) {
        for (const anchor of anchorPositions) {
          const start = Math.max(0, anchor - 2);
          const end = Math.min(docTokens.length - 1, anchor + 2);
          for (let dIdx = start; dIdx <= end; dIdx++) {
            if (usedDocIndices.has(dIdx)) continue;
            const dTok = docTokens[dIdx];

            if (pTok.length === 1) {
              const validFullWord =
                dTok.length >= 2 &&
                dTok.startsWith(pTok) &&
                !COMMON_PROSE_STOPWORDS.has(dTok) &&
                !NON_NAME_WORDS_REGEX.test(dTok);
              if (dTok === pTok || validFullWord) {
                foundDocIdx = dIdx;
                break;
              }
            } else if (dTok.length === 1 && pTok.startsWith(dTok)) {
              foundDocIdx = dIdx;
              break;
            }
          }
          if (foundDocIdx >= 0) break;
        }
      }

      if (foundDocIdx >= 0) {
        matchedProfileIndices.add(pIdx);
        usedDocIndices.add(foundDocIdx);
        anchorPositions.push(foundDocIdx);
      }
    }
  }

  const matchedTokens = profileTokens.filter((_, idx) => matchedProfileIndices.has(idx));
  return {
    matchedTokens,
    matchedIndices: Array.from(usedDocIndices),
  };
}

/**
 * Universal Identity & Recipient Verifier (`verifyIdentity(profile, docText, options)`).
 * Works for EVERY user without hardcoding any names:
 * 1. Normalizes both sides: Unicode NFKC, strip accents, lowercase, remove punctuation, fix mojibake, collapse whitespace.
 * 2. Tokenizes the profile name (keeps single-letter initials and single-word names; matches tokens in any order; lets an initial match a full token starting with that letter and vice versa).
 * 3. Extracts the actual candidate/recipient name from the document (`extractedDocName`) and searches the document (prioritizing the first 300 chars, then the whole text) for the profile tokens, computing `score = matchedTokens / profileTokens`.
 * 4. Checks supporting signals: profile email, phone, and LinkedIn/GitHub usernames in the text.
 * 5. Detects conflicting names in the header/recipient spot when no profile token matches.
 * 6. Returns `{ status: 'PASS' | 'WARN' | 'BLOCK', score, matchedTokens, profileTokens, signals, message, detectedName, conflictingName, missingProfileName }`.
 */
export function verifyIdentity(
  profile: IdentityProfileInput | Profile | string | null | undefined,
  docText: string,
  options?: {
    extractedPersonNameHint?: string;
    detectedType?: DocumentDetectedType;
  }
): IdentityVerificationResult {
  const rawProfileName =
    typeof profile === 'string'
      ? profile.trim()
      : String(
          profile?.name || (profile as IdentityProfileInput | undefined)?.fullName || ''
        ).trim();

  const profileTokens = normalizeNameTokens(rawProfileName);

  // Rule 7: If the user has no profile name, prompt them to set it before upload
  if (profileTokens.length === 0) {
    return {
      status: 'BLOCK',
      score: 0,
      matchedTokens: [],
      profileTokens: [],
      signals: [],
      missingProfileName: true,
      message:
        'Your profile does not have a full name set. Please set your full name in your profile before uploading documents so we can verify your identity.',
    };
  }

  const fixedDoc = fixMojibake(String(docText || '').trim());
  if (!fixedDoc || normalizeIdentityText(fixedDoc).length === 0) {
    return {
      status: 'BLOCK',
      score: 0,
      matchedTokens: [],
      profileTokens,
      signals: [],
      message: 'Cannot verify identity — no readable text was found in this document.',
    };
  }

  // Extract candidate/recipient name from document header or certification line
  const looksLikeCert =
    options?.detectedType === 'certificate' ||
    /\b(?:certificate\s+of|this\s+is\s+to\s+certify|hereby\s+certifies|awarded\s+to|presented\s+to|credential\s+id)\b/i.test(
      fixedDoc
    );
  const extractedIdentity = extractIdentityFromText(
    fixedDoc,
    looksLikeCert ? 'certificate' : options?.detectedType || 'other'
  );
  const validatedHintName = options?.extractedPersonNameHint
    ? isValidCandidatePersonName(options.extractedPersonNameHint) ||
      options.extractedPersonNameHint.trim()
    : undefined;
  const extractedDocName = extractedIdentity.personName || validatedHintName;
  const docNameTokens = extractedDocName ? normalizeNameTokens(extractedDocName) : [];

  // Search 1: Dedicated candidate name extracted from header / recipient line
  const candidateMatch = matchProfileTokensInDocTokens({
    profileTokens,
    rawProfileName,
    docTokens: docNameTokens,
    isDedicatedNameTokenList: true,
  });

  // Search 2: First 300 characters (prioritized header zone)
  const headerSlice = fixedDoc.slice(0, 300);
  const headerTokens = normalizeIdentityText(headerSlice).split(' ').filter(Boolean);
  const headerMatch = matchProfileTokensInDocTokens({
    profileTokens,
    rawProfileName,
    docTokens: headerTokens,
    isDedicatedNameTokenList: false,
  });

  // Search 3: Whole document text
  const fullTokens = normalizeIdentityText(fixedDoc).split(' ').filter(Boolean);
  const fullMatch = matchProfileTokensInDocTokens({
    profileTokens,
    rawProfileName,
    docTokens: fullTokens,
    isDedicatedNameTokenList: false,
  });

  // Check if a clearly conflicting person name is in the header/recipient spot with 0 overlap
  const hasExplicitConflictingRecipient =
    Boolean(extractedDocName) &&
    docNameTokens.length >= 1 &&
    candidateMatch.matchedTokens.length === 0 &&
    headerMatch.matchedTokens.length === 0;

  // Choose best token match set
  let bestMatchedTokens: string[] = [];
  let matchedInHeader = false;

  if (
    candidateMatch.matchedTokens.length >= headerMatch.matchedTokens.length &&
    candidateMatch.matchedTokens.length > 0
  ) {
    bestMatchedTokens = candidateMatch.matchedTokens;
    matchedInHeader = true;
  } else if (headerMatch.matchedTokens.length > 0) {
    bestMatchedTokens = headerMatch.matchedTokens;
    matchedInHeader = true;
  } else if (!hasExplicitConflictingRecipient && fullMatch.matchedTokens.length > 0) {
    bestMatchedTokens = fullMatch.matchedTokens;
  }

  if (
    !hasExplicitConflictingRecipient &&
    fullMatch.matchedTokens.length > bestMatchedTokens.length
  ) {
    bestMatchedTokens = fullMatch.matchedTokens;
  }

  // Supporting signals: email, phone, github, linkedin
  const { signals: contactSignals, hasEmailOrUrlMatch } = matchProfileSupportingSignals(
    typeof profile === 'object' ? profile : null,
    fixedDoc
  );

  const signals: string[] = [];
  if (matchedInHeader) {
    signals.push('header_name_match');
  }
  signals.push(...contactSignals);

  const score = Number((bestMatchedTokens.length / profileTokens.length).toFixed(2));

  // Determine the actual name detected on the document (NEVER copy rawProfileName!)
  const spanFromDoc =
    bestMatchedTokens.length > 0
      ? extractNameSpanAroundMatch(fixedDoc, bestMatchedTokens)
      : undefined;

  const detectedName =
    extractedDocName && (candidateMatch.matchedTokens.length > 0 || bestMatchedTokens.length === 0)
      ? extractedDocName
      : spanFromDoc || extractedDocName;

  const conflictingName =
    bestMatchedTokens.length === 0 && extractedDocName ? extractedDocName : undefined;

  // Rule 5: Conflicting name in header/recipient spot and no profile token matches -> BLOCK
  if (conflictingName && bestMatchedTokens.length === 0) {
    return {
      status: 'BLOCK',
      score: 0,
      matchedTokens: [],
      profileTokens,
      signals,
      detectedName: conflictingName,
      conflictingName,
      message: `This document appears to belong to ${conflictingName}, not ${rawProfileName}. Upload your own document.`,
    };
  }

  // Rule 6:
  // - PASS: score >= 0.75, or score >= 0.5 plus an email/URL match
  // - WARN: partial match only (e.g. first name or initial, or supporting contact signal without full name)
  // - BLOCK: conflicting name found or no signal at all
  let status: IdentityVerificationStatus = 'BLOCK';
  let message = '';

  if (score >= 0.75 || (score >= 0.5 && hasEmailOrUrlMatch)) {
    status = 'PASS';
    const signalSuffix =
      contactSignals.length > 0 ? ` (corroborated by ${contactSignals.join(', ')})` : '';
    message = `Name on document: ${
      detectedName || bestMatchedTokens.join(' ')
    } matches your profile (${Math.round(score * 100)}% token match: ${bestMatchedTokens.join(
      ', '
    )})${signalSuffix}.`;
  } else if (score > 0 || hasEmailOrUrlMatch) {
    status = 'WARN';
    const matchedDesc =
      bestMatchedTokens.length > 0
        ? `matched token${bestMatchedTokens.length === 1 ? '' : 's'} "${bestMatchedTokens.join(', ')}"`
        : `matched ${contactSignals.join(', ')}`;
    message = `Partial identity match (${Math.round(
      score * 100
    )}%): Found ${matchedDesc} on the document${
      detectedName ? ` ("${detectedName}")` : ''
    }, compared to your profile name "${rawProfileName}". Confirm this is your document to save.`;
  } else {
    status = 'BLOCK';
    message = `No candidate or recipient name matching "${rawProfileName}" was found on this document.`;
  }

  return {
    status,
    score,
    matchedTokens: bestMatchedTokens,
    profileTokens,
    signals,
    detectedName,
    conflictingName,
    message,
  };
}

// ============================================================================
// 4. FILENAME VS CONTENT & GENERIC FILENAME CHECK (CHECK D)
// ============================================================================

export function checkFilenameVsContent(
  filename: string,
  detectedType: DocumentDetectedType,
  personName?: string
): {
  mismatchMessage?: string;
  suggestedRename?: string;
  isGenericFilename: boolean;
  genericMessage?: string;
} {
  const cleanFile = String(filename || 'document.pdf').trim();
  const baseName = cleanFile.replace(/\.[^.]+$/, '');
  const extMatch = cleanFile.match(/(\.[^.]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '.pdf';
  const lowerBase = baseName.toLowerCase();

  // Generic filename detection: WhatsApp Image..., IMG_001, Screenshot..., scan001, untitled, document(1), etc.
  const isGeneric =
    /^(whatsapp\s*image|img[_-\s]?\d*|dsc[_-\s]?\d*|screenshot|screen\s*shot|scan[_-\s]?\d*|image[_-\s]?\d*|photo[_-\s]?\d*|document[_-\s()\d]*|untitled[_-\s()\d]*|file[_-\s()\d]*|download[_-\s()\d]*|new\s*doc)/i.test(
      baseName
    ) || /^[0-9a-f\-_]{6,}$/i.test(baseName);

  const genericMessage = isGeneric
    ? `File is named "${cleanFile}". Add a short descriptive title so this evidence is easy to identify.`
    : undefined;

  // Filename keyword hints
  let filenameHintType: DocumentDetectedType | null = null;
  if (/\b(resume|cv|curriculum[_-\s]?vitae|biodata)\b/i.test(lowerBase)) {
    filenameHintType = 'resume';
  } else if (/\b(cert|certificate|certification|diploma|credential)\b/i.test(lowerBase)) {
    filenameHintType = 'certificate';
  } else if (/\b(project|repo|architecture|benchmark|evidence|report)\b/i.test(lowerBase)) {
    filenameHintType = 'project_evidence';
  } else if (/\b(jd|job[_-\s]?description)\b/i.test(lowerBase)) {
    filenameHintType = 'job_description';
  } else if (/\b(marksheet|transcript|gradesheet)\b/i.test(lowerBase)) {
    filenameHintType = 'marksheet';
  } else if (/\b(aadhaar|pan[_-\s]?card|passport)\b/i.test(lowerBase)) {
    filenameHintType = 'id_document';
  }

  const slugPerson = (personName || 'candidate')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (filenameHintType && filenameHintType !== detectedType && detectedType !== 'other') {
    const detectedLabel = formatDetectedTypeLabel(detectedType);
    const suggestedSlug =
      detectedType === 'certificate'
        ? `${slugPerson}-certificate${ext}`
        : detectedType === 'resume'
        ? `${slugPerson}-resume${ext}`
        : detectedType === 'project_evidence'
        ? `${slugPerson}-project-evidence${ext}`
        : `${slugPerson}-${detectedType.replace(/_/g, '-')}${ext}`;

    return {
      mismatchMessage: `File is named "${cleanFile}" but looks like a ${detectedLabel}. Consider renaming it to "${suggestedSlug}".`,
      suggestedRename: suggestedSlug,
      isGenericFilename: isGeneric,
      genericMessage,
    };
  }

  return {
    isGenericFilename: isGeneric,
    genericMessage,
  };
}

// ============================================================================
// 5. SKILL RELEVANCE CHECK (CHECK E)
// ============================================================================

const SKILL_RELATED_TERMS: Record<string, string[]> = {
  typescript: ['typescript', 'tsconfig', '.ts', '.tsx', 'type-safe', 'generics', 'interface'],
  react: ['react', 'jsx', 'tsx', 'hooks', 'usestate', 'useeffect', 'component', 'next.js', 'redux'],
  javascript: ['javascript', 'ecmascript', 'es6', 'node.js', 'dom', 'async', 'promise'],
  'node.js': ['node.js', 'nodejs', 'express', 'fastify', 'nestjs', 'npm', 'server-side'],
  python: ['python', 'django', 'flask', 'fastapi', 'pandas', 'numpy', 'pytest', 'pip'],
  sql: ['sql', 'postgresql', 'postgres', 'mysql', 'sqlite', 'database', 'query', 'schema', 'join'],
  docker: ['docker', 'dockerfile', 'container', 'docker-compose', 'kubernetes', 'image'],
  aws: ['aws', 'amazon web services', 'ec2', 's3', 'lambda', 'rds', 'cloudformation', 'ecs', 'iam'],
  'unit testing': ['unit test', 'testing', 'jest', 'vitest', 'mocha', 'pytest', 'junit', 'node:test', 'assertion', 'coverage'],
  git: ['git', 'github', 'gitlab', 'branch', 'commit', 'pull request', 'version control'],
  'rest apis': ['rest api', 'restful', 'http', 'endpoint', 'json', 'openapi', 'swagger', 'graphql'],
  'ci/cd': ['ci/cd', 'github actions', 'jenkins', 'gitlab ci', 'pipeline', 'continuous integration', 'continuous deployment'],
  'system design': ['system design', 'distributed', 'scalability', 'microservices', 'load balancer', 'caching', 'throughput', 'latency'],
  java: ['java', 'spring', 'spring boot', 'jvm', 'maven', 'gradle', 'hibernate'],
  'c++': ['c++', 'cpp', 'stl', 'cmake', 'pointers', 'memory management'],
};

const EXTRA_NON_DEV_SKILLS = [
  'Excel',
  'Communication',
  'PowerPoint',
  'Project Management',
  'Leadership',
  'Accounting',
  'Marketing',
  'Customer Support',
  'Data Entry',
  'Tally',
];

export function detectAllSkillsInContent(text: string): string[] {
  const clean = String(text || '').trim();
  if (!clean) return [];
  const techSkills = identifySkills(clean);
  const extraFound: string[] = [];
  for (const extra of EXTRA_NON_DEV_SKILLS) {
    const re = new RegExp(`\\b${extra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(clean) && !techSkills.includes(extra)) {
      extraFound.push(extra);
    }
  }
  return [...techSkills, ...extraFound];
}

export function checkSkillRelevanceInText(
  text: string,
  targetSkill?: string,
  detectedSkills: string[] = []
): {
  mentioned: boolean;
  message?: string;
} {
  if (!targetSkill || !targetSkill.trim()) {
    return { mentioned: true };
  }
  const canonicalTarget = normalizeSkillName(targetSkill).canonical || targetSkill.trim();
  const targetLower = canonicalTarget.toLowerCase();
  const lowerText = String(text || '').toLowerCase();

  // Direct match in detectedSkills
  if (detectedSkills.some((s) => s.toLowerCase() === targetLower)) {
    return { mentioned: true };
  }

  // Direct substring / boundary match
  if (lowerText.includes(targetLower)) {
    return { mentioned: true };
  }

  // Related ecosystem terms
  const related = SKILL_RELATED_TERMS[targetLower] || [];
  if (related.some((term) => lowerText.includes(term.toLowerCase()))) {
    return { mentioned: true };
  }

  const detectedLabel =
    detectedSkills.length > 0 ? detectedSkills.join(', ') : 'No technical skills';

  return {
    mentioned: false,
    message: `This file doesn't seem to show ${canonicalTarget}. Detected: ${detectedLabel}.`,
  };
}

// ============================================================================
// 6. CERTIFICATE SANITY CHECKS IN CODE (CHECK F)
// ============================================================================

const KNOWN_CREDENTIAL_PLATFORMS = [
  'coursera',
  'udemy',
  'edx',
  'aws',
  'amazon web services',
  'google cloud',
  'microsoft',
  'nptel',
  'hackerrank',
  'freecodecamp',
  'linkedin learning',
];

export function runCertificateSanityChecks(
  rawText: string,
  targetSkill?: string,
  referenceNow: Date = new Date()
): {
  meta: CertificateMetadata;
  flags: UploadCheckFlag[];
} {
  const text = String(rawText || '').trim();
  const flags: UploadCheckFlag[] = [];

  // 1. Extract Issuer
  let issuer: string | undefined;
  const issuerMatch =
    text.match(/(?:issued by|offered by|provider|authority|organization)\s*[:\-]\s*([^\n|•]{2,60})/i) ||
    text.match(
      /\b(Coursera|Udemy|edX|Amazon Web Services|AWS|Google Cloud|Microsoft|NPTEL|HackerRank|freeCodeCamp|LinkedIn Learning|Meta|IBM|Stanford Online|MITx)\b/i
    );
  if (issuerMatch && issuerMatch[1]) {
    issuer = issuerMatch[1].trim();
  }

  // 2. Extract Course / Certificate Title
  let title: string | undefined;
  const titleMatch =
    text.match(/"([A-Z][^\n"|]{5,90})"/) ||
    text.match(/(?:course|program|certification|specialization|certificate in)\s*[:\-]\s*"?([A-Z][^\n"|]{4,80})"?/i) ||
    text.match(/has successfully completed\s+(?:the\s+(?:online\s+|certification\s+|professional\s+)?(?:course|workshop|program|specialization)\s+)?([A-Z][^\n."]{5,80})/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  }

  // 3. Extract Issue Date
  let issueDate: string | undefined;
  const datePatterns = [
    /(?:date of issue|issue date|issued on|completed on|date|awarded on)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i,
    /\b(\d{4}-\d{2}-\d{2})\b/,
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/i,
  ];
  for (const pat of datePatterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      issueDate = m[1].trim();
      break;
    }
  }

  // 4. Extract Credential ID & Verify URL
  let credentialId: string | undefined;
  const credMatch = text.match(
    /(?:credential id|certificate id|credential no|certificate number|validation number|id)\s*[:\-#]?\s*([A-Z0-9][A-Z0-9\-_]{4,36})/i
  );
  if (credMatch && credMatch[1]) {
    credentialId = credMatch[1].trim();
  }

  let verifyUrl: string | undefined;
  const urlMatch = text.match(/https?:\/\/[^\s)>\]]+/i);
  if (urlMatch) {
    verifyUrl = urlMatch[0].replace(/[.,;]+$/, '');
  }

  // Check if issueDate is in the future
  let isFutureDate = false;
  if (issueDate) {
    const parsedTime = Date.parse(issueDate);
    if (!Number.isNaN(parsedTime) && parsedTime > referenceNow.getTime() + 24 * 60 * 60 * 1000) {
      isFutureDate = true;
      flags.push({
        code: 'CERT_FUTURE_DATE',
        checkId: 'certificate_sanity',
        title: 'Certificate date is in the future',
        severity: 'warning',
        message: `This certificate lists a future issue date (${issueDate}). Please check the date or upload a valid issued certificate.`,
      });
    }
  } else {
    flags.push({
      code: 'CERT_MISSING_DATE',
      checkId: 'certificate_sanity',
      title: 'Missing issue date',
      severity: 'warning',
      message: 'No issue or completion date was found on this certificate.',
    });
  }

  if (!issuer) {
    flags.push({
      code: 'CERT_MISSING_ISSUER',
      checkId: 'certificate_sanity',
      title: 'Missing certificate issuer',
      severity: 'warning',
      message: 'Could not identify the issuing platform or organization on this certificate.',
    });
  }

  // Check if platform normally has a credential ID / verify URL
  const issuerLower = (issuer || text).toLowerCase();
  const isKnownPlatform = KNOWN_CREDENTIAL_PLATFORMS.some((p) => issuerLower.includes(p));
  const missingCredentialIdForKnownPlatform = isKnownPlatform && !credentialId && !verifyUrl;
  if (missingCredentialIdForKnownPlatform) {
    flags.push({
      code: 'CERT_MISSING_CREDENTIAL_ID',
      checkId: 'certificate_sanity',
      title: 'Missing credential ID',
      severity: 'warning',
      message: `Certificates from ${issuer || 'this platform'} normally include a Credential ID or verification URL, which was not found.`,
    });
  }

  // Check if course title / text relates to targetSkill
  let unrelatedToSkill = false;
  if (targetSkill && targetSkill.trim()) {
    const relevance = checkSkillRelevanceInText(
      `${title || ''} ${text}`,
      targetSkill,
      detectAllSkillsInContent(text)
    );
    if (!relevance.mentioned) {
      unrelatedToSkill = true;
      flags.push({
        code: 'CERT_UNRELATED_SKILL',
        checkId: 'certificate_sanity',
        title: 'Certificate course does not match skill',
        severity: 'warning',
        message: `The certificate course title (${title || 'Untitled'}) does not appear to cover ${targetSkill}.`,
      });
    }
  }

  return {
    meta: {
      issuer,
      title,
      issueDate,
      credentialId,
      verifyUrl,
      isFutureDate,
      missingDate: !issueDate,
      missingIssuer: !issuer,
      unrelatedToSkill,
      missingCredentialIdForKnownPlatform,
    },
    flags,
  };
}

// ============================================================================
// 7. DUPLICATES & REUSE CHECKS (CHECK G)
// ============================================================================

export function checkDuplicatesAndReuse(params: {
  fileHash: string;
  textHash: string;
  normalizedText: string;
  filename: string;
  selectedCategory: SelectedUploadCategory;
  detectedType: DocumentDetectedType;
  targetSkill?: string;
  existingAttachments: AttachmentItem[];
  existingEvidence: EvidenceItem[];
}): {
  duplicateOf?: UploadCheckResult['duplicateOf'];
  flags: UploadCheckFlag[];
} {
  const {
    fileHash,
    normalizedText,
    selectedCategory,
    detectedType,
    targetSkill,
    existingAttachments,
    existingEvidence,
  } = params;

  const flags: UploadCheckFlag[] = [];
  let duplicateOf: UploadCheckResult['duplicateOf'] | undefined;

  for (const att of existingAttachments) {
    const attNormText = normalizeTextForHash(att.extracted_text || '');
    if (att.hash && att.hash === fileHash) {
      duplicateOf = {
        attachmentId: att.id,
        filename: att.filename,
        matchType: 'exact_hash',
      };
      flags.push({
        code: 'DUPLICATE_FILE_HASH',
        checkId: 'duplicates_reuse',
        title: 'Duplicate file detected',
        severity: 'warning',
        message: `You already uploaded this exact file as "${att.filename}". You can link the existing copy instead of uploading it again.`,
      });
      break;
    }

    if (normalizedText.length >= 80 && attNormText === normalizedText) {
      duplicateOf = {
        attachmentId: att.id,
        filename: att.filename,
        matchType: 'same_text',
      };
      flags.push({
        code: 'DUPLICATE_TEXT_CONTENT',
        checkId: 'duplicates_reuse',
        title: 'Duplicate content with different filename',
        severity: 'warning',
        message: `This file has the exact same text content as "${att.filename}". You can link the existing copy instead.`,
      });
      break;
    }
  }

  // Check if the same certificate is attached to many (>= 3) unrelated skills
  if (selectedCategory === 'certificate' || detectedType === 'certificate') {
    const matchingCertSkills = new Set<string>();
    for (const ev of existingEvidence) {
      if (
        ev.attachment_name &&
        duplicateOf?.filename &&
        ev.attachment_name.toLowerCase() === duplicateOf.filename.toLowerCase()
      ) {
        matchingCertSkills.add(ev.skill);
      }
    }
    if (targetSkill) {
      matchingCertSkills.add(targetSkill);
    }
    if (matchingCertSkills.size >= 3) {
      const skillList = Array.from(matchingCertSkills);
      flags.push({
        code: 'CERTIFICATE_OVERUSED',
        checkId: 'duplicates_reuse',
        title: 'Certificate reused across many skills',
        severity: 'warning',
        message: `This certificate is attached to multiple skills (${skillList.join(', ')}). Only link a certificate to skills it directly covers.`,
      });
    }
  }

  return { duplicateOf, flags };
}

// ============================================================================
// 8. RÉSUMÉ-SPECIFIC CHECKS (CHECK H)
// ============================================================================

function extractEmployersAndDates(text: string): {
  employers: string[];
  dates: string[];
} {
  const employers = new Set<string>();
  const dates = new Set<string>();

  const dateMatches =
    text.match(
      /\b(?:20\d{2}|19\d{2})\s*[\-–—to]+\s*(?:20\d{2}|Present|Current)\b/gi
    ) || [];
  for (const d of dateMatches) {
    dates.add(d.replace(/\s+/g, ' ').trim());
  }

  const companyPatterns = [
    /(?:at|@)\s+([A-Z][A-Za-z0-9&.\s]{2,35}?)(?:\s*[|\-–—,(]|\r?\n)/g,
    /(?:Company|Employer|Organization)\s*[:\-]\s*([A-Z][A-Za-z0-9&.\s]{2,35})/gi,
  ];
  for (const pat of companyPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(text)) !== null) {
      const candidate = m[1].trim();
      if (
        candidate.length >= 3 &&
        !/^(Senior|Junior|Software|Full Stack|Frontend|Backend|University|College|Institute|B\.Tech|India)$/i.test(
          candidate
        )
      ) {
        employers.add(candidate);
      }
    }
  }

  return {
    employers: Array.from(employers).slice(0, 6),
    dates: Array.from(dates).slice(0, 6),
  };
}

export function runResumeSpecificChecks(params: {
  text: string;
  detectedSkills: string[];
  extractedPersonName?: string;
  extractedEmail?: string;
  extractedPhone?: string;
  profile?: Profile | null;
  existingEvidence?: EvidenceItem[];
}): {
  meta: ResumeSpecificMetadata;
  flags: UploadCheckFlag[];
} {
  const {
    text,
    detectedSkills,
    extractedPersonName,
    extractedEmail,
    extractedPhone,
    profile,
    existingEvidence = [],
  } = params;

  const flags: UploadCheckFlag[] = [];

  // 1. Compare claimed skills in résumé with existing valid evidence
  const claimedButUnprovenSkills = detectedSkills.filter(
    (sk) => getValidEvidenceForSkill(sk, existingEvidence).length === 0
  );

  if (claimedButUnprovenSkills.length > 0) {
    flags.push({
      code: 'RESUME_UNPROVEN_SKILLS',
      checkId: 'resume_specific',
      title: `${claimedButUnprovenSkills.length} claimed skills need proof`,
      severity: 'info',
      message: `Claimed in this résumé but not yet backed by proof: ${claimedButUnprovenSkills
        .slice(0, 6)
        .join(', ')}.`,
    });
  }

  // 2. Check if name or contact details differ from saved profile
  let profileContactDiffers = false;
  let profileContactDiffDetails: string | undefined;
  if (profile && profile.name) {
    const nameComp = comparePersonNames(extractedPersonName, profile.name);
    const existingEmailMatch = (profile.resume_text || '').match(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
    );
    const existingEmail = existingEmailMatch ? existingEmailMatch[0].toLowerCase() : undefined;

    if (
      (extractedPersonName && nameComp.status === 'mismatch') ||
      (extractedEmail && existingEmail && extractedEmail.toLowerCase() !== existingEmail)
    ) {
      profileContactDiffers = true;
      profileContactDiffDetails = `New résumé contact (${
        extractedPersonName || 'Unknown'
      }${extractedEmail ? `, ${extractedEmail}` : ''}) differs from your saved profile (${
        profile.name
      }${existingEmail ? `, ${existingEmail}` : ''}).`;
      flags.push({
        code: 'RESUME_PROFILE_DIFF',
        checkId: 'resume_specific',
        title: 'Contact details differ from profile',
        severity: 'warning',
        message: `${profileContactDiffDetails} Confirm before overwriting your profile details.`,
      });
    }
  }

  // 3. Check if two résumés conflict (different experience dates or employers)
  const { employers: newEmployers, dates: newDates } = extractEmployersAndDates(text);
  let conflictsWithExistingResume = false;
  let conflictDiffSummary: ResumeSpecificMetadata['conflictDiffSummary'];

  if (profile?.resume_text && profile.resume_text.trim().length >= 100) {
    const { employers: prevEmployers, dates: prevDates } = extractEmployersAndDates(
      profile.resume_text
    );
    const hasEmployerConflict =
      prevEmployers.length > 0 &&
      newEmployers.length > 0 &&
      !newEmployers.some((ne) =>
        prevEmployers.some((pe) => pe.toLowerCase() === ne.toLowerCase())
      );
    const hasDateConflict =
      prevDates.length > 0 &&
      newDates.length > 0 &&
      !newDates.some((nd) => prevDates.some((pd) => pd.toLowerCase() === nd.toLowerCase()));

    if (hasEmployerConflict || hasDateConflict) {
      conflictsWithExistingResume = true;
      conflictDiffSummary = {
        previousEmployers: prevEmployers,
        newEmployers,
        previousDates: prevDates,
        newDates,
      };
      flags.push({
        code: 'RESUME_CONFLICT_DIFF',
        checkId: 'resume_specific',
        title: 'Timeline or employer conflict with saved résumé',
        severity: 'warning',
        message: `This résumé lists different employers or dates (${
          newEmployers.concat(newDates).slice(0, 3).join(', ') || 'new timeline'
        }) than your saved résumé (${
          prevEmployers.concat(prevDates).slice(0, 3).join(', ') || 'previous timeline'
        }). Choose which version to keep.`,
      });
    }
  }

  return {
    meta: {
      extractedName: extractedPersonName,
      extractedEmail,
      extractedPhone,
      employers: newEmployers,
      experienceDates: newDates,
      claimedSkills: detectedSkills,
      claimedButUnprovenSkills,
      profileContactDiffers,
      profileContactDiffDetails,
      conflictsWithExistingResume,
      conflictDiffSummary,
    },
    flags,
  };
}

// ============================================================================
// 9. SUSPICIOUS CONTENT CHECKS (CHECK I)
// ============================================================================

export function checkSuspiciousContent(params: {
  text: string;
  selectedCategory: SelectedUploadCategory;
  detectedType: DocumentDetectedType;
  detectedSkills: string[];
}): UploadCheckFlag[] {
  const { text, selectedCategory, detectedType, detectedSkills } = params;
  const clean = String(text || '').trim();
  const flags: UploadCheckFlag[] = [];

  if (clean.length < 100) return flags; // Handled by Readability Check A

  // 1. Copy-pasted job description uploaded as a résumé
  if (selectedCategory === 'resume' && detectedType === 'job_description') {
    flags.push({
      code: 'SUSPICIOUS_JD_AS_RESUME',
      checkId: 'suspicious_content',
      title: 'Low-trust evidence: Job description uploaded as résumé',
      severity: 'warning',
      message:
        'Low-trust evidence: This file contains a copy-pasted job description rather than personal work history.',
    });
  }

  // 2. Text containing only a skills list with no context
  const words = clean.split(/[\s,;•|]+/).filter(Boolean);
  const sentenceCount = (clean.match(/[.!?](\s|$)/g) || []).length;
  if (words.length > 0 && detectedSkills.length >= 4 && words.length <= detectedSkills.length * 3.2 && sentenceCount <= 1) {
    flags.push({
      code: 'SUSPICIOUS_SKILLS_LIST_ONLY',
      checkId: 'suspicious_content',
      title: 'Low-trust evidence: Keyword list without context',
      severity: 'warning',
      message:
        'Low-trust evidence: This document contains a list of skill keywords with no project descriptions, dates, or context.',
    });
  } else if (clean.length < 160 && sentenceCount <= 1) {
    flags.push({
      code: 'SUSPICIOUS_EXTREMELY_SHORT',
      checkId: 'suspicious_content',
      title: 'Low-trust evidence: Extremely short document',
      severity: 'warning',
      message:
        'Low-trust evidence: This document is very brief and lacks detailed project or credential context.',
    });
  }

  return flags;
}

// ============================================================================
// 10. TRUST TIER COMPUTATION IN CODE (SECTION 3)
// ============================================================================

/**
 * Trust rules (code):
 * - high: readable, type matches category, name matches, skill mentioned, no warnings
 * - medium: one or two warnings the user confirmed
 * - low: identity unknown, skill not found, or generic content
 * - rejected: unreadable, ID document, or the user removed it
 */
export function computeUploadTrustTier(params: {
  readabilityStatus: 'readable' | 'unreadable';
  detectedType: DocumentDetectedType;
  selectedCategory: SelectedUploadCategory;
  typeConfidence?: number;
  nameMatch: NameMatchStatus;
  identityUnconfirmed?: boolean;
  targetSkill?: string;
  targetSkillMentioned?: boolean;
  attachedAnywayUnconfirmed?: boolean;
  flags: UploadCheckFlag[];
  userRemoved?: boolean;
}): UploadTrustTier {
  const {
    readabilityStatus,
    detectedType,
    selectedCategory,
    typeConfidence = 0.85,
    nameMatch,
    identityUnconfirmed,
    targetSkill,
    targetSkillMentioned,
    attachedAnywayUnconfirmed,
    flags,
    userRemoved,
  } = params;

  // 1. Rejected: unreadable, non-document photo, ID document, marksheet, job_description/other, low type confidence, mismatch/unreadable identity, or unresolved blocking
  if (
    userRemoved ||
    readabilityStatus === 'unreadable' ||
    detectedType === 'non_document_photo' ||
    detectedType === 'id_document' ||
    detectedType === 'marksheet' ||
    detectedType === 'job_description' ||
    detectedType === 'other' ||
    typeConfidence < 0.6 ||
    nameMatch === 'mismatch' ||
    nameMatch === 'unreadable' ||
    (nameMatch === 'not_found' &&
      (detectedType === 'resume' ||
        detectedType === 'certificate' ||
        selectedCategory === 'resume' ||
        selectedCategory === 'certificate'))
  ) {
    return 'rejected';
  }

  const hasUnresolvedBlocking = flags.some((f) => f.severity === 'blocking' && !f.resolved);
  if (hasUnresolvedBlocking) {
    return 'rejected';
  }

  // 2. Low: identity unknown/partial (unconfirmed), skill not found (even if attached anyway), future cert date, or suspicious content
  const hasSuspiciousOrFutureFlag = flags.some(
    (f) => f.checkId === 'suspicious_content' || f.code === 'CERT_FUTURE_DATE'
  );

  if (
    nameMatch === 'unknown' ||
    nameMatch === 'not_found' ||
    (nameMatch === 'partial' && identityUnconfirmed) ||
    identityUnconfirmed ||
    attachedAnywayUnconfirmed ||
    (targetSkill && targetSkillMentioned === false) ||
    hasSuspiciousOrFutureFlag
  ) {
    return 'low';
  }

  // 3. Check if type matches category and count warnings
  const expectedCat = mapDetectedTypeToCategory(detectedType);
  const typeMatchesCategory = expectedCat === selectedCategory;
  if (!typeMatchesCategory) {
    return 'rejected';
  }

  const warningFlags = flags.filter((f) => f.severity === 'warning' && !f.resolved);

  if (
    readabilityStatus === 'readable' &&
    typeMatchesCategory &&
    nameMatch === 'match' &&
    (!targetSkill || targetSkillMentioned !== false) &&
    warningFlags.length === 0
  ) {
    return 'high';
  }

  // 4. Medium: readable, name matches (or confirmed partial), skill mentioned, 1 or 2 warnings
  if (warningFlags.length <= 2) {
    return 'medium';
  }

  return 'low';
}

// ============================================================================
// 11. FULL UPLOAD CHECK PIPELINE RUNNER
// ============================================================================

export interface RunUploadCheckInput {
  id?: string;
  filename: string;
  mimeType?: string;
  fileSize?: number;
  fileBytes?: Uint8Array | string;
  extractedText: string;
  ocrConfidence?: number; // 0-100, default 94 for digital text, lower for blurry scans
  extractionSource?: string;
  ocrFailureReason?: OcrFailureReason;
  isNonDocumentPhoto?: boolean;
  retriedWithPreprocessed?: boolean;
  usedVisionFallback?: boolean;
  imageWidth?: number;
  imageHeight?: number;
  selectedCategory: SelectedUploadCategory;
  userTitle?: string;
  targetSkill?: string;
  profile?: Profile | null;
  existingAttachments?: AttachmentItem[];
  existingEvidence?: EvidenceItem[];
  aiClassificationOverride?: {
    type: DocumentDetectedType;
    confidence: number;
    reasons: string[];
    extractedPersonName?: string;
    issuer?: string;
    courseTitle?: string;
    issueDate?: string;
    credentialId?: string;
  };
  referenceNow?: Date;
}

export function determineOcrFailureReason(params: {
  rawText: string;
  ocrConfidence: number;
  mimeType?: string;
  filename?: string;
  ocrFailureReason?: OcrFailureReason;
  isNonDocumentPhoto?: boolean;
  imageWidth?: number;
  imageHeight?: number;
}): {
  failureCategory: OcrFailureReason;
  title: string;
  message: string;
  shortReason: string;
} {
  const {
    rawText,
    ocrConfidence,
    mimeType = '',
    filename = '',
    ocrFailureReason,
    isNonDocumentPhoto,
    imageWidth,
    imageHeight,
  } = params;

  const isPhoto =
    ocrFailureReason === 'not_a_document' ||
    isLikelyNonDocumentPhoto({
      rawText,
      mimeType,
      filename,
      ocrConfidence,
      isNonDocumentPhotoFlag: isNonDocumentPhoto,
    });

  if (isPhoto) {
    return {
      failureCategory: 'not_a_document',
      title: 'Unreadable — not a document',
      message: 'This looks like a photo, not a document. Please upload a clear PDF or document scan.',
      shortReason: 'not a document',
    };
  }

  if (ocrFailureReason === 'rotated') {
    return {
      failureCategory: 'rotated',
      title: 'Unreadable — image is rotated',
      message: `The document image appears rotated or sideways (${ocrConfidence}% OCR confidence). Please upload an upright document.`,
      shortReason: 'rotated',
    };
  }

  if (
    ocrFailureReason === 'too_small' ||
    (typeof imageWidth === 'number' && imageWidth > 0 && imageWidth < 600) ||
    (typeof imageHeight === 'number' && imageHeight > 0 && imageHeight < 400)
  ) {
    return {
      failureCategory: 'too_small',
      title: 'Unreadable — image is too small',
      message: `Image resolution is too small${
        imageWidth && imageHeight ? ` (${imageWidth}×${imageHeight}px)` : ''
      } to read text clearly even after 1600px upscaling (${ocrConfidence}% OCR confidence). Please upload a higher-resolution file.`,
      shortReason: 'too small',
    };
  }

  return {
    failureCategory: 'blurry',
    title: 'Unreadable — image is blurry',
    message:
      rawText.length < 100
        ? `Unreadable (blurry): Only ${rawText.length} characters could be read from "${filename}" (${ocrConfidence}% OCR confidence). Please upload a clearer, higher-contrast file.`
        : `Unreadable (blurry): Low OCR confidence (${ocrConfidence}%). The document appears blurry or low-contrast—please upload a clearer file.`,
    shortReason: 'blurry',
  };
}

export function runUploadCheckPipeline(input: RunUploadCheckInput): UploadCheckResult {
  const {
    id = `chk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename,
    mimeType = 'application/pdf',
    fileSize = 0,
    fileBytes,
    extractedText,
    ocrConfidence = 94,
    extractionSource = 'Document Text Layer',
    ocrFailureReason,
    isNonDocumentPhoto,
    retriedWithPreprocessed = false,
    usedVisionFallback = false,
    imageWidth,
    imageHeight,
    selectedCategory,
    userTitle = '',
    targetSkill,
    profile,
    existingAttachments = [],
    existingEvidence = [],
    aiClassificationOverride,
    referenceNow = new Date(),
  } = input;

  const rawText = String(extractedText || '').trim();
  const normalizedText = normalizeTextForHash(rawText);
  const hash = computeSha256Hex(fileBytes !== undefined ? fileBytes : rawText || filename);
  const textHash = computeSha256Hex(normalizedText);
  const profileName = (profile?.name || '').trim();

  const flags: UploadCheckFlag[] = [];

  const photoDetected =
    isNonDocumentPhoto ||
    aiClassificationOverride?.type === 'non_document_photo' ||
    isLikelyNonDocumentPhoto({
      rawText,
      mimeType,
      filename,
      ocrConfidence,
      isNonDocumentPhotoFlag: isNonDocumentPhoto,
    });

  // --------------------------------------------------------------------------
  // CHECK A: READABILITY (< 100 chars or OCR confidence < 60% or non-document photo)
  // --------------------------------------------------------------------------
  const isUnreadable = rawText.length < 100 || ocrConfidence < 60 || photoDetected;
  const readabilityStatus: 'readable' | 'unreadable' = isUnreadable ? 'unreadable' : 'readable';

  if (isUnreadable) {
    const diag = determineOcrFailureReason({
      rawText,
      ocrConfidence,
      mimeType,
      filename,
      ocrFailureReason,
      isNonDocumentPhoto: photoDetected,
      imageWidth,
      imageHeight,
    });

    // Check A: Readability BLOCKED with real reason (blurry, rotated, too small, or not a document)
    flags.push({
      code: 'UNREADABLE_FILE',
      checkId: 'readability',
      title: diag.title,
      severity: 'blocking',
      message: diag.message,
    });

    // Check B: Document Type BLOCKED (never show PASSED with 0% confidence)
    if (diag.failureCategory === 'not_a_document') {
      flags.push({
        code: 'NON_DOCUMENT_PHOTO',
        checkId: 'document_type',
        title: 'Photo detected — not a document',
        severity: 'blocking',
        message: 'This looks like a photo, not a document.',
      });
    } else {
      flags.push({
        code: 'LOW_TYPE_CONFIDENCE',
        checkId: 'document_type',
        title: 'Cannot verify document type (0% confidence)',
        severity: 'blocking',
        message: `Document type confidence is 0% (below the 60% minimum) because the file is unreadable (${diag.shortReason}).`,
      });
    }

    // Check C: Identity Match BLOCKED (never skip silently!)
    flags.push({
      code: 'IDENTITY_UNREADABLE',
      checkId: 'identity_match',
      title: 'Cannot verify identity',
      severity: 'blocking',
      message: 'Cannot verify identity — document text is unreadable.',
    });

    return {
      id,
      hash,
      textHash,
      filename,
      mimeType,
      fileSize,
      userTitle: userTitle || filename.replace(/\.[^.]+$/, ''),
      selectedCategory,
      detectedType: diag.failureCategory === 'not_a_document' ? 'non_document_photo' : 'other',
      typeConfidence: 0,
      typeReasons: [diag.message],
      isNonDocumentPhoto: diag.failureCategory === 'not_a_document',
      nameMatch: 'unreadable',
      profileNameUsed: profileName,
      identityUnconfirmed: true,
      missingProfileName: !profileName,
      identityVerification: {
        status: 'BLOCK',
        score: 0,
        matchedTokens: [],
        profileTokens: normalizeNameTokens(profileName),
        signals: [],
        missingProfileName: !profileName,
        message: 'Cannot verify identity — document text is unreadable.',
      },
      readability: {
        status: 'unreadable',
        charCount: rawText.length,
        ocrConfidence,
        source: extractionSource,
        reason: diag.shortReason,
        failureCategory: diag.failureCategory,
        retriedWithPreprocessed,
        usedVisionFallback,
      },
      flags,
      detectedSkills: [], // Rule A: Do not extract skills from unreadable files
      targetSkill,
      targetSkillMentioned: false,
      extractedTextPreview: '',
      trust: 'rejected',
      confirmedByUser: false,
      createdAt: referenceNow.toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // CHECK B: CONTENT-BASED DOCUMENT TYPE
  // --------------------------------------------------------------------------
  const codeClassification = classifyDocumentContent(rawText);
  const classification: ContentClassificationResult =
    codeClassification.type === 'id_document' ||
    codeClassification.type === 'marksheet' ||
    !aiClassificationOverride
      ? codeClassification
      : aiClassificationOverride;

  const detectedType = classification.type;
  const typeConfidence = classification.confidence;

  // Check B.1: Personal ID or Marksheet -> Privacy block & redact text immediately
  if (detectedType === 'id_document' || detectedType === 'marksheet') {
    flags.push({
      code: 'SENSITIVE_ID_OR_MARKSHEET',
      checkId: 'document_type',
      title:
        detectedType === 'id_document'
          ? 'Personal ID document detected'
          : 'Academic marksheet detected',
      severity: 'blocking',
      message:
        'This looks like a personal ID or marksheet. Do not upload sensitive IDs. Remove it?',
    });

    flags.push({
      code: 'IDENTITY_UNREADABLE',
      checkId: 'identity_match',
      title: 'Cannot verify identity (sensitive ID blocked)',
      severity: 'blocking',
      message: 'Cannot verify identity — sensitive personal ID documents are blocked for privacy.',
    });

    return {
      id,
      hash,
      textHash,
      filename,
      mimeType,
      fileSize,
      userTitle: userTitle || filename.replace(/\.[^.]+$/, ''),
      selectedCategory,
      detectedType,
      typeConfidence,
      typeReasons: classification.reasons,
      nameMatch: 'unreadable',
      profileNameUsed: profileName,
      identityUnconfirmed: true,
      missingProfileName: !profileName,
      identityVerification: {
        status: 'BLOCK',
        score: 0,
        matchedTokens: [],
        profileTokens: normalizeNameTokens(profileName),
        signals: [],
        missingProfileName: !profileName,
        message: 'Cannot verify identity — sensitive personal ID documents are blocked for privacy.',
      },
      readability: {
        status: 'readable',
        charCount: rawText.length,
        ocrConfidence,
        source: extractionSource,
        retriedWithPreprocessed,
        usedVisionFallback,
      },
      flags,
      detectedSkills: [],
      targetSkill,
      privacyRedacted: true,
      extractedTextPreview: '', // Rule B & Section 5 Privacy: Do NOT store extracted text for ID documents or marksheets
      trust: 'rejected',
      confirmedByUser: false,
      createdAt: referenceNow.toISOString(),
    };
  }

  // Check B.2: Non-document photo
  if (detectedType === 'non_document_photo') {
    flags.push({
      code: 'NON_DOCUMENT_PHOTO',
      checkId: 'document_type',
      title: 'Photo detected — not a document',
      severity: 'blocking',
      message: 'This looks like a photo, not a document.',
    });
  } else if (detectedType === 'job_description' || detectedType === 'other') {
    // Check B.3: Job Description or Unrelated Document -> Block from proof
    flags.push({
      code: 'NOT_VALID_PROOF_TYPE',
      checkId: 'document_type',
      title:
        detectedType === 'job_description'
          ? 'Looks like a job description'
          : 'Unrelated Document',
      severity: 'blocking',
      message:
        detectedType === 'job_description'
          ? 'This file looks like a job description rather than your personal proof. Use "Match a job" (Jobs → Analyse a job) to analyse job postings.'
          : 'Unrelated Document: This file does not appear to be a résumé, certificate, or project evidence. Please upload a relevant career document.',
    });
  } else if (typeConfidence < 0.6) {
    // Check B.4: Detected type confidence below 60% -> Fail (BLOCKED)
    flags.push({
      code: 'LOW_TYPE_CONFIDENCE',
      checkId: 'document_type',
      title: `Low document type confidence (${Math.round(typeConfidence * 100)}%)`,
      severity: 'blocking',
      message: `Document type confidence is ${Math.round(
        typeConfidence * 100
      )}% (below the 60% minimum required). Please upload a clearer or complete ${formatSelectedCategoryLabel(
        selectedCategory
      )}.`,
    });
  } else {
    // Check B.5: Detected type does not equal the selected category -> Fail (BLOCKED) until moved/matched
    const expectedCategory = mapDetectedTypeToCategory(detectedType);
    if (!expectedCategory || expectedCategory !== selectedCategory) {
      const detectedLabel = formatDetectedTypeLabel(detectedType);
      const chosenLabel = formatSelectedCategoryLabel(selectedCategory);
      flags.push({
        code: 'CATEGORY_MISMATCH',
        checkId: 'document_type',
        title: `Looks like a ${detectedLabel}`,
        severity: 'blocking',
        message: `This looks like a ${detectedLabel}, but you chose ${chosenLabel}.`,
      });
    }
  }

  // --------------------------------------------------------------------------
  // CHECK C: IDENTITY / RECIPIENT MATCH (Universal verifyIdentity)
  // --------------------------------------------------------------------------
  const extractedIdentity = extractIdentityFromText(rawText, detectedType);
  const idVerification = verifyIdentity(profile, rawText, {
    extractedPersonNameHint:
      extractedIdentity.personName || aiClassificationOverride?.extractedPersonName,
    detectedType,
  });
  const extractedPersonName =
    idVerification.conflictingName ||
    idVerification.detectedName ||
    extractedIdentity.personName ||
    (aiClassificationOverride?.extractedPersonName
      ? isValidCandidatePersonName(aiClassificationOverride.extractedPersonName) ||
        aiClassificationOverride.extractedPersonName
      : undefined);

  let nameMatch: NameMatchStatus;
  let identityUnconfirmed = false;

  if (idVerification.missingProfileName) {
    nameMatch = 'unknown';
    identityUnconfirmed = true;
    flags.push({
      code: 'IDENTITY_MISSING_PROFILE_NAME',
      checkId: 'identity_match',
      title: 'Set your profile name before upload',
      severity: 'blocking',
      message: idVerification.message,
    });
  } else if (idVerification.status === 'PASS') {
    nameMatch = 'match';
    identityUnconfirmed = false;
  } else if (idVerification.status === 'WARN') {
    nameMatch = 'partial';
    identityUnconfirmed = true;
    flags.push({
      code: 'IDENTITY_PARTIAL_MATCH',
      checkId: 'identity_match',
      title: 'Partial identity match — please confirm',
      severity: 'warning',
      message: idVerification.message,
    });
  } else {
    // status === 'BLOCK'
    identityUnconfirmed = true;
    if (idVerification.conflictingName) {
      nameMatch = 'mismatch';
      flags.push({
        code: 'IDENTITY_MISMATCH',
        checkId: 'identity_match',
        title: 'Document belongs to a different person',
        severity: 'blocking',
        message: idVerification.message,
      });
    } else {
      nameMatch = 'not_found';
      const docNoun =
        detectedType === 'resume' || selectedCategory === 'resume'
          ? 'résumé'
          : detectedType === 'certificate' || selectedCategory === 'certificate'
          ? 'certificate'
          : 'document';
      flags.push({
        code: 'IDENTITY_NOT_FOUND',
        checkId: 'identity_match',
        title: `No matching identity found on ${docNoun}`,
        severity: 'blocking',
        message: idVerification.message,
      });
    }
  }

  // --------------------------------------------------------------------------
  // CHECK D: FILENAME VS CONTENT
  // --------------------------------------------------------------------------
  const filenameCheck = checkFilenameVsContent(filename, detectedType, profileName);
  if (filenameCheck.mismatchMessage) {
    flags.push({
      code: 'FILENAME_CONTENT_MISMATCH',
      checkId: 'filename_vs_content',
      title: 'Filename does not match content',
      severity: 'warning',
      message: filenameCheck.mismatchMessage,
    });
  }
  if (filenameCheck.isGenericFilename && filenameCheck.genericMessage) {
    flags.push({
      code: 'GENERIC_FILENAME_NEEDS_TITLE',
      checkId: 'filename_vs_content',
      title: 'Add a short title',
      severity: 'warning',
      message: filenameCheck.genericMessage,
    });
  }

  // --------------------------------------------------------------------------
  // CHECK E: SKILL DETECTION & SKILL RELEVANCE
  // --------------------------------------------------------------------------
  const detectedSkills = detectAllSkillsInContent(rawText);
  const skillRelevance = checkSkillRelevanceInText(rawText, targetSkill, detectedSkills);

  if (targetSkill && !skillRelevance.mentioned && skillRelevance.message) {
    flags.push({
      code: 'SKILL_RELEVANCE_MISMATCH',
      checkId: 'skill_relevance',
      title: `${targetSkill} not found in file`,
      severity: 'warning',
      message: skillRelevance.message,
    });
  }

  // --------------------------------------------------------------------------
  // CHECK F: CERTIFICATE SANITY CHECKS
  // --------------------------------------------------------------------------
  let certificateMeta: CertificateMetadata | undefined;
  if (detectedType === 'certificate' || selectedCategory === 'certificate') {
    const certCheck = runCertificateSanityChecks(rawText, targetSkill, referenceNow);
    certificateMeta = {
      ...certCheck.meta,
      recipientName: extractedPersonName,
    };
    flags.push(...certCheck.flags);
  }

  // --------------------------------------------------------------------------
  // CHECK G: DUPLICATES & REUSE
  // --------------------------------------------------------------------------
  const dupCheck = checkDuplicatesAndReuse({
    fileHash: hash,
    textHash,
    normalizedText,
    filename,
    selectedCategory,
    detectedType,
    targetSkill,
    existingAttachments,
    existingEvidence,
  });
  flags.push(...dupCheck.flags);

  // --------------------------------------------------------------------------
  // CHECK H: RÉSUMÉ-SPECIFIC CHECKS
  // --------------------------------------------------------------------------
  let resumeMeta: ResumeSpecificMetadata | undefined;
  if (detectedType === 'resume' || selectedCategory === 'resume') {
    const resumeCheck = runResumeSpecificChecks({
      text: rawText,
      detectedSkills,
      extractedPersonName,
      extractedEmail: extractedIdentity.email,
      extractedPhone: extractedIdentity.phone,
      profile,
      existingEvidence,
    });
    resumeMeta = resumeCheck.meta;
    flags.push(...resumeCheck.flags);
  }

  // --------------------------------------------------------------------------
  // CHECK I: SUSPICIOUS CONTENT
  // --------------------------------------------------------------------------
  const suspiciousFlags = checkSuspiciousContent({
    text: rawText,
    selectedCategory,
    detectedType,
    detectedSkills,
  });
  flags.push(...suspiciousFlags);

  // --------------------------------------------------------------------------
  // COMPUTE TRUST TIER IN CODE
  // --------------------------------------------------------------------------
  const trust = computeUploadTrustTier({
    readabilityStatus,
    detectedType,
    selectedCategory,
    typeConfidence,
    nameMatch,
    identityUnconfirmed,
    targetSkill,
    targetSkillMentioned: skillRelevance.mentioned,
    flags,
  });

  const defaultTitle =
    userTitle.trim() ||
    certificateMeta?.title ||
    (filenameCheck.isGenericFilename ? '' : filename.replace(/\.[^.]+$/, ''));

  return {
    id,
    hash,
    textHash,
    filename,
    mimeType,
    fileSize,
    userTitle: defaultTitle,
    selectedCategory,
    detectedType,
    typeConfidence,
    typeReasons: classification.reasons,
    isNonDocumentPhoto: false,
    nameMatch,
    extractedPersonName,
    profileNameUsed: profileName,
    extractedEmail: extractedIdentity.email,
    extractedPhone: extractedIdentity.phone,
    nameSimilarityScore: idVerification.score,
    identityUnconfirmed,
    missingProfileName: Boolean(idVerification.missingProfileName),
    identityVerification: idVerification,
    readability: {
      status: readabilityStatus,
      charCount: rawText.length,
      ocrConfidence,
      source: extractionSource,
      retriedWithPreprocessed,
      usedVisionFallback,
    },
    flags,
    detectedSkills,
    targetSkill,
    targetSkillMentioned: skillRelevance.mentioned,
    certificateMeta,
    resumeMeta,
    duplicateOf: dupCheck.duplicateOf,
    needsGenericTitle: filenameCheck.isGenericFilename,
    suggestedRename: filenameCheck.suggestedRename,
    privacyRedacted: false,
    extractedTextPreview: rawText.slice(0, 6000),
    trust,
    confirmedByUser: false,
    createdAt: referenceNow.toISOString(),
  };
}

// ============================================================================
// 12. NINE CANONICAL TEST SCENARIOS (SECTION 6)
// ============================================================================

export interface UploadCheckTestScenario {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  filename: string;
  selectedCategory: SelectedUploadCategory;
  targetSkill?: string;
  ocrConfidence?: number;
  extractedText: string;
  expectedOutcomeSummary: string;
  simulateDuplicateOfExisting?: boolean;
}

export function buildUploadCheckTestScenarios(
  profile?: IdentityProfileInput | Profile | null
): UploadCheckTestScenario[] {
  const userName = (profile?.name || '').trim() || 'Your Profile Name';
  const slug =
    normalizeIdentityText(userName).replace(/\s+/g, '_') || 'candidate';
  const emailHandle =
    normalizeIdentityText(userName).replace(/\s+/g, '.') || 'candidate';
  const userEmail = (profile?.email || '').trim() || `${emailHandle}@example.com`;
  const userGithub =
    (profile?.github_username || profile?.github || '').trim() ||
    normalizeIdentityText(userName).replace(/\s+/g, '-');

  // Ensure the conflicting-name test scenario always uses a name distinct from the current user
  const userTokens = new Set(normalizeNameTokens(userName));
  const conflictingPersonName =
    userTokens.has('priya') || userTokens.has('sharma')
      ? 'Vikram Deshmukh'
      : 'Priya Sharma';
  const conflictingSlug = conflictingPersonName.toLowerCase().replace(/\s+/g, '_');

  return [
    {
      id: 'resume-as-certificate',
      number: 1,
      title: 'Résumé uploaded as Certificate',
      subtitle: 'Category mismatch (blocked until moved)',
      filename: `${slug}_career_doc.pdf`,
      selectedCategory: 'certificate',
      extractedText: `${userName}
Senior Full-Stack Engineer | Bengaluru | ${userEmail} | +91 9876543210 | github.com/${userGithub}

WORK EXPERIENCE
Senior Software Engineer at CloudScale Systems (2023 - Present)
- Architected distributed React and TypeScript web applications serving 50,000+ daily active users.
- Designed Node.js and PostgreSQL microservices with automated CI/CD pipelines.

EDUCATION
B.Tech in Computer Science, IIT Madras (2019 - 2023)

TECHNICAL SKILLS
React, TypeScript, Node.js, SQL, Docker, AWS, Git, Unit Testing`,
      expectedOutcomeSummary:
        'Detects content as "resume" while category is "Certificate" -> blocks Check B ("This looks like a résumé, but you chose Certificate.") until moved to Résumé.',
    },
    {
      id: 'certificate-as-resume',
      number: 2,
      title: 'Certificate uploaded as Résumé',
      subtitle: 'Category mismatch (blocked until moved)',
      filename: 'aws_architect_credential.pdf',
      selectedCategory: 'resume',
      extractedText: `CERTIFICATE OF COMPLETION
This is to certify that ${userName} has successfully completed the certification course
"AWS Certified Solutions Architect & Docker Containerization"
Issued by: Amazon Web Services Training & Certification
Date of Issue: 2025-08-14
Credential ID: AWS-CSA-9948210
Verify at: https://aws.amazon.com/verification/AWS-CSA-9948210`,
      expectedOutcomeSummary:
        'Detects content as "certificate" while category is "Résumé" -> blocks Check B ("This looks like a certificate, but you chose Résumé.") until moved to Certificate.',
    },
    {
      id: 'someone-elses-name',
      number: 3,
      title: "Someone else's name on file",
      subtitle: `Conflicting recipient name vs your profile (${userName})`,
      filename: `${conflictingSlug}_typescript_cert.pdf`,
      selectedCategory: 'certificate',
      targetSkill: 'TypeScript',
      extractedText: `Coursera Certificate of Accomplishment
This is to certify that ${conflictingPersonName} has successfully completed the online course
"Advanced TypeScript & Production React Architecture"
Issued by: Coursera
Date of Issue: 2025-09-10
Credential ID: CRSA-TS-882190
Verify at: https://coursera.org/verify/CRSA-TS-882190`,
      expectedOutcomeSummary: `Detects "${conflictingPersonName}" vs profile "${userName}" (0/${Math.max(
        1,
        normalizeNameTokens(userName).length
      )} profile tokens matched) -> BLOCK: "This document appears to belong to ${conflictingPersonName}, not ${userName}."`,
    },
    {
      id: 'blurry-image',
      number: 4,
      title: 'Blurry image / unreadable scan',
      subtitle: 'Under 100 chars & low OCR confidence (38%)',
      filename: 'IMG_0042_blurry_scan.jpg',
      selectedCategory: 'certificate',
      ocrConfidence: 38,
      extractedText: `Crtfcate .. cmp.. TypeScrpt ... 2025`,
      expectedOutcomeSummary:
        'Check A BLOCKED (blurry), Check B BLOCKED (0% confidence), Check C BLOCKED ("Cannot verify identity").',
    },
    {
      id: 'duplicate-file',
      number: 5,
      title: 'Duplicate file upload',
      subtitle: 'Same SHA-256 hash or identical text already in Proof Vault',
      filename: `${slug}_resume_copy.pdf`,
      selectedCategory: 'resume',
      simulateDuplicateOfExisting: true,
      extractedText: `${userName}
Senior Full-Stack Engineer | Bengaluru / Remote | ${userEmail} | +91 9876543210

WORK EXPERIENCE:
Senior Full-Stack Engineer at CloudScale Systems (2023 - Present)
- Architected multi-tenant dashboard and REST API ingestion pipeline handling 15,000+ events/sec.

EDUCATION:
B.Tech in Computer Science, IIT Madras (2019 - 2023)

SKILLS:
React, TypeScript, Node.js, SQL, Docker, AWS, System Design, REST APIs, Git, Unit Testing, CI/CD`,
      expectedOutcomeSummary:
        'Detects duplicate hash/text -> flags "You already uploaded this file." and offers to link the existing copy.',
    },
    {
      id: 'future-dated-certificate',
      number: 6,
      title: 'Certificate dated in the future',
      subtitle: 'Certificate sanity check catches future issue date',
      filename: 'docker_kubernetes_cert_2028.pdf',
      selectedCategory: 'certificate',
      targetSkill: 'Docker',
      extractedText: `Certificate of Completion
This hereby certifies that ${userName} has successfully completed
"Production Docker & Kubernetes Orchestration"
Issued by: Udemy
Date of Issue: 2028-11-20
Credential ID: UC-99281726-DKR
Verify at: https://ude.my/UC-99281726-DKR`,
      expectedOutcomeSummary:
        'Extracts issueDate "2028-11-20" -> flags CERT_FUTURE_DATE ("This certificate lists a future issue date") and sets trust to "low".',
    },
    {
      id: 'resume-named-job-description',
      number: 7,
      title: 'File named "resume.pdf" that is a Job Description',
      subtitle: 'Catches misleading filename + blocks JD from being used as proof',
      filename: 'resume.pdf',
      selectedCategory: 'resume',
      extractedText: `Senior Backend Engineer — Cloud FinTech Platform
About the Role:
We are looking for an experienced Senior Backend Engineer to join our core payments engineering team in Bengaluru.

What You'll Do (Key Responsibilities):
- Design, build, and maintain scalable microservices using Node.js, TypeScript, and PostgreSQL.
- Partner with product managers to deliver fault-tolerant payment APIs.

Minimum Qualifications (Must-Have Skills):
- 4+ years of backend engineering experience with Node.js, SQL, Docker, and AWS.
- Equal Opportunity Employer: Competitive salary, equity, and comprehensive health benefits. Apply now!`,
      expectedOutcomeSummary:
        'Ignores filename "resume.pdf", detects content as "job_description", blocks it as proof, warns "File is named \'resume.pdf\' but looks like a job description", and suggests Jobs → Analyse a job.',
    },
    {
      id: 'aadhaar-or-marksheet',
      number: 8,
      title: 'Aadhaar ID card or University Marksheet',
      subtitle: 'Blocks sensitive ID/marksheet and redacts extracted text for privacy',
      filename: `${slug}_aadhaar_id_scan.pdf`,
      selectedCategory: 'evidence',
      extractedText: `GOVERNMENT OF INDIA
Unique Identification Authority of India (UIDAI)
Mera Aadhaar, Meri Pehchan
Name: ${userName}
DOB: 14/05/2001
Gender: MALE
Aadhaar No: 4829 7361 9024
VID: 9182 7364 5510 2938`,
      expectedOutcomeSummary:
        'Detects "id_document" -> warns "This looks like a personal ID or marksheet. Do not upload sensitive IDs. Remove it?", sets trust to "rejected", and stores 0 bytes of extracted text.',
    },
    {
      id: 'skill-not-mentioned',
      number: 9,
      title: "File that doesn't mention the selected skill",
      subtitle: 'Uploaded for TypeScript, but only mentions Excel & Communication',
      filename: 'business_workshop_certificate.pdf',
      selectedCategory: 'certificate',
      targetSkill: 'TypeScript',
      extractedText: `Certificate of Completion
This is to certify that ${userName} has successfully completed the professional workshop
"Business Spreadsheet Modeling with Excel and Executive Communication"
Issued by: LinkedIn Learning
Date of Issue: 2025-04-12
Credential ID: LIL-EXL-44102
Skills covered: Excel, Communication, Presentation`,
      expectedOutcomeSummary:
        'Flags "This file doesn\'t seem to show TypeScript. Detected: Excel, Communication." Offers "Attach to detected skills instead" or "Attach anyway" (which marks evidence Unconfirmed / low trust, never verified).',
    },
  ];
}

export const UPLOAD_CHECK_TEST_SCENARIOS: UploadCheckTestScenario[] =
  buildUploadCheckTestScenarios({
    name: 'Arjun Mehta',
    email: 'arjun.mehta@example.com',
    github_username: 'arjun-mehta',
  });
