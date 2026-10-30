export type SkillStatus = 'verified' | 'declared' | 'missing';

export type EvidenceType = 'github' | 'certificate' | 'file' | 'link';

export type EvidenceValidationStatus = 'pending' | 'valid' | 'rejected';

export interface GitHubRepoReviewAdvice {
  summary: string;
  strengths: string[];
  gaps: string[];
  credibleSkills: string[];
  suggestedFixes: string[];
  reviewedAt?: string;
}

export type GitHubAIReviewResult = GitHubRepoReviewAdvice;

export interface GitHubRepoEvidenceDetails {
  owner?: string;
  repo?: string;
  username?: string;
  description?: string;
  stars?: number;
  isFork?: boolean;
  isPrivate?: boolean;
  pushedAt?: string;
  defaultBranch?: string;
  languages?: Record<string, number>;
  userCommitCount?: number;
  allCommitsSingleDay?: boolean;
  singleDayCommitWarning?: string | boolean;
  detectedSkills?: Array<{ skill: string; signal: string }>;
  weakEvidenceWarning?: string;
  aiReview?: GitHubRepoReviewAdvice;
  hasReadme?: boolean;
  sampleFiles?: string[];
  readmeExcerpt?: string;
  treeHighlights?: string[];
  [key: string]: unknown;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'Student' | 'Job seeker' | string;
}

export interface Profile {
  id?: number;
  user_id?: number;
  name: string;
  title: string;
  role: string;
  location: string;
  education: string;
  skills_text: string;
  resume_text: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  linkedin_username?: string;
  github?: string;
  github_username?: string;
  onboarded?: number;
}

export type DocumentDetectedType =
  | 'resume'
  | 'certificate'
  | 'project_evidence'
  | 'marksheet'
  | 'id_document'
  | 'job_description'
  | 'non_document_photo'
  | 'other';

export type SelectedUploadCategory = 'resume' | 'certificate' | 'evidence';

export type UploadTrustTier = 'high' | 'medium' | 'low' | 'rejected';

export type NameMatchStatus = 'match' | 'partial' | 'mismatch' | 'not_found' | 'unreadable' | 'unknown';

export type IdentityVerificationStatus = 'PASS' | 'WARN' | 'BLOCK';

export interface IdentityProfileInput {
  name?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  linkedin_username?: string;
  github?: string;
  github_username?: string;
  resume_text?: string;
}

export interface IdentityVerificationResult {
  status: IdentityVerificationStatus;
  score: number;
  matchedTokens: string[];
  profileTokens: string[];
  signals: string[];
  message: string;
  detectedName?: string;
  conflictingName?: string;
  missingProfileName?: boolean;
}

export type OcrFailureReason = 'blurry' | 'rotated' | 'too_small' | 'not_a_document';

export interface UploadCheckFlag {
  code: string;
  checkId:
    | 'readability'
    | 'document_type'
    | 'identity_match'
    | 'filename_vs_content'
    | 'skill_relevance'
    | 'certificate_sanity'
    | 'duplicates_reuse'
    | 'resume_specific'
    | 'suspicious_content';
  title?: string;
  severity: 'info' | 'warning' | 'blocking';
  message: string;
  resolved?: boolean;
  resolutionAction?: string;
  resolutionNote?: string;
}

export interface CertificateMetadata {
  issuer?: string;
  title?: string;
  issueDate?: string;
  credentialId?: string;
  verifyUrl?: string;
  recipientName?: string;
  isFutureDate?: boolean;
  missingDate?: boolean;
  missingIssuer?: boolean;
  unrelatedToSkill?: boolean;
  missingCredentialIdForKnownPlatform?: boolean;
  issuerVerifiedByUser?: boolean;
}

export interface ResumeSpecificMetadata {
  extractedName?: string;
  extractedEmail?: string;
  extractedPhone?: string;
  employers?: string[];
  experienceDates?: string[];
  claimedSkills: string[];
  claimedButUnprovenSkills: string[];
  profileContactDiffers?: boolean;
  profileContactDiffDetails?: string;
  conflictsWithExistingResume?: boolean;
  conflictDiffSummary?: {
    previousEmployers: string[];
    newEmployers: string[];
    previousDates: string[];
    newDates: string[];
  };
}

