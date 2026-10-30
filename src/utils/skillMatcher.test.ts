import test from 'node:test';
import assert from 'node:assert/strict';
import {
  identifySkills,
  calculateSkillTrends,
  calculateReadinessScore,
  calculateSprintProgress,
  cleanHtmlText,
  FEATURED_COMPANY_JOBS,
  GOVERNMENT_SECTOR_JOBS,
  GOVERNMENT_SECTOR_CATALOG,
  mapCandidateToGovernmentSectors,
  IT_JOB_ROLES,
  buildSkillLearningLinks,
  buildEnhancedSevenDayPlan,
  buildCareerRoadmap,
  calculateCareerPivots,
  JobItem,
} from './skillMatcher';

test('cleanHtmlText strips tags and normalizes spaces', () => {
  const input = '<p>Build <strong>React</strong> and <em>Node.js</em> apps!</p>';
  assert.equal(cleanHtmlText(input), 'Build React and Node.js apps!');
});

test('identifySkills detects matching technologies including C++ and SQL', () => {
  const text = 'Looking for a Software Developer with React, TypeScript, C++, SQL, and Git experience.';
  const skills = identifySkills(text);
  assert.ok(skills.includes('React'));
  assert.ok(skills.includes('TypeScript'));
  assert.ok(skills.includes('C++'));
  assert.ok(skills.includes('SQL'));
  assert.ok(skills.includes('Git'));
  assert.ok(!skills.includes('Python'));
});

test('FEATURED_COMPANY_JOBS preserves all 12 private enterprise companies AND includes UPSC, SSC, ISRO, DRDO, NIC, RBI, IBPS, and RRB Government Sector jobs', () => {
  const companies = new Set(FEATURED_COMPANY_JOBS.map((j) => j.company));
  for (const c of ['Google', 'Microsoft', 'Oracle', 'Zoho', 'Amazon', 'TCS', 'Infosys', 'Cisco', 'Salesforce', 'Adobe', 'IBM', 'Flipkart']) {
    assert.ok(companies.has(c), `Missing private company ${c}`);
  }
  for (const gov of ['UPSC', 'SSC', 'ISRO', 'DRDO', 'NIC', 'RBI', 'IBPS / SBI', 'RRB Railways']) {
    assert.ok(companies.has(gov), `Missing government agency ${gov}`);
  }
  assert.ok(GOVERNMENT_SECTOR_JOBS.length >= 10);
  assert.ok(IT_JOB_ROLES.length >= 16);
});

test('mapCandidateToGovernmentSectors maps candidate skills across UPSC, SSC, ISRO, DRDO, NIC, RBI, IBPS, and RRB tracks', () => {
  const mapped = mapCandidateToGovernmentSectors({
    userSkills: ['C++', 'Python', 'SQL', 'Linux', 'Cybersecurity', 'Quantitative Aptitude'],
    verifiedSkills: ['Python', 'SQL'],
  });

  assert.equal(mapped.length, GOVERNMENT_SECTOR_CATALOG.length);
  assert.ok(mapped.some((m) => m.commission === 'UPSC'));
  assert.ok(mapped.some((m) => m.commission === 'SSC'));
  assert.ok(mapped.some((m) => m.commission === 'ISRO'));
  assert.ok(mapped.some((m) => m.commission === 'DRDO'));

  const isroTrack = mapped.find((m) => m.commission === 'ISRO');
  assert.ok(isroTrack);
  assert.ok(isroTrack.matchedSkills.includes('C++'));
  assert.ok(isroTrack.matchedSkills.includes('Python'));
  assert.ok(isroTrack.readinessScore > 50);
});

test('buildSkillLearningLinks generates YouTube, Udemy, and Coursera links for role', () => {
  const links = buildSkillLearningLinks('TypeScript', 'Frontend Engineer');
  assert.equal(links.length, 3);
  assert.equal(links[0].platform, 'YouTube');
  assert.equal(links[1].platform, 'Udemy');
  assert.equal(links[2].platform, 'Coursera');
  assert.ok(links[0].url.includes('youtube.com'));
  assert.ok(links[1].url.includes('udemy.com'));
  assert.ok(links[2].url.includes('coursera.org'));
});

