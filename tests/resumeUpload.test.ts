import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDocumentTextFromBuffer } from '../server/analyzer';
import { identifySkills } from '../src/utils/skillMatcher';

test('extractDocumentTextFromBuffer extracts plain text resume content and skills', async () => {
  const sampleResume = Buffer.from(
    'Nivindharan\nFull Stack Software Engineer\nSkills: React, TypeScript, Node.js, SQL, Docker, Git, REST APIs\nBuilt production web applications with React and Express.'
  );
  const res = await extractDocumentTextFromBuffer(
    sampleResume,
    'text/plain',
    'Nivindharan_Resume_2026.txt',
    'Nivindharan - Full Stack Engineer'
  );
  assert.equal(res.source, 'Text Document');
  assert.ok(res.text.includes('TypeScript'));
  const skills = identifySkills(res.text);
  assert.ok(skills.includes('React'));
  assert.ok(skills.includes('TypeScript'));
  assert.ok(skills.includes('Node.js'));
  assert.ok(skills.includes('Docker'));
});

test('extractDocumentTextFromBuffer handles binary/stream PDF buffer without stalling', async () => {
  const samplePdf = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Title (Candidate Resume React TypeScript Python SQL AWS Docker Git) >>\nendobj\n%%EOF'
  );
  const t0 = Date.now();
  const res = await extractDocumentTextFromBuffer(
    samplePdf,
    'application/pdf',
    'Candidate_Resume.pdf',
    'Candidate - Software Engineer (React, TypeScript, Python, SQL)'
  );
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 10000, `Expected fast extraction under 10000ms, got ${elapsed}ms`);
  assert.ok(res.text.length > 30);
  const skills = identifySkills(res.text);
  assert.ok(skills.includes('React'));
});