export interface UploadCheckResult {
  id: string;
  hash: string;
  textHash?: string;
  filename: string;
  mimeType?: string;
  fileSize?: number;
  userTitle: string;
  selectedCategory: SelectedUploadCategory;
  detectedType: DocumentDetectedType;
  typeConfidence: number;
  typeReasons: string[];
  nameMatch: NameMatchStatus;
  extractedPersonName?: string;
  profileNameUsed?: string;
  extractedEmail?: string;
  extractedPhone?: string;
  nameSimilarityScore?: number;
  identityVerification?: IdentityVerificationResult;
  missingProfileName?: boolean;
  identityUnconfirmed?: boolean;
  isNonDocumentPhoto?: boolean;
  readability: {
    status: 'readable' | 'unreadable';
    charCount: number;
    ocrConfidence: number;
    source: string;
    reason?: string;
    failureCategory?: OcrFailureReason;
    retriedWithPreprocessed?: boolean;
    usedVisionFallback?: boolean;
  };
  flags: UploadCheckFlag[];
  detectedSkills: string[];
  targetSkill?: string;
  targetSkillMentioned?: boolean;
  attachedAnywayUnconfirmed?: boolean;
  certificateMeta?: CertificateMetadata;
  resumeMeta?: ResumeSpecificMetadata;
  duplicateOf?: {
    attachmentId?: number;
    filename: string;
    matchType: 'exact_hash' | 'same_text' | 'overused_certificate';
    existingSkills?: string[];
  };
  needsGenericTitle?: boolean;
  suggestedRename?: string;
  privacyRedacted?: boolean;
  extractedTextPreview: string;
  trust: UploadTrustTier;
  confirmedByUser: boolean;
  createdAt: string;
}

export interface AttachmentItem {
  [key: string]: any;
  id: number;
  user_id?: number;
  filename: string;
  mime_type: string;
  category: string;
  extracted_text: string;
  file_size: number;
  created_at: string;
  hash?: string;
  user_title?: string;
  selected_category?: string;
  detected_type?: DocumentDetectedType;
  type_confidence?: number;
  name_match?: 'match' | 'mismatch' | 'unknown';
  readability_json?: string;
  flags_json?: string;
  detected_skills_json?: string;
  detectedSkills?: string[];
  flags?: UploadCheckFlag[];
  trust?: UploadTrustTier;
  confirmed_by_user?: number | boolean;
  upload_check?: UploadCheckResult;
}

export interface EvidenceDetailsObject extends GitHubRepoEvidenceDetails {
  trust?: UploadTrustTier;
  unconfirmedEvidence?: boolean;
  identityUnconfirmed?: boolean;
  uploadCheckId?: string;
  verifyUrl?: string;
  [key: string]: any;
}

export interface EvidenceItem {
  [key: string]: any;
  id?: number | string;
  user_id?: number;
  skillId?: string;
  skill: string;
  type: EvidenceType | string;
  title: string;
  url?: string;
  status?: EvidenceValidationStatus;
  reason?: string;
  addedAt?: string;
  details?: EvidenceDetailsObject;
  attachment_name?: string;
  extracted_summary?: string;
}

export interface ResumeStudioBullet {
  skillId: string;
  evidenceId: string | number;
  text: string;
  evidenceTitle?: string;
  evidenceType?: string;
  evidenceUrl?: string;
}

export interface ResumeStudioOutput {
  bullets: ResumeStudioBullet[];
  skillsLine: string;
  coverLetter: string;
  validationPassed?: boolean;
  validationErrors?: string[];
  regeneratedOnce?: boolean;
  usedFallback?: boolean;
  provider?: string;
  model?: string;
}

export interface JdExtractedMustHave {
  skill: string;
  importance: 'core' | 'important';
  quote: string;
}

export interface JdExtractedNiceToHave {
  skill: string;
  quote: string;
}

export interface JdExtractionOutput {
  roleTitle: string;
  company?: string;
  seniority: string;
  mustHave: JdExtractedMustHave[];
  niceToHave: JdExtractedNiceToHave[];
  responsibilities: string[];
  softSkills: string[];
  experienceRequired: string;
  redFlags: string[];
}

export interface JdEvaluatedSkillItem {
  rawSkill: string;
  skill: string;
  isKnown: boolean;
  importance: 'core' | 'important' | 'nice-to-have';
  weight: 3 | 2 | 1;
  status: SkillStatus;
  points: 1.0 | 0.4 | 0;
  weightedPoints: number;
  potentialPointGain: number;
  quote: string;
  evidenceItems: EvidenceItem[];
  estimatedEffort?: 'low' | 'medium' | 'high';
  effortReason?: string;
}