test('buildEnhancedSevenDayPlan returns 7 distinct days with embedded learning links', () => {
  const plan = buildEnhancedSevenDayPlan('Full Stack Developer', ['Docker', 'AWS'], ['Node.js']);
  assert.equal(plan.length, 7);
  assert.equal(plan[0].focusSkill, 'Docker');
  assert.equal(plan[2].focusSkill, 'AWS');
  assert.equal(plan[0].resources.length, 3);
});

test('calculateSkillTrends aggregates skill occurrences and percentage shares', () => {
  const sampleJobs: JobItem[] = [
    {
      id: '1',
      title: 'Dev',
      company: 'A',
      location: 'Remote',
      created: 'Today',
      url: '#',
      description: '',
      skills: ['React', 'TypeScript'],
    },
    {
      id: '2',
      title: 'Dev',
      company: 'B',
      location: 'Remote',
      created: 'Today',
      url: '#',
      description: '',
      skills: ['React', 'Git'],
    },
  ];

  const trends = calculateSkillTrends(sampleJobs);
  const reactTrend = trends.find((t) => t.skill === 'React');
  assert.ok(reactTrend);
  assert.equal(reactTrend?.count, 2);
  assert.equal(reactTrend?.share, 100);

  const gitTrend = trends.find((t) => t.skill === 'Git');
  assert.ok(gitTrend);
  assert.equal(gitTrend?.count, 1);
  assert.equal(gitTrend?.share, 50);
});

test('calculateReadinessScore bounds result within realistic limits', () => {
  const high = calculateReadinessScore({
    matchedCount: 5,
    totalRequired: 5,
    verifiedEvidenceCount: 5,
  });
  assert.ok(high.score >= 80 && high.score <= 100);

  const low = calculateReadinessScore({
    matchedCount: 1,
    totalRequired: 5,
    verifiedEvidenceCount: 0,
  });
  assert.ok(low.score >= 10 && low.score < 50);
});

test('calculateSprintProgress calculates percentage accurately', () => {
  assert.equal(calculateSprintProgress([0, 1, 2], 7), 43);
  assert.equal(calculateSprintProgress([0, 1, 2, 3, 4, 5, 6], 7), 100);
  assert.equal(calculateSprintProgress([], 7), 0);
  assert.equal(calculateSprintProgress([0], 0), 0);
});

test('calculateCareerPivots ranks adjacent roles by shared skills and readiness score', () => {
  const pivots = calculateCareerPivots({
    currentTargetRole: 'Full Stack Developer',
    userSkills: ['React', 'TypeScript', 'JavaScript', 'HTML/CSS', 'Tailwind CSS', 'Next.js', 'Unit Testing'],
    verifiedSkills: ['React', 'TypeScript'],
  });

  assert.ok(pivots.length >= 8);
  const frontendPivot = pivots.find((p) => p.roleTitle.includes('Frontend'));
  assert.ok(frontendPivot);
  assert.ok(frontendPivot.pivotReadinessScore >= 65);
  assert.equal(frontendPivot.frictionLevel, 'Low Friction Pivot');
  assert.ok(frontendPivot.sharedSkills.includes('React'));
});

test('buildCareerRoadmap constructs 4 structured phases, milestones, and career pivots', () => {
  const roadmap = buildCareerRoadmap({
    targetRole: 'Full Stack Developer',
    userSkills: ['React', 'TypeScript', 'Node.js'],
    verifiedSkills: ['React'],
    explicitMissingSkills: ['Docker', 'System Design'],
    completedMilestoneIds: ['p3-m1-sysdesign'],
  });

  assert.equal(roadmap.targetRole, 'Full Stack Developer');
  assert.equal(roadmap.phases.length, 4);
  assert.ok(roadmap.overallProgress > 0 && roadmap.overallProgress <= 100);
  assert.ok(roadmap.matchedSkills.includes('React'));
  assert.ok(roadmap.missingSkills.includes('Docker'));
  assert.ok(roadmap.pivots.length >= 8);

  const sysDesignMilestone = roadmap.phases[2].milestones.find((m) => m.id === 'p3-m1-sysdesign');
  assert.ok(sysDesignMilestone);
  assert.equal(sysDesignMilestone.status, 'completed');
});


