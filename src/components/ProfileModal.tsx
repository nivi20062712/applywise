import React, { useState, useEffect, useRef } from 'react';
import { Profile, AttachmentItem, User } from '../types';
import { fetchApi, uploadResumeOrProofFile } from '../api';
import { COMMON_SKILL_TERMS } from '../utils/skillMatcher';
import {
  X,
  UserCircle,
  Save,
  Check,
  UploadCloud,
  Paperclip,
  Trash2,
  Loader2,
  FileText,
} from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  profile: Profile | null;
  attachments: AttachmentItem[];
  onProfileUpdated: () => void;
  isInitialOnboarding?: boolean;
}

const PRESET_TARGET_ROLES = [
  'Software Engineer',
  'Full Stack Developer',
  'Frontend React & TypeScript Engineer',
  'Backend Java & Spring Boot Engineer',
  'Cloud & DevOps Engineer',
  'Data Engineer & SQL Architect',
  'AI & Machine Learning Engineer',
  'Cybersecurity & SecOps Analyst',
  'QA Automation & SDET Engineer',
  'Site Reliability Engineer (SRE)',
];

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  profile,
  attachments,
  onProfileUpdated,
  isInitialOnboarding = false,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    role: 'Student',
    location: '',
    education: '',
    github_username: '',
    skills_text: '',
    resume_text: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [error, setError] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && (profile || user)) {
      setFormData((prev) => ({
        name: prev.name || profile?.name || user?.name || '',
        title: prev.title || profile?.title || '',
        role: profile?.role || user?.role || 'Student',
        location: prev.location || profile?.location || '',
        education: prev.education || profile?.education || '',
        github_username:
          prev.github_username ||
          profile?.github_username ||
          localStorage.getItem('applywise_github_username') ||
          (user?.email === 'demo@applywise.local' ? 'arjun-mehta' : ''),
        skills_text: profile?.skills_text || prev.skills_text || '',
        resume_text: profile?.resume_text || prev.resume_text || '',
      }));
    }
  }, [isOpen, user?.id]);

  if (!isOpen) return null;

  const toggleSkillChip = (skill: string) => {
    const current = formData.skills_text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const exists = current.some((s) => s.toLowerCase() === skill.toLowerCase());
    const updated = exists
      ? current.filter((s) => s.toLowerCase() !== skill.toLowerCase())
      : [...current, skill];
    setFormData({ ...formData, skills_text: updated.join(', ') });
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingFile(true);
    setError('');
    setUploadMessage(`Reading ${file.name} and storing in your attachments…`);

    try {
      const data = await uploadResumeOrProofFile(file, {
        category: 'resume',
        saveToProfile: true,
      });

      const detectedSkillsList: string[] = data.detectedSkills || [];
      const mergedSkills = Array.from(
        new Set([
          ...formData.skills_text
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          ...detectedSkillsList,
        ])
      ).join(', ');

      setFormData((prev) => ({
        ...prev,
        resume_text: data.text || prev.resume_text,
        skills_text: mergedSkills || prev.skills_text,
      }));

      setUploadMessage(`Saved "${file.name}" (${data.source}) to your future attachments library!`);
      onProfileUpdated();
    } catch (err: any) {
      setError(err.message || 'Could not process attachment.');
      setUploadMessage('');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteAttachment = async (id: number) => {
    try {
      await fetchApi(`/attachments/${id}`, { method: 'DELETE' });
      onProfileUpdated();
    } catch {
      // Ignore error
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.title.trim()) {
      setError('Please enter your name and select or type your target job role.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await fetchApi('/profile', {
        method: 'PUT',
        body: JSON.stringify(formData),
      });
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        setSaving(false);
        onProfileUpdated();
        onClose();
      }, 500);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        <div className="p-6 bg-gradient-to-r from-[#092343] to-[#12385f] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#1b62a5] flex items-center justify-center text-white shrink-0">
              <UserCircle className="w-6 h-6 text-[#38bdf8]" />
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider uppercase text-[#55c5b7]">
                {isInitialOnboarding ? 'STEP 1 · ACCOUNT ONBOARDING' : 'CANDIDATE PROFILE & ATTACHMENTS'}
              </span>
              <h2 className="font-heading text-lg sm:text-xl font-bold text-white">
                {isInitialOnboarding
                  ? `Welcome, ${user?.name || 'Candidate'}! Complete Your Profile`
                  : 'Profile Details & Saved Attachments'}
              </h2>
              <p className="text-xs text-[#9dc7e8]">
                {isInitialOnboarding
                  ? 'Set your target role and upload your résumé or certificates to store for future comparisons.'
                  : 'Update your role target, skills, and stored attachments library.'}
              </p>
            </div>
          </div>
          {!isInitialOnboarding && (
            <button
              onClick={onClose}
              aria-label="Close profile modal"
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Your Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter your name"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1976d2] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Candidate Track
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1976d2] focus:outline-none bg-white"
              >
                <option value="Student">Student (Building Initial Portfolio)</option>
                <option value="Job seeker">Job seeker (Targeting Active Roles)</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Target Job Role <span className="text-red-500">*</span>{' '}
                <span className="font-normal text-slate-400">(Select below or type any custom role)</span>
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRESET_TARGET_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setFormData({ ...formData, title: r })}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                      formData.title === r
                        ? 'bg-[#126bc4] text-white border-[#126bc4]'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-[#126bc4]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Software Engineer, Frontend Developer, Full Stack Engineer"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1976d2] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Location / Work Preference
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g., Chennai, Bengaluru, or Remote"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1976d2] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Education / Degree
              </label>
              <input
                type="text"
                value={formData.education}
                onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                placeholder="e.g., B.E / B.Tech Computer Science, 2026"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1976d2] focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                GitHub Username{' '}
                <span className="font-normal text-slate-400">
                  (Used to verify your commits when linking GitHub repositories as proof)
                </span>
              </label>
              <input
                type="text"
                value={formData.github_username}
                onChange={(e) => {
                  const val = e.target.value.replace(/^@/, '');
                  setFormData({ ...formData, github_username: val });
                  try {
                    localStorage.setItem('applywise_github_username', val);
                  } catch {
                    // ignore
                  }
                }}
                placeholder="e.g., arjun-mehta"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1976d2] focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Your Core Skills{' '}
                <span className="font-normal text-slate-400">
                  (Click chips to toggle or type comma-separated skills)
                </span>
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_SKILL_TERMS.slice(0, 14).map((skill) => {
                  const selected = formData.skills_text
                    .toLowerCase()
                    .split(',')
                    .map((s) => s.trim())
                    .includes(skill.toLowerCase());
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkillChip(skill)}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition ${
                        selected
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-500'
                      }`}
                    >
                      {selected ? `✓ ${skill}` : `+ ${skill}`}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={formData.skills_text}
                onChange={(e) => setFormData({ ...formData, skills_text: e.target.value })}
                placeholder="React, TypeScript, Java, C++, SQL, HTML/CSS, Git"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1976d2] focus:outline-none"
              />
            </div>

            {/* Attachment Upload & Saved Library */}
            <div className="md:col-span-2 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-[#092343] flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-[#126bc4]" />
                    Upload & Save Attachments for Future Use
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Supports PDF, JPG, PNG, DOCX, and TXT. Stored in your account so you never have to re-upload.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*,text/*"
                  onChange={handleAttachmentUpload}
                  disabled={uploadingFile}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingFile}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#126bc4] hover:bg-[#0c59a5] text-white text-xs font-bold cursor-pointer shadow-sm transition shrink-0 disabled:opacity-60"
                >
                  {uploadingFile ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Reading File…</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>+ Upload PDF / JPG / DOCX / TXT</span>
                    </>
                  )}
                </button>
              </div>

              {uploadMessage && (
                <p className="text-xs font-semibold text-emerald-600">{uploadMessage}</p>
              )}

              {attachments.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Saved in Your Account ({attachments.length})
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {attachments.map((att) => (
                      <div
                        key={att.id}
                        className="p-2 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setFormData({ ...formData, resume_text: att.extracted_text })
                          }
                          className="flex items-center gap-2 text-left min-w-0 flex-1 hover:text-[#126bc4]"
                          title="Click to load content into résumé text"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#126bc4] shrink-0" />
                          <div className="truncate">
                            <span className="font-bold block truncate">{att.filename}</span>
                            <span className="text-[10px] text-slate-400">
                              Click to use · {new Date(att.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(att.id)}
                          className="p-1 text-slate-400 hover:text-red-600"
                          title="Delete saved attachment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Résumé / Profile Summary Text
              </label>
              <textarea
                rows={4}
                value={formData.resume_text}
                onChange={(e) => setFormData({ ...formData, resume_text: e.target.value })}
                placeholder="Upload a file above or paste your résumé summary, projects, and experience here..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 font-mono text-slate-700 focus:ring-2 focus:ring-[#1976d2] focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            {!isInitialOnboarding && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving || uploadingFile}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#126bc4] hover:bg-[#0e5aa7] text-white text-sm font-bold shadow transition disabled:opacity-60"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>Profile Saved!</span>
                </>
              ) : saving ? (
                <span>Saving...</span>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>
                    {isInitialOnboarding ? 'Save Details & Enter Workspace →' : 'Save Profile'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