export interface JdGapAnalysisResult {
  roleTitle: string;
  company: string;
  seniority: string;
  score: number;
  totalWeightedPoints: number;
  totalPossibleWeight: number;
  confidence: 'High' | 'Low';
  confidenceReason: string;
  verdictOneLiner: string;
  verdict?: string;
  aiSummary?: string;
  strategyLabel?: string;
  applicationStrategy?: 'apply now' | 'apply after proving X and Y' | 'build skills first';
  nonTechNotice?: string;
  youCanProve: JdEvaluatedSkillItem[];
  needsProof: JdEvaluatedSkillItem[];
  gaps: JdEvaluatedSkillItem[];
  niceToHaves: JdEvaluatedSkillItem[];
  allEvaluatedSkills: JdEvaluatedSkillItem[];
  whatToDoFirst: JdEvaluatedSkillItem[];
  responsibilities: string[];
  softSkills: string[];
  experienceRequired: string;
  redFlags: string[];
  aiExplanation?: {
    summary: string;
    strategy: 'apply now' | 'apply after proving X and Y' | 'build skills first';
    strategyLabel: string;
    effortBySkill: Record<string, { effort: 'low' | 'medium' | 'high'; reason: string }>;
  };
}

export interface MatchedSkill {
  skill: string;
  importance: 'high' | 'medium' | 'low';
  evidenceFound: Array<{
    type: string;
    title: string;
    strength: 'strong' | 'moderate' | 'weak';
  }>;
}

export interface MissingSkill {
  skill: string;
  importance: 'high' | 'medium' | 'low';
  reason: string;
  recommendedProof: string;
}

export interface UnprovenSkill {
  skill: string;
  reason: string;
  howToStrengthenEvidence: string;
}

export interface LearningLink {
  platform: 'YouTube' | 'Udemy' | 'Coursera';
  title: string;
  url: string;
  duration?: string;
}

export interface SprintTask {
  day: number;
  phase?: string;
  focusSkill?: string;
  skill?: string;
  focus?: string;
  task: string;
  action?: string;
  expectedProof: string;
  deliverable?: string;
  proofType?: string;
  resources?: LearningLink[];
  learningLinks?: LearningLink[];
}

export interface AnalysisData {
  id?: number;
  jobTitle?: string;
  company?: string;
  job_description?: string;
  created_at?: string;
  readinessScore: number;
  scoreBreakdown?: {
    skillMatch: number;
    evidenceStrength: number;
    experienceRelevance: number;
  };
  summary?: string;
  matchedSkills?: MatchedSkill[];
  missingSkills?: MissingSkill[];
  unprovenSkills?: UnprovenSkill[];
  verifiedSkills?: any[];
  resumeImprovements?: any[];
  gapAnalysis?: any;
  sevenDayPlan?: SprintTask[];
  resumeSuggestions?: string[];
  tailoredResumeBullets?: string[];
  coverLetter?: string;
  interviewQuestions?: string[];
  nextSteps?: string[];
  jdGapResult?: JdGapAnalysisResult;
  aiProvider?: string;
  aiModel?: string;
  aiLatencyMs?: number;
  isFallback?: boolean;
  [key: string]: unknown;
}

export interface ModelRegistryEntry {
  id: string;
  label: string;
  shortLabel: string;
  provider: 'nvidia' | 'nebius' | 'gemini';
  providerName: string;
  speedTier: 'fast' | 'deep';
}

export interface InferenceCallRecord {
  id: string;
  timestamp: string;
  endpoint: string;
  provider: string;
  model: string;
  latencyMs: number;
  status: 'live' | 'fallback';
  note?: string;
}

export interface AIProviderStatus {
  nvidiaConfigured: boolean;
  nebiusConfigured: boolean;
  geminiConfigured: boolean;
  anyKeyConfigured: boolean;
  activeProvider: string;
  activeModel: string;
  primaryModel: string;
  fallbackModel: string;
  lastLatencyMs: number | null;
  models: ModelRegistryEntry[];
  recentCalls: InferenceCallRecord[];
  hackathonTrack: string;
}

export interface ProofTaskBrief {
  skill: string;
  targetRole: string;
  title: string;
  estimatedTime: string;
  goal: string;
  steps: string[];
  acceptanceChecklist: string[];
  recommendedProofToLink: string;
  provider: string;
  model: string;
  latencyMs: number;
  isFallback: boolean;
}

export interface InterviewQuestionItem {
  question: string;
  whyAsked: string;
  modelAnswerHint: string;
  targetSkill: string;
}

export interface RewrittenBulletItem {
  originalConcept: string;
  rewrittenBullet: string;
  placeholdersToFill: string[];
}

export interface SalaryBenchmarkData {
  targetRole: string;
  disclaimer: string;
  indiaRanges: Array<{
    level: string;
    rangeInr: string;
    notes: string;
  }>;
  globalRemoteRanges: Array<{
    level: string;
    rangeUsd: string;
    notes: string;
  }>;
  govComparison: {
    cadre: string;
    payLevel: string;
    allowancesNote: string;
  };
}

export interface CareerCoachResponse {
  tab: 'interview' | 'bullets' | 'salary';
  interviewQuestions?: InterviewQuestionItem[];
  rewrittenBullets?: RewrittenBulletItem[];
  salaryBenchmark?: SalaryBenchmarkData;
  provider: string;
  model: string;
  latencyMs: number;
  isFallback: boolean;
}

export interface DemoProfilePreset {
  id: string;
  label: string;
  badge: string;
  name: string;
  title: string;
  role: string;
  location: string;
  education: string;
  skills_text: string;
  resume_text: string;
  targetJobTitle: string;
  targetCompany: string;
  targetJobDescription: string;
  evidence: Array<{
    skill: string;
    type: string;
    title: string;
    url: string;
    extracted_summary?: string;
  }>;
}

export interface JobCard {
  id: string;
  title: string;
  company: string;
  location: string;
  created: string;
  url: string;
  description: string;
  skills: string[];
  featured?: boolean;
  badge?: string;
  source?: string;
  sector?: 'Enterprise & Private' | 'Government & PSU';
  examCode?: string;
  payScale?: string;
  eligibility?: string;
  selectionStages?: string[];
}

export interface JobTrend {
  skill: string;
  count: number;
  share: number;
}

export interface JobResponse {
  source: string;
  provider: string;
  attributionUrl?: string;
  updatedAt: string;
  jobs: JobCard[];
  trends: JobTrend[];
}

export interface ApplicationItem {
  id: number;
  company: string;
  job_title: string;
  job_description?: string;
  status: 'Saved' | 'Preparing' | 'Applied' | 'Interview' | 'Offer' | 'Rejected';
  application_date?: string;
  follow_up_date?: string;
  notes?: string;
  analysis_id?: number | null;
  created_at?: string;
}

export interface ProofAuditResult {
  skill: string;
  targetRole: string;
  credibilityScore: number;
  strengthTier: 'strong' | 'moderate' | 'weak';
  verdictSummary: string;
  detectedSignals: string[];
  missingElements: string[];
  suggestedBullet: string;
  provider: string;
  model: string;
  latencyMs: number;
  isFallback: boolean;
}

export interface AnswerEvaluationResult {
  question: string;
  targetSkill: string;
  scoreOutOf10: number;
  verdict: string;
  strengths: string[];
  missingProofAngle: string;
  improvedStarAnswer: string;
  provider: string;
  model: string;
  latencyMs: number;
  isFallback: boolean;
}

export interface AICopilotResponse {
  reply: string;
  actionItems: string[];
  recommendedSkillToProve?: string;
  suggestedPage?: 'skills' | 'roadmap' | 'offers' | 'attachments' | 'resume' | 'applications';
  provider: string;
  model: string;
  latencyMs: number;
  isFallback: boolean;
}

export type CopilotModelTier = 'fast' | 'ultra';

export type CopilotStructuredTask =
  | 'chip_fastest_skills'
  | 'chip_weekend_project'
  | 'chip_compare_roles'
  | 'chip_honest_resume'
  | 'honest_rewrite'
  | 'why_this_score'
  | 'close_the_gap';

export interface ProofVaultSkillEntry {
  skill: string;
  status: 'verified' | 'self-declared' | 'needs proof' | 'missing';
  importance: 'high' | 'medium';
  proofs: Array<{
    id?: string | number;
    type: string;
    title: string;
    url?: string;
    trust?: string;
  }>;
}

export interface ProofVaultContext {
  role: 'student' | 'job seeker';
  candidateName: string;
  targetRole: string;
  targetCompany: string;
  readinessScore: number;
  skills: ProofVaultSkillEntry[];
  proofItems: Array<{
    id?: string | number;
    skill?: string;
    type: string;
    title: string;
    url?: string;
    status?: string;
  }>;
  summaryCounts: {
    verified: number;
    selfDeclared: number;
    missing: number;
    totalProofs: number;
  };
}

export interface FastestSkillCardItem {
  skill: string;
  currentStatus: 'self-declared' | 'needs proof' | 'missing';
  why: string;
  estimatedScoreGain: number;
  projectedScore: number;
  fastestProofToAdd: string;
  suggestedDeliverable: string;
  estimatedTime: string;
}

export interface WeekendProjectHourBlock {
  hour: string;
  title: string;
  tasks: string[];
  output: string;
}

export interface WeekendProjectPlanData {
  projectTitle: string;
  targetSkills: string[];
  overview: string;
  hourByHourPlan: WeekendProjectHourBlock[];
  deliverables: string[];
  exactProofArtifact: {
    type: 'GitHub Repository' | 'Deployed URL + Repo' | 'Architecture Spec + Tests';
    suggestedRepoName: string;
    mustIncludeFiles: string[];
    howToVerifyInApplyWise: string;
  };
}

export interface RoleComparisonSide {
  roleName: string;
  trackType: 'Enterprise Product' | 'UPSC / NIC Scientist-B';
  readinessScore: number;
  verifiedMatches: string[];
  keyGaps: string[];
  selectionFocus: string;
  concreteNextStep: string;
}

export interface RoleComparisonTableData {
  enterpriseRole: RoleComparisonSide;
  governmentRole: RoleComparisonSide;
  comparisonVerdict: string;
  fastestPathRecommendation: string;
}

export interface HonestResumePhraseItem {
  skill: string;
  status: 'self-declared' | 'verified';
  honestBullet: string;
  skillsLineWording: string;
  whyHonest: string;
  avoidOverclaiming: string;
}

export interface HonestRewriteResult {
  originalBullet: string;
  rewrittenBullet: string;
  skill?: string;
  claimRisk: 'low' | 'medium' | 'high';
  claimRiskReason: string;
  removedUnverifiableClaims: string[];
  groundedProofUsed: string | null;
}

export interface WhyThisScoreResult {
  roleTitle: string;
  company: string;
  score: number;
  explanationSummary: string;
  topMatchingSkills: Array<{
    skill: string;
    status: 'verified' | 'self-declared';
    evidenceUsed: string;
    scoreContribution: string;
  }>;
  topMissingSkills: Array<{
    skill: string;
    gapType: 'missing' | 'needs proof';
    whyCritical: string;
    proofTask: string;
    estimatedScoreGain: number;
  }>;
}

export interface CloseTheGapDayItem {
  day: number;
  skill: string;
  title: string;
  task: string;
  proofArtifact: string;
  estimatedMinutes: number;
}

export interface CloseTheGapResult {
  targetRole: string;
  currentScore: number;
  projectedScore: number;
  summary: string;
  days: CloseTheGapDayItem[];
  savedToAccount: boolean;
}

export interface CopilotStructuredResponse<T = any> {
  task: CopilotStructuredTask;
  data: T;
  groundedInProofVault: boolean;
  modelTier: CopilotModelTier;
  modelTierLabel: 'Fast' | 'Deep reasoning';
  modelId: string;
  provider: string;
  latencyMs: number;
  isFallback: boolean;
  proofVaultSummary: {
    role: 'student' | 'job seeker';
    targetRole: string;
    readinessScore: number;
    verifiedCount: number;
    selfDeclaredCount: number;
    missingCount: number;
  };
}

export interface CopilotVaultItem {
  skill: string;
  status?: 'verified' | 'self-declared' | 'missing';
  proofTitle?: string;
  proofType?: string;
  proofUrl?: string;
}

export interface CopilotVaultPayload {
  readinessScore: number;
  verified: CopilotVaultItem[];
  selfDeclared: CopilotVaultItem[];
  missing: CopilotVaultItem[];
}

export interface CopilotChatTurnInput {
  role: 'user' | 'assistant';
  content: string;
}

export interface CopilotChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  text?: string;
  createdAt: string;
  isStreaming?: boolean;
  modelTier?: CopilotModelTier;
  modelTierLabel?: 'Fast' | 'Deep reasoning';
  modelId?: string;
  latencyMs?: number;
  groundedInProofVault?: boolean;
  webSearched?: boolean;
  sources?: Array<{ title: string; url: string }>;
}

export interface CopilotApiResponse {
  answer: string;
  modelTier: CopilotModelTier;
  modelTierLabel: 'Fast' | 'Deep reasoning';
  modelId: string;
  provider: string;
  latencyMs: number;
  groundedInProofVault: boolean;
  isFallback?: boolean;
  vault: CopilotVaultPayload;
}


