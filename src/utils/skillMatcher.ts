export interface JobItem {
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
  sector?: 'Enterprise & Private' | 'Government & PSU';
  examCode?: string;
  payScale?: string;
  eligibility?: string;
  selectionStages?: string[];
}

export interface SkillTrend {
  skill: string;
  count: number;
  share: number;
}

export interface LearningLink {
  platform: 'YouTube' | 'Udemy' | 'Coursera';
  title: string;
  url: string;
  duration?: string;
}

export interface EnhancedSprintDay {
  day: number;
  phase: string;
  focusSkill: string;
  skill?: string;
  focus?: string;
  task: string;
  action?: string;
  expectedProof: string;
  deliverable?: string;
  proofType: 'GitHub Repo' | 'Live Demo' | 'Certificate' | 'Test Suite' | 'Architecture Doc';
  resources: LearningLink[];
  learningLinks?: LearningLink[];
}

export interface ITRoleDefinition {
  id: string;
  title: string;
  category: string;
  skills: string[];
  description: string;
  sector?: 'Enterprise & Private' | 'Government & PSU';
}

export const COMMON_SKILL_TERMS = [
  'React',
  'TypeScript',
  'JavaScript',
  'HTML/CSS',
  'Git',
  'Unit Testing',
  'Node.js',
  'Next.js',
  'Angular',
  'Vue',
  'Python',
  'SQL',
  'AWS',
  'Docker',
  'Figma',
  'REST APIs',
  'CI/CD',
  'Java',
  'C++',
  'Tailwind CSS',
  'Kubernetes',
  'Spring Boot',
  'Cloud Computing',
  'System Design',
  'Linux',
  'Cybersecurity',
  'Machine Learning',
  'Selenium / Playwright',
  'GraphQL',
  'MongoDB',
  'Terraform',
  'Quantitative Aptitude',
  'Logical Reasoning',
  'General Studies & Polity',
  'Data Interpretation',
  'Public Administration',
  'Operating Systems',
  'DBMS',
  'Computer Networks',
  'Data Structures & Algorithms',
];

export const IT_JOB_ROLES: ITRoleDefinition[] = [
  {
    id: 'role-swe',
    title: 'Software Engineer',
    category: 'Core Engineering',
    skills: ['Java', 'Python', 'TypeScript', 'JavaScript', 'SQL', 'Git', 'Unit Testing', 'System Design'],
    description: 'Design, build, test, and maintain scalable software systems, distributed backends, and web services.',
    sector: 'Enterprise & Private',
  },
  {
    id: 'role-fullstack',
    title: 'Full Stack Developer',
    category: 'Web & Product',
    skills: ['React', 'TypeScript', 'Node.js', 'JavaScript', 'SQL', 'REST APIs', 'HTML/CSS', 'Git'],
    description: 'Develop end-to-end client and server web applications, REST/GraphQL APIs, and relational databases.',
    sector: 'Enterprise & Private',
  },
  {
    id: 'role-frontend',
    title: 'Frontend React & TypeScript Engineer',
    category: 'Web & UI',
    skills: ['React', 'TypeScript', 'JavaScript', 'HTML/CSS', 'Tailwind CSS', 'Next.js', 'Unit Testing', 'Figma'],
    description: 'Architect accessible, responsive, high-performance user interfaces and design systems.',
    sector: 'Enterprise & Private',
  },
  {
    id: 'role-backend',
    title: 'Backend Java & Spring Boot Engineer',
    category: 'Backend & API',
    skills: ['Java', 'Spring Boot', 'SQL', 'REST APIs', 'Docker', 'Git', 'Unit Testing', 'System Design'],
    description: 'Build high-throughput microservices, transactional databases, and secure enterprise APIs.',
    sector: 'Enterprise & Private',
  },
  {
    id: 'role-cloud-devops',
    title: 'Cloud & DevOps Engineer',
    category: 'Cloud & Infra',
    skills: ['AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Linux', 'Terraform', 'Python', 'Git'],
    description: 'Automate cloud infrastructure, container orchestration, CI/CD deployment pipelines, and observability.',
    sector: 'Enterprise & Private',
  },
  {
    id: 'role-data-eng',
    title: 'Data Engineer & SQL Architect',
    category: 'Data & Analytics',
    skills: ['Python', 'SQL', 'AWS', 'Cloud Computing', 'Docker', 'Git', 'REST APIs', 'System Design'],
    description: 'Build reliable ETL/ELT data pipelines, analytical warehouses, and distributed data processing systems.',
    sector: 'Enterprise & Private',
  },
  {
    id: 'role-ai-ml',
    title: 'AI & Machine Learning Engineer',
    category: 'AI & Data Science',
    skills: ['Python', 'Machine Learning', 'SQL', 'REST APIs', 'Docker', 'Cloud Computing', 'Git', 'Unit Testing'],
    description: 'Train, evaluate, and deploy machine learning models, LLM pipelines, and intelligent inference APIs.',
    sector: 'Enterprise & Private',
  },
  {
    id: 'role-cybersecurity',
    title: 'Cybersecurity & SecOps Analyst',
    category: 'Security',
    skills: ['Cybersecurity', 'Linux', 'Python', 'Cloud Computing', 'AWS', 'CI/CD', 'SQL', 'Git'],
    description: 'Protect cloud and application infrastructure through threat modeling, vulnerability audits, and SecOps automation.',
    sector: 'Enterprise & Private',
  },
  {
    id: 'role-qa-sdet',
    title: 'QA Automation & SDET Engineer',
    category: 'Quality Engineering',
    skills: ['Selenium / Playwright', 'Unit Testing', 'TypeScript', 'Java', 'Python', 'CI/CD', 'REST APIs', 'Git'],
    description: 'Build automated end-to-end browser, API, and performance test frameworks integrated into CI/CD.',
    sector: 'Enterprise & Private',
  },
  {
    id: 'role-sre',
    title: 'Site Reliability Engineer (SRE)',
    category: 'Cloud & Infra',
    skills: ['Kubernetes', 'Linux', 'AWS', 'Docker', 'Python', 'CI/CD', 'System Design', 'Terraform'],
    description: 'Ensure reliability, uptime, incident automation, and latency SLOs for large-scale production systems.',
    sector: 'Enterprise & Private',
  },
  {
    id: 'role-gov-upsc',
    title: 'UPSC Civil & Engineering Services (CSE / IES)',
    category: 'Government · UPSC',
    skills: ['General Studies & Polity', 'Public Administration', 'Quantitative Aptitude', 'Logical Reasoning', 'Data Interpretation', 'System Design', 'Cybersecurity', 'Computer Networks'],
    description: 'All-India Civil Services (IAS/IPS/IFS) & Indian Engineering Services (IES/ESE) leadership and digital governance track under UPSC.',
    sector: 'Government & PSU',
  },
  {
    id: 'role-gov-ssc',
    title: 'SSC CGL Officer & Scientific Assistant (IMD / JE)',
    category: 'Government · SSC',
    skills: ['Quantitative Aptitude', 'Logical Reasoning', 'Data Interpretation', 'General Studies & Polity', 'SQL', 'Python', 'Computer Networks', 'Operating Systems'],
    description: 'Central Secretariat, Income Tax/Customs Inspector, Statistical Investigator, and Scientific Assistant posts via Staff Selection Commission.',
    sector: 'Government & PSU',
  },
  {
    id: 'role-gov-isro-drdo',
    title: 'ISRO / DRDO Scientist "SC" & "B" (CSE / ECE)',
    category: 'Government · Space & Defense',
    skills: ['C++', 'Python', 'Data Structures & Algorithms', 'Operating Systems', 'DBMS', 'Computer Networks', 'Linux', 'System Design'],
    description: 'R&D Scientist and Engineer positions at ISRO (ICRB) and DRDO (RAC) building mission-critical avionics, satellite, and defense software.',
    sector: 'Government & PSU',
  },
  {
    id: 'role-gov-nic',
    title: 'NIC Scientist-"B" & Digital India Architect (MeitY)',
    category: 'Government · e-Governance IT',
    skills: ['Java', 'Python', 'SQL', 'React', 'REST APIs', 'Cybersecurity', 'Cloud Computing', 'Computer Networks'],
    description: 'National Informatics Centre (NIC), CDAC, and UIDAI technical cadres powering India Stack, DigiLocker, and national e-Governance clouds.',
    sector: 'Government & PSU',
  },
  {
    id: 'role-gov-rbi-ibps',
    title: 'RBI Grade B & IBPS / SBI Specialist IT Officer',
    category: 'Government · Banking & FinReg',
    skills: ['SQL', 'DBMS', 'Computer Networks', 'Cybersecurity', 'Java', 'Quantitative Aptitude', 'Data Interpretation', 'Logical Reasoning'],
    description: 'Central banking regulation (RBI Grade B General/DSIM) and Public Sector Bank Specialist IT Officer (IBPS SO / SBI SCO) cadres.',
    sector: 'Government & PSU',
  },
  {
    id: 'role-gov-psu-rrb',
    title: 'GATE Maharatna PSU Officer & RRB Railways Engineer',
    category: 'Government · PSUs & Railways',
    skills: ['Data Structures & Algorithms', 'Operating Systems', 'DBMS', 'Computer Networks', 'C++', 'Java', 'Quantitative Aptitude', 'Logical Reasoning'],
    description: 'Executive Trainee & Senior Engineer roles across ONGC, NTPC, BHEL, IOCL, PGCIL (via GATE) and Indian Railways (RRB JE / NTPC).',
    sector: 'Government & PSU',
  },
];

export const ENTERPRISE_COMPANIES = [
  'Google',
  'Microsoft',
  'Oracle',
  'Zoho',
  'Amazon',
  'TCS',
  'Infosys',
  'Cisco',
  'Salesforce',
  'Adobe',
  'IBM',
  'Flipkart',
];

export const GOVERNMENT_AGENCIES = [
  'UPSC',
  'SSC',
  'ISRO',
  'DRDO',
  'NIC',
  'RBI',
  'IBPS / SBI',
  'RRB Railways',
  'GATE PSU',
  'State PSC',
];

export const PRESET_EVIDENCE_TITLES: Record<string, string[]> = {
  project: [
    'Full-Stack Web Application Repository',
    'RESTful Microservice API Project',
    'Responsive UI Component Library',
    'Database Schema & Query Optimization Project',
    'Cloud CI/CD & Docker Deployment Pipeline',
  ],
  certificate: [
    'Coursera Professional Specialization Certificate',
    'Udemy Hands-On Bootcamp Completion Certificate',
    'Google Cloud / AWS Foundational Certification',
    'Oracle Certified Foundations Associate',
    'Microsoft Certified: Azure Fundamentals',
    'Cisco Certified Support / CyberOps Associate',
    'GATE / NPTEL Elite Gold Academic Certification',
  ],
  assessment: [
    'HackerRank / LeetCode Verified Skill Assessment',
    'Unit & Integration Testing Suite Pass Report',
    'Frontend Accessibility & Performance Audit',
    'UPSC / SSC / GATE Mock Test Series Percentile Scorecard',
  ],
  internship: [
    'Software Engineering Internship Deliverable',
    'Open-Source Feature Pull Request Merged',
    'NIC / DRDO / ISRO / PSU Research Internship Report',
  ],
  'GitHub link': [
    'Verified Public GitHub Repository & Commit History',
    'Automated CI/CD Pipeline & Test Workflow',
  ],
  'portfolio link': [
    'Deployed Live Production Web App Demo',
    'Interactive Engineering Portfolio Case Study',
  ],
  coursework: [
    'University Capstone Engineering Project',
    'Data Structures & Algorithms Lab Implementation',
  ],
};

export const GOVERNMENT_SECTOR_JOBS: JobItem[] = [
  {
    id: 'gov-upsc-cse-1',
    title: 'UPSC Civil Services (IAS / IPS / IFS) & Digital Governance Cadre',
    company: 'UPSC',
    location: 'New Delhi / All-India Cadre',
    created: 'Govt Exam · Annual Notification',
    url: 'https://upsc.gov.in/',
    description:
      'Union Public Service Commission (UPSC CSE) recruitment for Indian Administrative Service (IAS), Indian Police Service (IPS), and Central Civil Services Group A. Evaluates General Studies & Polity, Public Administration, Quantitative Aptitude (CSAT), Logical Reasoning, Data Interpretation, and technology policy governance.',
    skills: ['General Studies & Polity', 'Public Administration', 'Quantitative Aptitude', 'Logical Reasoning', 'Data Interpretation', 'Cybersecurity'],
    featured: true,
    badge: 'UPSC All-India Service',
    sector: 'Government & PSU',
    examCode: 'UPSC CSE / CSAT',
    payScale: '7th CPC Level 10–14 (₹56,100 – ₹2,50,000)',
    eligibility: 'Any Bachelor Degree (Age 21–32 yrs)',
    selectionStages: ['Prelims (GS + CSAT)', 'Mains (9 Written Papers)', 'Personality Interview'],
  },
  {
    id: 'gov-upsc-ese-1',
    title: 'UPSC Indian Engineering Services (IES / ESE) — E&T / IT Officer',
    company: 'UPSC',
    location: 'New Delhi / Central Ministries',
    created: 'Govt Exam · Active Track',
    url: 'https://upsconline.nic.in/',
    description:
      'Class-I Gazetted Engineering Officer recruitment through UPSC Engineering Services Examination (ESE/IES). Covers Computer Networks, Operating Systems, Data Structures & Algorithms, Digital Systems, System Design, and General Studies & Engineering Aptitude.',
    skills: ['Computer Networks', 'Operating Systems', 'Data Structures & Algorithms', 'System Design', 'C++', 'General Studies & Polity', 'Quantitative Aptitude'],
    featured: true,
    badge: 'Class-I Gazetted Tech',
    sector: 'Government & PSU',
    examCode: 'UPSC ESE / IES',
    payScale: '7th CPC Level 10 (₹56,100 – ₹1,77,500)',
    eligibility: 'B.E. / B.Tech in Engineering (Age 21–30 yrs)',
    selectionStages: ['Stage-I Prelims (Objective)', 'Stage-II Mains (Conventional)', 'UPSC Board Interview'],
  },
  {
    id: 'gov-ssc-cgl-1',
    title: 'SSC CGL — Assistant Section Officer (ASO) / Inspector & Data Analyst',
    company: 'SSC',
    location: 'New Delhi / Central Govt Ministries',
    created: 'Govt Exam · Tier-I & II',
    url: 'https://ssc.gov.in/',
    description:
      'Staff Selection Commission Combined Graduate Level (SSC CGL) for Group B & C posts across Central Secretariat (MEA/CSS), Income Tax, Customs, CAG Auditor, and JSO Statistical Investigator. Tests Quantitative Aptitude, Logical Reasoning, Data Interpretation, General Studies & Polity, Computer Proficiency, and SQL/Data analysis.',
    skills: ['Quantitative Aptitude', 'Logical Reasoning', 'Data Interpretation', 'General Studies & Polity', 'SQL', 'Computer Networks'],
    featured: true,
    badge: 'Central Govt Group B',
    sector: 'Government & PSU',
    examCode: 'SSC CGL (Tier I & II)',
    payScale: '7th CPC Level 6–8 (₹35,400 – ₹1,51,100)',
    eligibility: 'Any Bachelor Degree (Age 18–32 yrs)',
    selectionStages: ['Tier-I CBT (Qualifying)', 'Tier-II CBT (Quant, Reasoning, English, GS & Computer)', 'Document Verification'],
  },
  {
    id: 'gov-ssc-imd-je-1',
    title: 'SSC Scientific Assistant (IMD) & Junior Engineer (SSC JE — IT / Electrical)',
    company: 'SSC',
    location: 'All India (IMD / CPWD / MES)',
    created: 'Govt Exam · Technical Cadre',
    url: 'https://ssc.gov.in/',
    description:
      'Technical recruitment under Staff Selection Commission for India Meteorological Department (Scientific Assistant) and Central Public Works / MES. Requires Computer Science / IT fundamentals including Operating Systems, DBMS, SQL, Computer Networks, Python/C++, and Quantitative Aptitude.',
    skills: ['Operating Systems', 'DBMS', 'SQL', 'Computer Networks', 'Python', 'C++', 'Quantitative Aptitude', 'Logical Reasoning'],
    featured: true,
    badge: 'SSC Technical Officer',
    sector: 'Government & PSU',
    examCode: 'SSC IMD / SSC JE',
    payScale: '7th CPC Level 6 (₹35,400 – ₹1,12,400)',
    eligibility: 'B.Sc (CS/IT) / BCA / B.E. / B.Tech / Diploma (Age up to 30 yrs)',
    selectionStages: ['Paper-I (General Intelligence & Quant)', 'Paper-II (Computer Science / Engineering Domain)', 'Merit Allocation'],
  },
  {
    id: 'gov-isro-sc-1',
    title: 'Scientist / Engineer "SC" (Computer Science & Mission Software)',
    company: 'ISRO',
    location: 'Bengaluru / Thiruvananthapuram / Sriharikota',
    created: 'Dept of Space · ICRB Direct',
    url: 'https://www.isro.gov.in/Careers.html',
    description:
      'Indian Space Research Organisation (ISRO ICRB) recruitment for Scientist/Engineer "SC" in Computer Science. Build satellite telemetry, flight software, real-time Linux systems, and ground-station data pipelines using C++, Python, Data Structures & Algorithms, Operating Systems, DBMS, and Computer Networks.',
    skills: ['C++', 'Python', 'Data Structures & Algorithms', 'Operating Systems', 'DBMS', 'Computer Networks', 'Linux', 'Unit Testing'],
    featured: true,
    badge: 'Dept of Space R&D',
    sector: 'Government & PSU',
    examCode: 'ISRO ICRB Scientist-SC',
    payScale: '7th CPC Level 10 (₹56,100 + DA & HRA)',
    eligibility: 'B.E. / B.Tech in CSE/IT/ECE with min 65% (CGPA 6.84)',
    selectionStages: ['Written Test (80 Core CS + 15 Aptitude Questions)', 'Technical Interview by ISRO Panel'],
  },
  {
    id: 'gov-drdo-scb-1',
    title: 'Scientist "B" & Senior Technical Assistant (STA-B — Defense AI & Cyber)',
    company: 'DRDO',
    location: 'Bengaluru / Hyderabad / New Delhi / Pune',
    created: 'Ministry of Defence · RAC / CEPTAM',
    url: 'https://rac.gov.in/',
    description:
      'Defence Research and Development Organisation (DRDO RAC & CEPTAM) hiring Scientist "B" and STA-B for defense AI, radar signal software, and cybersecurity labs. Strong command of Python, C++, Machine Learning, Cybersecurity, Operating Systems, Data Structures & Algorithms, and Linux.',
    skills: ['Python', 'C++', 'Machine Learning', 'Cybersecurity', 'Data Structures & Algorithms', 'Operating Systems', 'Linux', 'DBMS'],
    featured: true,
    badge: 'Defence R&D Cadre',
    sector: 'Government & PSU',
    examCode: 'DRDO RAC / CEPTAM',
    payScale: '7th CPC Level 10 (₹56,100 – ₹1,77,500)',
    eligibility: 'First Class B.E. / B.Tech in CS/IT + GATE Score (or CEPTAM CBT)',
    selectionStages: ['GATE / Written Descriptive Paper', 'RAC Personal Technical Interview'],
  },
  {
    id: 'gov-nic-scb-1',
    title: 'NIC Scientist-"B" & Scientific Officer/Engineer-SB (MeitY Digital India)',
    company: 'NIC',
    location: 'New Delhi / State Capitals (Pan-India)',
    created: 'MeitY · NIELIT Recruitment',
    url: 'https://www.nic.in/',
    description:
      'National Informatics Centre (Ministry of Electronics & IT) recruitment for Scientist-"B" and Scientific Officer. Architect national e-Governance platforms, high-security government clouds, and citizen APIs using Java, Spring Boot, React, SQL, REST APIs, Cybersecurity, Computer Networks, and Cloud Computing.',
    skills: ['Java', 'Spring Boot', 'React', 'SQL', 'REST APIs', 'Cybersecurity', 'Computer Networks', 'Cloud Computing'],
    featured: true,
    badge: 'Digital India Core IT',
    sector: 'Government & PSU',
    examCode: 'NIC / NIELIT Scientist-B',
    payScale: '7th CPC Level 10 (₹56,100 – ₹1,77,500)',
    eligibility: 'B.E. / B.Tech / MCA / M.Sc (CS/IT)',
    selectionStages: ['NIELIT Online CBT (65% Technical CS + 35% Aptitude)', 'Personal Interview (Scientist-B)'],
  },
  {
    id: 'gov-rbi-gradeb-1',
    title: 'RBI Grade B Officer (General / DSIM Data Science & FinTech Supervision)',
    company: 'RBI',
    location: 'Mumbai / New Delhi / Chennai / Kolkata',
    created: 'Central Bank · Officer Grade B',
    url: 'https://opportunities.rbi.org.in/',
    description:
      'Reserve Bank of India (RBI) Grade B Officer recruitment in General and Department of Statistics & Information Management (DSIM). Combines Data Interpretation, Python, SQL, Machine Learning, Quantitative Aptitude, Logical Reasoning, and Financial/Economic Policy.',
    skills: ['Data Interpretation', 'Quantitative Aptitude', 'Logical Reasoning', 'Python', 'SQL', 'Machine Learning', 'General Studies & Polity'],
    featured: true,
    badge: 'Apex Financial Regulator',
    sector: 'Government & PSU',
    examCode: 'RBI Grade B (DR / DSIM)',
    payScale: 'RBI Grade B (₹55,200 Basic · ~₹1.16L/mo Gross)',
    eligibility: 'Bachelor / Master Degree in CS, Data Science, Stats, or Any Discipline',
    selectionStages: ['Phase-I Prelims Objective', 'Phase-II Mains (Objective + Descriptive)', 'Psychometric & Board Interview'],
  },
  {
    id: 'gov-ibps-sbi-so-1',
    title: 'Specialist Officer (IT Officer Scale-I) & Probationary Officer (IBPS / SBI)',
    company: 'IBPS / SBI',
    location: 'Mumbai / Bengaluru / Hyderabad / Pan-India',
    created: 'Public Sector Banks · IBPS SO & SBI SCO',
    url: 'https://www.ibps.in/',
    description:
      'Public Sector Banking recruitment via IBPS Specialist Officer (IT Officer Scale-I) and State Bank of India (SBI SCO / System Officer). Focuses on DBMS, SQL, Computer Networks, Operating Systems, Cybersecurity, Java, REST APIs, Quantitative Aptitude, and Logical Reasoning.',
    skills: ['DBMS', 'SQL', 'Computer Networks', 'Operating Systems', 'Cybersecurity', 'Java', 'REST APIs', 'Quantitative Aptitude'],
    featured: true,
    badge: 'PSU Banking IT Officer',
    sector: 'Government & PSU',
    examCode: 'IBPS SO (IT) / SBI SCO',
    payScale: 'IBA Scale-I/II Officer (₹48,480 – ₹85,920)',
    eligibility: 'B.E. / B.Tech / MCA / M.Sc in CS, IT, or Electronics',
    selectionStages: ['Prelims (Quant, Reasoning, English)', 'Mains (60 Professional IT Knowledge Questions)', 'IBPS Panel Interview'],
  },
  {
    id: 'gov-rrb-psu-1',
    title: 'RRB Junior Engineer (IT / S&T) & GATE Maharatna PSU Executive Trainee',
    company: 'RRB Railways',
    location: 'Pan-India (Indian Railways / NTPC / ONGC / BHEL)',
    created: 'Railways & Maharatna PSUs',
    url: 'https://indianrailways.gov.in/',
    description:
      'Recruitment for Indian Railways (RRB JE IT, Signal & Telecom, and NTPC Graduate Posts) alongside Maharatna PSUs (ONGC, NTPC, BHEL, IOCL, PGCIL Executive Trainee CS/IT). Evaluates Data Structures & Algorithms, DBMS, Operating Systems, Computer Networks, C++, Quantitative Aptitude, and Logical Reasoning.',
    skills: ['Data Structures & Algorithms', 'DBMS', 'Operating Systems', 'Computer Networks', 'C++', 'SQL', 'Quantitative Aptitude', 'Logical Reasoning'],
    featured: true,
    badge: 'Railways & Maharatna PSU',
    sector: 'Government & PSU',
    examCode: 'RRB JE / NTPC & GATE PSU',
    payScale: '7th CPC Level 6–10 (₹35,400 – ₹1,80,000 IDA)',
    eligibility: 'B.E. / B.Tech / BCA / B.Sc or Graduate',
    selectionStages: ['CBT Stage-I (Aptitude & General Science)', 'CBT Stage-II (Domain Technical CS/IT) / GATE Score', 'Document & Medical Verification'],
  },
];

export const FEATURED_COMPANY_JOBS: JobItem[] = [
  {
    id: 'google-swe-1',
    title: 'Software Engineer, Early Career (Frontend / Cloud)',
    company: 'Google',
    location: 'Bengaluru / Hyderabad (Hybrid)',
    created: 'Featured · Today',
    url: 'https://www.google.com/about/careers/applications/jobs/results/?q=Software%20Engineer',
    description:
      'Design, develop, test, deploy, maintain, and enhance large-scale software solutions at Google. Build accessible, high-performance web applications using TypeScript, Angular/React, Java, Python, and distributed cloud systems with strong unit testing and CI/CD practices.',
    skills: ['TypeScript', 'JavaScript', 'React', 'Java', 'Python', 'Unit Testing', 'Git', 'CI/CD'],
    featured: true,
    badge: 'Top Enterprise',
    sector: 'Enterprise & Private',
  },
  {
    id: 'microsoft-sde-1',
    title: 'Software Engineering — Full Stack & Azure',
    company: 'Microsoft',
    location: 'Hyderabad / Bengaluru / Noida',
    created: 'Featured · Today',
    url: 'https://careers.microsoft.com/us/en/search-results?keywords=Software%20Engineer',
    description:
      'Join Microsoft Engineering to build scalable cloud-native experiences and intelligent developer tools. Collaborate using React, TypeScript, Node.js, C++, SQL, REST APIs, and automated testing pipelines across global services.',
    skills: ['React', 'TypeScript', 'Node.js', 'C++', 'SQL', 'REST APIs', 'Git', 'Unit Testing'],
    featured: true,
    badge: 'Top Enterprise',
    sector: 'Enterprise & Private',
  },
  {
    id: 'oracle-mts-1',
    title: 'Member of Technical Staff — Cloud & Database Engineering',
    company: 'Oracle',
    location: 'Bengaluru / Chennai / Hyderabad',
    created: 'Featured · 1 day ago',
    url: 'https://careers.oracle.com/jobs/#en/sites/jobsearch/requisitions?keyword=Software+Developer',
    description:
      'Develop mission-critical cloud infrastructure and enterprise applications at Oracle. Work with Java, Spring Boot, SQL, REST APIs, Docker, JavaScript/TypeScript, and modern web frameworks to deliver high-availability enterprise systems.',
    skills: ['Java', 'Spring Boot', 'SQL', 'REST APIs', 'Docker', 'JavaScript', 'TypeScript', 'Git'],
    featured: true,
    badge: 'Top Enterprise',
    sector: 'Enterprise & Private',
  },
  {
    id: 'zoho-dev-1',
    title: 'Software Developer (Web & Product Engineering)',
    company: 'Zoho',
    location: 'Chennai / Tenkasi / Coimbatore',
    created: 'Featured · Today',
    url: 'https://www.zoho.com/careers/',
    description:
      'Build high-impact SaaS product suites used by millions globally at Zoho. Strong foundation in Java, C++, JavaScript, HTML/CSS, SQL, and REST APIs. Candidates who demonstrate real problem-solving projects and clean code architecture stand out.',
    skills: ['Java', 'C++', 'JavaScript', 'HTML/CSS', 'SQL', 'REST APIs', 'React', 'Git'],
    featured: true,
    badge: 'Product Leader',
    sector: 'Enterprise & Private',
  },
  {
    id: 'amazon-sde-1',
    title: 'Software Development Engineer I (SDE-1 — AWS & Retail)',
    company: 'Amazon',
    location: 'Bengaluru / Chennai / Hyderabad',
    created: 'Featured · Today',
    url: 'https://www.amazon.jobs/en/search?base_query=Software+Development+Engineer',
    description:
      'Build distributed backend services, cloud-native APIs, and resilient customer experiences at Amazon. Requires strong proficiency in Java, Python, C++, AWS cloud services, SQL/NoSQL data stores, System Design, and automated unit testing.',
    skills: ['Java', 'Python', 'AWS', 'SQL', 'REST APIs', 'System Design', 'Unit Testing', 'Git'],
    featured: true,
    badge: 'Cloud Giant',
    sector: 'Enterprise & Private',
  },
  {
    id: 'tcs-digital-1',
    title: 'Systems Engineer — TCS Digital (Full Stack & Cloud)',
    company: 'TCS',
    location: 'Chennai / Mumbai / Bengaluru / Pune',
    created: 'Featured · Today',
    url: 'https://www.tcs.com/careers',
    description:
      'Deliver enterprise digital transformation applications at Tata Consultancy Services (TCS Digital). Build responsive portals and microservices using Java, Spring Boot, React, Angular, SQL, REST APIs, Docker, and agile CI/CD workflows.',
    skills: ['Java', 'Spring Boot', 'React', 'Angular', 'SQL', 'REST APIs', 'Docker', 'Git'],
    featured: true,
    badge: 'Global IT Leader',
    sector: 'Enterprise & Private',
  },
  {
    id: 'infosys-sp-1',
    title: 'Specialist Programmer — Cloud & AI Engineering',
    company: 'Infosys',
    location: 'Bengaluru / Mysuru / Pune / Hyderabad',
    created: 'Featured · 1 day ago',
    url: 'https://www.infosys.com/careers/',
    description:
      'Architect next-generation enterprise platforms at Infosys. Work on high-complexity full-stack, cloud, and AI-enabled systems leveraging Python, Java, React, Node.js, AWS, SQL, Docker, and microservices.',
    skills: ['Python', 'Java', 'React', 'Node.js', 'AWS', 'SQL', 'Docker', 'Git'],
    featured: true,
    badge: 'Global IT Leader',
    sector: 'Enterprise & Private',
  },
  {
    id: 'cisco-net-1',
    title: 'Software Engineer — Cloud Networking & Cybersecurity',
    company: 'Cisco',
    location: 'Bengaluru / Chennai',
    created: 'Featured · 1 day ago',
    url: 'https://jobs.cisco.com/',
    description:
      'Develop secure cloud-managed networking, telemetry, and security automation platforms at Cisco. Utilize Python, C++, Linux, Kubernetes, Docker, Cybersecurity protocols, REST APIs, and automated testing.',
    skills: ['Python', 'C++', 'Linux', 'Kubernetes', 'Docker', 'Cybersecurity', 'REST APIs', 'Git'],
    featured: true,
    badge: 'Security & Cloud',
    sector: 'Enterprise & Private',
  },
  {
    id: 'salesforce-mts-1',
    title: 'Associate Member of Technical Staff (AMTS)',
    company: 'Salesforce',
    location: 'Hyderabad / Bengaluru',
    created: 'Featured · Today',
    url: 'https://careers.salesforce.com/',
    description:
      'Engineer trusted enterprise CRM cloud services and Lightning web components at Salesforce. Requires strong skills in Java, JavaScript, TypeScript, HTML/CSS, SQL, REST APIs, and automated unit testing.',
    skills: ['Java', 'JavaScript', 'TypeScript', 'HTML/CSS', 'SQL', 'REST APIs', 'Unit Testing', 'Git'],
    featured: true,
    badge: 'Enterprise SaaS',
    sector: 'Enterprise & Private',
  },
  {
    id: 'adobe-sde-1',
    title: 'Computer Scientist / Frontend & Creative Cloud Engineer',
    company: 'Adobe',
    location: 'Noida / Bengaluru',
    created: 'Featured · 2 days ago',
    url: 'https://careers.adobe.com/',
    description:
      'Build high-performance web applications for Adobe Creative Cloud and Document Cloud. Combine React, TypeScript, JavaScript, HTML/CSS, C++, and modern UI engineering with rigorous testing.',
    skills: ['React', 'TypeScript', 'JavaScript', 'HTML/CSS', 'C++', 'Unit Testing', 'Figma', 'Git'],
    featured: true,
    badge: 'Product Leader',
    sector: 'Enterprise & Private',
  },
  {
    id: 'ibm-cloud-1',
    title: 'Cloud & AI Full-Stack Developer',
    company: 'IBM',
    location: 'Bengaluru / Kochi / Hyderabad',
    created: 'Featured · 1 day ago',
    url: 'https://www.ibm.com/careers',
    description:
      'Develop hybrid cloud and enterprise AI applications at IBM. Work with Python, Java, React, Docker, Kubernetes, Linux, SQL, and CI/CD pipelines.',
    skills: ['Python', 'Java', 'React', 'Docker', 'Kubernetes', 'Linux', 'SQL', 'CI/CD'],
    featured: true,
    badge: 'Hybrid Cloud & AI',
    sector: 'Enterprise & Private',
  },
  {
    id: 'flipkart-sde-1',
    title: 'Software Development Engineer I — E-Commerce Platform',
    company: 'Flipkart',
    location: 'Bengaluru',
    created: 'Featured · Today',
    url: 'https://www.flipkartcareers.com/',
    description:
      'Scale high-concurrency commerce microservices, supply-chain engines, and mobile web experiences at Flipkart. Requires Java, Spring Boot, React, SQL, Redis/NoSQL, REST APIs, and System Design.',
    skills: ['Java', 'Spring Boot', 'React', 'SQL', 'REST APIs', 'System Design', 'Unit Testing', 'Git'],
    featured: true,
    badge: 'Unicorn Tech',
    sector: 'Enterprise & Private',
  },
  ...GOVERNMENT_SECTOR_JOBS,
];

const SKILL_SYNONYMS: Record<string, string[]> = {
  'HTML/CSS': ['html', 'css', 'sass', 'tailwind'],
  'Unit Testing': ['unit test', 'jest', 'vitest', 'testing', 'mocha', 'cypress', 'playwright'],
  'Selenium / Playwright': ['selenium', 'playwright', 'cypress', 'webdriver', 'qa automation'],
  'Node.js': ['node.js', 'nodejs', 'node'],
  'Next.js': ['next.js', 'nextjs'],
  'REST APIs': ['rest api', 'restful', 'api integration', 'apis'],
  'CI/CD': ['ci/cd', 'continuous integration', 'github actions', 'jenkins'],
  'TypeScript': ['typescript', 'ts'],
  'JavaScript': ['javascript', 'js', 'es6'],
  'React': ['react', 'react.js', 'reactjs'],
  'SQL': ['sql', 'postgresql', 'postgres', 'mysql', 'sqlite', 'oracle db'],
  'C++': ['c++', 'cpp'],
  'Machine Learning': ['machine learning', 'deep learning', 'pytorch', 'tensorflow', 'scikit-learn', 'llm'],
  'Cybersecurity': ['cybersecurity', 'network security', 'infosec', 'owasp', 'penetration testing', 'secops'],
  'Quantitative Aptitude': ['quantitative aptitude', 'quant', 'aptitude', 'csat', 'numerical ability', 'mathematics'],
  'Logical Reasoning': ['logical reasoning', 'reasoning', 'analytical ability', 'general intelligence'],
  'General Studies & Polity': ['general studies', 'indian polity', 'polity', 'governance', 'general awareness', 'upsc gs'],
  'Data Interpretation': ['data interpretation', 'statistics', 'statistical analysis', 'data analytics'],
  'Public Administration': ['public administration', 'e-governance', 'policy', 'civil services'],
  'Operating Systems': ['operating systems', 'os', 'unix', 'linux kernel'],
  'DBMS': ['dbms', 'database management', 'relational database', 'normalization'],
  'Computer Networks': ['computer networks', 'networking', 'tcp/ip', 'osi model', 'routing'],
  'Data Structures & Algorithms': ['data structures', 'algorithms', 'dsa', 'competitive programming'],
};

export function cleanHtmlText(text: string = ''): string {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function identifySkills(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const maskedForJs = lower.replace(/\b(?:node|next|vue|react|express)\.js\b/g, ' ');
  return COMMON_SKILL_TERMS.filter((skill) => {
    const synonyms = SKILL_SYNONYMS[skill] || [skill.toLowerCase()];
    const targetText = skill === 'JavaScript' ? maskedForJs : lower;
    return synonyms.some((syn) => {
      const escaped = syn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(^|[^a-z0-9.])${escaped}([^a-z0-9]|$)`, 'i');
      if (syn.length <= 4) {
        return regex.test(targetText);
      }
      return regex.test(targetText) || targetText.includes(syn);
    });
  });
}

export function calculateSkillTrends(jobs: JobItem[]): SkillTrend[] {
  const count = new Map<string, number>();
  for (const job of jobs) {
    const uniqueSkills = new Set(job.skills || []);
    for (const skill of uniqueSkills) {
      count.set(skill, (count.get(skill) || 0) + 1);
    }
  }

  const total = Math.max(jobs.length, 1);
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([skill, skillCount]) => ({
      skill,
      count: skillCount,
      share: Math.round((skillCount / total) * 100),
    }));
}

export function calculateReadinessScore(params: {
  matchedCount: number;
  totalRequired: number;
  verifiedEvidenceCount: number;
}): { score: number; skillMatch: number; evidenceStrength: number; experienceRelevance: number } {
  const { matchedCount, totalRequired, verifiedEvidenceCount } = params;
  const safeTotal = Math.max(totalRequired, 1);
  const matchRatio = Math.min(matchedCount / safeTotal, 1);
  const evidenceRatio = Math.min(verifiedEvidenceCount / Math.max(matchedCount, 1), 1);

  const skillMatch = Math.round(matchRatio * 100);
  const evidenceStrength = Math.round(evidenceRatio * 100 * 0.9 + 10);
  const experienceRelevance = Math.round(skillMatch * 0.6 + evidenceStrength * 0.4);
  const score = Math.round(skillMatch * 0.45 + evidenceStrength * 0.35 + experienceRelevance * 0.2);

  return {
    score: Math.min(Math.max(score, 10), 98),
    skillMatch,
    evidenceStrength,
    experienceRelevance,
  };
}

export function calculateSprintProgress(completedIndices: number[], totalTasks: number): number {
  if (totalTasks <= 0) return 0;
  return Math.min(100, Math.round((completedIndices.length / totalTasks) * 100));
}

export function buildSkillLearningLinks(skill: string, roleTitle: string = 'Software Engineer'): LearningLink[] {
  const cleanSkill = skill || 'Software Engineering';
  const cleanRole = roleTitle || 'Software Engineer';
  return [
    {
      platform: 'YouTube',
      title: `${cleanSkill} Crash Course & Project for ${cleanRole}`,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${cleanSkill} ${cleanRole} project tutorial full course`)}`,
      duration: '2–4 hrs',
    },
    {
      platform: 'Udemy',
      title: `${cleanSkill} Hands-On Bootcamp & Practical Labs`,
      url: `https://www.udemy.com/courses/search/?q=${encodeURIComponent(`${cleanSkill} ${cleanRole}`)}`,
      duration: 'Self-paced',
    },
    {
      platform: 'Coursera',
      title: `Verified ${cleanSkill} Professional Certification (${cleanRole})`,
      url: `https://www.coursera.org/search?query=${encodeURIComponent(`${cleanSkill} ${cleanRole}`)}`,
      duration: 'Certificate',
    },
  ];
}

export function buildEnhancedSevenDayPlan(
  roleTitle: string,
  missingSkills: string[],
  unprovenSkills: string[]
): EnhancedSprintDay[] {
  const primaryGap = missingSkills[0] || unprovenSkills[0] || 'TypeScript';
  const secondaryGap = missingSkills[1] || unprovenSkills[1] || 'Unit Testing';
  const thirdGap = missingSkills[2] || unprovenSkills[0] || 'REST APIs';
  const cleanRole = roleTitle || 'Software Engineer';

  return [
    {
      day: 1,
      phase: 'Day 1 · Architecture & Skill Foundation',
      focusSkill: primaryGap,
      task: `Complete a focused ${primaryGap} crash module for ${cleanRole} and initialize a dedicated proof repository with a clear problem statement.`,
      expectedProof: `Public GitHub repo initialized with ${primaryGap} starter architecture`,
      proofType: 'GitHub Repo',
      resources: buildSkillLearningLinks(primaryGap, cleanRole),
    },
    {
      day: 2,
      phase: 'Day 2 · Core Feature Implementation',
      focusSkill: primaryGap,
      task: `Build a working ${primaryGap} feature module aligned with ${cleanRole} industry standards—avoiding boilerplate tutorials by solving a real data flow.`,
      expectedProof: `Clean Git commits demonstrating ${primaryGap} implementation`,
      proofType: 'GitHub Repo',
      resources: buildSkillLearningLinks(primaryGap, cleanRole),
    },
    {
      day: 3,
      phase: 'Day 3 · Secondary Gap & Integration',
      focusSkill: secondaryGap,
      task: `Integrate ${secondaryGap} into your project and complete the hands-on lab exercises to bridge your second highest-priority role gap.`,
      expectedProof: `Working integration of ${secondaryGap} pushed to repository`,
      proofType: 'GitHub Repo',
      resources: buildSkillLearningLinks(secondaryGap, cleanRole),
    },
    {
      day: 4,
      phase: 'Day 4 · Automated Verification & Testing',
      focusSkill: 'Unit Testing',
      task: `Write automated unit and edge-case tests covering your ${primaryGap} and ${secondaryGap} logic so recruiters can verify code quality.`,
      expectedProof: `Passing test suite output & coverage screenshot or log`,
      proofType: 'Test Suite',
      resources: buildSkillLearningLinks('Unit Testing', cleanRole),
    },
    {
      day: 5,
      phase: 'Day 5 · Certification & Assessment Proof',
      focusSkill: thirdGap,
      task: `Complete a recognized Coursera/Udemy module or skill assessment in ${thirdGap} for ${cleanRole} and export your completion credential.`,
      expectedProof: `PDF or JPG certificate / assessment badge uploaded to ApplyWise`,
      proofType: 'Certificate',
      resources: buildSkillLearningLinks(thirdGap, cleanRole),
    },
    {
      day: 6,
      phase: 'Day 6 · Technical Case Study & Live Demo',
      focusSkill: primaryGap,
      task: `Publish a live deployment preview and write a concise Engineering README explaining system design trade-offs for ${cleanRole} reviewers.`,
      expectedProof: `Live deployed URL + Architecture README with screenshots`,
      proofType: 'Live Demo',
      resources: buildSkillLearningLinks('System Design', cleanRole),
    },
    {
      day: 7,
      phase: 'Day 7 · Evidence Matrix & Résumé Lock-In',
      focusSkill: cleanRole,
      task: `Attach your new repository and certificate proof in the Skill Evidence Matrix above, then re-run Job Match to boost your ${cleanRole} readiness score.`,
      expectedProof: `Verified evidence attached & updated tailored résumé bullets`,
      proofType: 'Architecture Doc',
      resources: buildSkillLearningLinks(cleanRole, cleanRole),
    },
  ];
}

export interface RoadmapMilestone {
  id: string;
  phaseIndex: number;
  title: string;
  description: string;
  skill: string;
  category: 'Core Foundation' | 'Skill Gap Closure' | 'Architecture & Proof' | 'Offer Readiness';
  status: 'completed' | 'in-progress' | 'upcoming';
  estimatedWeeks: number;
  deliverable: string;
  evidenceVerified: boolean;
  resources: LearningLink[];
}

export interface RoadmapPhase {
  id: string;
  phaseNumber: number;
  title: string;
  subtitle: string;
  timeframe: string;
  status: 'completed' | 'in-progress' | 'upcoming';
  progressPercent: number;
  milestones: RoadmapMilestone[];
}

export interface CareerPivotOption {
  roleId: string;
  roleTitle: string;
  category: string;
  description: string;
  pivotReadinessScore: number;
  frictionLevel: 'Low Friction Pivot' | 'Strategic Adjacent Pivot' | 'Growth Stretch Pivot';
  estimatedWeeksToPivot: number;
  sharedSkills: string[];
  bridgeSkills: string[];
  verifiedSharedCount: number;
  topCompanies: string[];
  whyItFits: string;
}

export interface CareerRoadmapData {
  targetRole: string;
  roleCategory: string;
  roleDescription: string;
  overallProgress: number;
  readinessScore: number;
  readinessLabel: string;
  matchedSkills: string[];
  missingSkills: string[];
  verifiedSkills: string[];
  estimatedWeeksRemaining: number;
  phases: RoadmapPhase[];
  pivots: CareerPivotOption[];
}

export function calculateCareerPivots(params: {
  currentTargetRole: string;
  userSkills: string[];
  verifiedSkills?: string[];
}): CareerPivotOption[] {
  const { currentTargetRole, userSkills, verifiedSkills = [] } = params;
  const normalizedTarget = (currentTargetRole || '').trim().toLowerCase();
  const userSkillLower = new Set(userSkills.map((s) => s.trim().toLowerCase()));
  const verifiedLower = new Set(verifiedSkills.map((s) => s.trim().toLowerCase()));

  const pivots: CareerPivotOption[] = [];
  const activeCatalogRole =
    IT_JOB_ROLES.find((r) => r.title.toLowerCase() === normalizedTarget) ||
    IT_JOB_ROLES.find(
      (r) =>
        normalizedTarget.length > 3 &&
        (normalizedTarget.includes(r.title.toLowerCase().split(' ')[0]) ||
          r.title.toLowerCase().includes(normalizedTarget.split(' ')[0]))
    );

  for (const role of IT_JOB_ROLES) {
    if (
      role.title.toLowerCase() === normalizedTarget ||
      (activeCatalogRole && role.id === activeCatalogRole.id)
    ) {
      continue;
    }

    const sharedSkills = role.skills.filter((skill) => userSkillLower.has(skill.toLowerCase()));
    const bridgeSkills = role.skills.filter((skill) => !userSkillLower.has(skill.toLowerCase()));
    const verifiedSharedCount = sharedSkills.filter((skill) => verifiedLower.has(skill.toLowerCase())).length;

    const readiness = calculateReadinessScore({
      matchedCount: sharedSkills.length,
      totalRequired: role.skills.length,
      verifiedEvidenceCount: verifiedSharedCount,
    });

    let frictionLevel: CareerPivotOption['frictionLevel'] = 'Growth Stretch Pivot';
    if (readiness.score >= 65 || bridgeSkills.length <= 2) {
      frictionLevel = 'Low Friction Pivot';
    } else if (readiness.score >= 42 || bridgeSkills.length <= 4) {
      frictionLevel = 'Strategic Adjacent Pivot';
    }

    const estimatedWeeksToPivot = Math.max(2, bridgeSkills.length * 2);

    // Find companies hiring for similar skills or role
    const matchingCompanies = Array.from(
      new Set(
        FEATURED_COMPANY_JOBS.filter((job) =>
          job.skills.some((s) => role.skills.map((cs) => cs.toLowerCase()).includes(s.toLowerCase()))
        ).map((j) => j.company)
      )
    ).slice(0, 4);

    const topCompanies = matchingCompanies.length > 0 ? matchingCompanies : ['Google', 'Microsoft', 'Zoho', 'Oracle'];

    const whyItFits =
      sharedSkills.length >= 2
        ? `Leverages your existing ${sharedSkills.slice(0, 3).join(', ')} foundation while requiring only ${bridgeSkills.length} bridge skill${bridgeSkills.length === 1 ? '' : 's'} (${bridgeSkills.slice(0, 2).join(', ') || 'advanced architecture'}) to unlock ${role.category} roles.`
        : `High-growth ${role.category} pathway where building ${bridgeSkills.slice(0, 3).join(', ')} opens up ${topCompanies.slice(0, 2).join(' & ')} opportunities.`;

    pivots.push({
      roleId: role.id,
      roleTitle: role.title,
      category: role.category,
      description: role.description,
      pivotReadinessScore: readiness.score,
      frictionLevel,
      estimatedWeeksToPivot,
      sharedSkills,
      bridgeSkills,
      verifiedSharedCount,
      topCompanies,
      whyItFits,
    });
  }

  return pivots.sort((a, b) => b.pivotReadinessScore - a.pivotReadinessScore);
}

export function buildCareerRoadmap(params: {
  targetRole: string;
  userSkills: string[];
  verifiedSkills?: string[];
  explicitMissingSkills?: string[];
  completedMilestoneIds?: string[];
}): CareerRoadmapData {
  const {
    targetRole,
    userSkills,
    verifiedSkills = [],
    explicitMissingSkills = [],
    completedMilestoneIds = [],
  } = params;

  const cleanRole = (targetRole || 'Full Stack Developer').trim();
  const matchedCatalogRole =
    IT_JOB_ROLES.find((r) => r.title.toLowerCase() === cleanRole.toLowerCase()) ||
    IT_JOB_ROLES.find(
      (r) =>
        cleanRole.toLowerCase().includes(r.title.toLowerCase().split(' ')[0]) ||
        r.title.toLowerCase().includes(cleanRole.toLowerCase().split(' ')[0])
    ) ||
    IT_JOB_ROLES[0];

  const userSkillLower = new Set(userSkills.map((s) => s.trim().toLowerCase()));
  const verifiedLower = new Set(verifiedSkills.map((s) => s.trim().toLowerCase()));
  const completedIdSet = new Set(completedMilestoneIds);

  // Combine role required skills + explicit missing skills from latest Job Match analysis
  const combinedRequired = Array.from(
    new Set([...matchedCatalogRole.skills, ...explicitMissingSkills.slice(0, 4)])
  );

  const matchedSkills = combinedRequired.filter((s) => userSkillLower.has(s.toLowerCase()));
  const missingSkills = combinedRequired.filter((s) => !userSkillLower.has(s.toLowerCase()));
  const verifiedMatched = combinedRequired.filter((s) => verifiedLower.has(s.toLowerCase()));

  // Ensure we always have meaningful skills for each phase
  const phase1Skills =
    matchedSkills.length > 0
      ? matchedSkills.slice(0, 3)
      : matchedCatalogRole.skills.slice(0, 2);

  const phase2Skills =
    missingSkills.length > 0
      ? missingSkills.slice(0, 3)
      : matchedCatalogRole.skills.slice(2, 5);

  const phase3Skills = [
    missingSkills[0] || matchedCatalogRole.skills[0] || 'System Design',
    'Unit Testing',
    'System Design',
  ];

  // Phase 1 Milestones: Core Foundations & Baseline Proof
  const phase1Milestones: RoadmapMilestone[] = phase1Skills.map((skill, idx) => {
    const id = `p1-m${idx}-${skill.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const isVerified = verifiedLower.has(skill.toLowerCase());
    const isMatched = userSkillLower.has(skill.toLowerCase());
    const isCompleted = completedIdSet.has(id) || isVerified || (isMatched && idx === 0);

    return {
      id,
      phaseIndex: 1,
      title: `Validate ${skill} Core Competency`,
      description: `Lock in your baseline ${skill} proficiency for ${cleanRole} by linking a code sample, project module, or certificate to your Evidence Vault.`,
      skill,
      category: 'Core Foundation',
      status: isCompleted ? 'completed' : isMatched ? 'in-progress' : 'upcoming',
      estimatedWeeks: 1,
      deliverable: `Verified ${skill} artifact or repository in Evidence Matrix`,
      evidenceVerified: isVerified,
      resources: buildSkillLearningLinks(skill, cleanRole),
    };
  });

  // Phase 2 Milestones: Closing Critical Skill Gaps
  const phase2Milestones: RoadmapMilestone[] = phase2Skills.map((skill, idx) => {
    const id = `p2-m${idx}-${skill.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const isVerified = verifiedLower.has(skill.toLowerCase());
    const isCompleted = completedIdSet.has(id) || isVerified;

    return {
      id,
      phaseIndex: 2,
      title: `Bridge ${skill} Gap for ${cleanRole}`,
      description: `Close the ${skill} requirement flagged in your skill gap analysis by building a working production feature and passing edge-case tests.`,
      skill,
      category: 'Skill Gap Closure',
      status: isCompleted ? 'completed' : idx === 0 ? 'in-progress' : 'upcoming',
      estimatedWeeks: 2,
      deliverable: `Feature module & implementation proof demonstrating ${skill}`,
      evidenceVerified: isVerified,
      resources: buildSkillLearningLinks(skill, cleanRole),
    };
  });

  // Phase 3 Milestones: Production Proof & Architecture Verification
  const phase3Milestones: RoadmapMilestone[] = [
    {
      id: `p3-m0-capstone`,
      phaseIndex: 3,
      title: `${cleanRole} Production Capstone & CI Verification`,
      description: `Combine ${phase1Skills[0] || 'Core Stack'} and ${phase2Skills[0] || 'Target Skill'} into a deployed end-to-end service with automated unit testing.`,
      skill: phase3Skills[0],
      category: 'Architecture & Proof',
      status: completedIdSet.has(`p3-m0-capstone`) || verifiedMatched.length >= 3 ? 'completed' : 'in-progress',
      estimatedWeeks: 2,
      deliverable: `Live deployed URL + Automated Test Suite output`,
      evidenceVerified: verifiedMatched.length >= 3,
      resources: buildSkillLearningLinks(phase3Skills[0], cleanRole),
    },
    {
      id: `p3-m1-sysdesign`,
      phaseIndex: 3,
      title: `System Architecture & Trade-Off Case Study`,
      description: `Write a technical architecture brief documenting scalability, API contracts, and latency trade-offs expected in ${cleanRole} technical rounds.`,
      skill: 'System Design',
      category: 'Architecture & Proof',
      status: completedIdSet.has(`p3-m1-sysdesign`) || verifiedLower.has('system design') ? 'completed' : 'upcoming',
      estimatedWeeks: 1,
      deliverable: `Architecture diagram & technical README uploaded to Attachments`,
      evidenceVerified: verifiedLower.has('system design'),
      resources: buildSkillLearningLinks('System Design', cleanRole),
    },
  ];

  // Phase 4 Milestones: Target Role Interview & Offer Readiness
  const phase4Milestones: RoadmapMilestone[] = [
    {
      id: `p4-m0-ats`,
      phaseIndex: 4,
      title: `ATS Résumé Alignment & 80%+ Readiness Lock-In`,
      description: `Update your résumé with quantified impact bullets covering ${combinedRequired.slice(0, 4).join(', ')} and run Job Match against tier-1 company offers.`,
      skill: cleanRole,
      category: 'Offer Readiness',
      status: completedIdSet.has(`p4-m0-ats`) ? 'completed' : 'upcoming',
      estimatedWeeks: 1,
      deliverable: `80%+ Job Match Readiness Score on target ${cleanRole} offer`,
      evidenceVerified: false,
      resources: buildSkillLearningLinks(cleanRole, cleanRole),
    },
    {
      id: `p4-m1-interview`,
      phaseIndex: 4,
      title: `Technical Deep-Dive & Behavioral Story Bank`,
      description: `Prepare walkthroughs of your verified evidence items so you can defend your ${phase1Skills[0] || 'engineering'} and ${phase2Skills[0] || 'architecture'} decisions live.`,
      skill: 'Technical Interview',
      category: 'Offer Readiness',
      status: completedIdSet.has(`p4-m1-interview`) ? 'completed' : 'upcoming',
      estimatedWeeks: 1,
      deliverable: `Completed mock technical defense & company application submission`,
      evidenceVerified: false,
      resources: buildSkillLearningLinks('System Design', cleanRole),
    },
  ];

  const rawPhases: Omit<RoadmapPhase, 'status' | 'progressPercent'>[] = [
    {
      id: 'phase-1',
      phaseNumber: 1,
      title: 'Phase 1: Core Foundations & Verified Baseline',
      subtitle: 'Audit existing strengths and attach verifiable proof artifacts',
      timeframe: 'Weeks 1–2',
      milestones: phase1Milestones,
    },
    {
      id: 'phase-2',
      phaseNumber: 2,
      title: 'Phase 2: Closing Critical Skill Gaps',
      subtitle: `Bridge high-impact missing requirements for ${cleanRole}`,
      timeframe: 'Weeks 3–6',
      milestones: phase2Milestones,
    },
    {
      id: 'phase-3',
      phaseNumber: 3,
      title: 'Phase 3: Production Proof & Architecture Verification',
      subtitle: 'Convert isolated skills into production-grade system evidence',
      timeframe: 'Weeks 7–9',
      milestones: phase3Milestones,
    },
    {
      id: 'phase-4',
      phaseNumber: 4,
      title: 'Phase 4: Target Role Interview & Offer Readiness',
      subtitle: 'Final ATS calibration, portfolio defense, and company applications',
      timeframe: 'Weeks 10–12',
      milestones: phase4Milestones,
    },
  ];

  const phases: RoadmapPhase[] = rawPhases.map((p) => {
    const total = p.milestones.length;
    const completed = p.milestones.filter((m) => m.status === 'completed').length;
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
    let status: RoadmapPhase['status'] = 'upcoming';
    if (progressPercent === 100) {
      status = 'completed';
    } else if (progressPercent > 0 || p.milestones.some((m) => m.status === 'in-progress')) {
      status = 'in-progress';
    }
    return {
      ...p,
      status,
      progressPercent,
    };
  });

  const allMilestones = phases.flatMap((p) => p.milestones);
  const completedCount = allMilestones.filter((m) => m.status === 'completed').length;
  const overallProgress =
    allMilestones.length > 0 ? Math.round((completedCount / allMilestones.length) * 100) : 0;

  const estimatedWeeksRemaining = allMilestones
    .filter((m) => m.status !== 'completed')
    .reduce((sum, m) => sum + m.estimatedWeeks, 0);

  const readiness = calculateReadinessScore({
    matchedCount: matchedSkills.length + Math.floor(completedCount / 2),
    totalRequired: Math.max(combinedRequired.length, 4),
    verifiedEvidenceCount: verifiedMatched.length + completedIdSet.size,
  });

  const pivots = calculateCareerPivots({
    currentTargetRole: cleanRole,
    userSkills,
    verifiedSkills,
  });

  return {
    targetRole: cleanRole,
    roleCategory: matchedCatalogRole.category,
    roleDescription: matchedCatalogRole.description,
    overallProgress,
    readinessScore: readiness.score,
    readinessLabel: readiness.score >= 80 ? 'Offer Ready' : readiness.score >= 60 ? 'Competitive' : 'Developing',
    matchedSkills,
    missingSkills,
    verifiedSkills: verifiedMatched,
    estimatedWeeksRemaining,
    phases,
    pivots,
  };
}

export interface GovernmentSectorTrack {
  id: string;
  commission: string;
  shortCode: string;
  examTitle: string;
  postTitle: string;
  groupCategory:
    | 'UPSC & Civil Services'
    | 'SSC & Central Ministries'
    | 'Space & Defence R&D'
    | 'Digital India & e-Governance'
    | 'Banking & Financial Regulators'
    | 'Railways & Maharatna PSUs';
  payScale: string;
  eligibility: string;
  selectionStages: string[];
  requiredSkills: string[];
  syllabusMapping: string;
  officialPortalUrl: string;
  accentBg: string;
}

export interface MappedGovernmentSectorTrack extends GovernmentSectorTrack {
  matchedSkills: string[];
  missingSkills: string[];
  verifiedCount: number;
  readinessScore: number;
  readinessStatus: 'High Fit · Exam Ready' | 'Strong Technical Base' | 'Bridge Syllabus Needed';
}

export const GOVERNMENT_SECTOR_CATALOG: GovernmentSectorTrack[] = [
  {
    id: 'map-upsc-cse',
    commission: 'UPSC',
    shortCode: 'UPSC CSE / IAS / IFS',
    examTitle: 'UPSC Civil Services Examination (CSE)',
    postTitle: 'IAS / IPS / IFS & Central Civil Services Group-A Officer',
    groupCategory: 'UPSC & Civil Services',
    payScale: '7th CPC Pay Level 10–14 (₹56,100 – ₹2,50,000)',
    eligibility: 'Any Bachelor Degree (Age 21–32 yrs · Relaxation as per Govt norms)',
    selectionStages: ['Prelims (GS Paper-I + CSAT Aptitude)', 'Mains (9 Descriptive Papers)', 'UPSC Personality Interview (275 Marks)'],
    requiredSkills: ['General Studies & Polity', 'Public Administration', 'Quantitative Aptitude', 'Logical Reasoning', 'Data Interpretation', 'Cybersecurity'],
    syllabusMapping: 'Maps CSAT Quantitative/Reasoning + Technology Policy, Internal Security (Cybersecurity), and e-Governance to GS Paper-II & III.',
    officialPortalUrl: 'https://upsc.gov.in/',
    accentBg: '#FFD88D',
  },
  {
    id: 'map-upsc-ese',
    commission: 'UPSC',
    shortCode: 'UPSC ESE / IES',
    examTitle: 'UPSC Engineering Services Examination (IES / ESE)',
    postTitle: 'Class-I Assistant Executive Engineer / Director (E&T / IT Cadre)',
    groupCategory: 'UPSC & Civil Services',
    payScale: '7th CPC Pay Level 10 (₹56,100 – ₹1,77,500)',
    eligibility: 'B.E. / B.Tech in Engineering (Age 21–30 yrs)',
    selectionStages: ['Stage-I Prelims (GS & Engineering Aptitude + Tech)', 'Stage-II Mains (Conventional Engineering)', 'Personality Test'],
    requiredSkills: ['Computer Networks', 'Operating Systems', 'Data Structures & Algorithms', 'System Design', 'C++', 'General Studies & Polity', 'Quantitative Aptitude'],
    syllabusMapping: 'Directly maps core Computer Networks, OS, Architecture, C++, and Engineering Aptitude to Paper-I & II.',
    officialPortalUrl: 'https://upsconline.nic.in/',
    accentBg: '#FFBC99',
  },
  {
    id: 'map-ssc-cgl',
    commission: 'SSC',
    shortCode: 'SSC CGL (Tier I & II)',
    examTitle: 'SSC Combined Graduate Level Examination (CGL)',
    postTitle: 'Assistant Section Officer (ASO - CSS/MEA), Income Tax Inspector & JSO',
    groupCategory: 'SSC & Central Ministries',
    payScale: '7th CPC Pay Level 6–8 (₹35,400 – ₹1,51,100)',
    eligibility: 'Any Bachelor Degree (Age 18–32 yrs)',
    selectionStages: ['Tier-I CBT (Quant, Reasoning, English, GS)', 'Tier-II CBT (Math, Reasoning, GS, Computer Knowledge & DEST)', 'Merit Allocation'],
    requiredSkills: ['Quantitative Aptitude', 'Logical Reasoning', 'Data Interpretation', 'General Studies & Polity', 'SQL', 'Computer Networks'],
    syllabusMapping: 'Maps Quantitative Aptitude, Data Interpretation, Logical Reasoning, and Tier-II Module-I Computer Proficiency (Networking, DBMS, Cyber Safety).',
    officialPortalUrl: 'https://ssc.gov.in/',
    accentBg: '#B5E4CA',
  },
  {
    id: 'map-ssc-imd-je',
    commission: 'SSC',
    shortCode: 'SSC IMD / SSC JE',
    examTitle: 'SSC Scientific Assistant (IMD) & Junior Engineer Examination',
    postTitle: 'Scientific Assistant (India Meteorological Dept) & Junior Engineer',
    groupCategory: 'SSC & Central Ministries',
    payScale: '7th CPC Pay Level 6 (₹35,400 – ₹1,12,400)',
    eligibility: 'B.E. / B.Tech / B.Sc (CS/IT) / BCA / Engineering Diploma (Up to 30 yrs)',
    selectionStages: ['Paper-I (General Intelligence, Quant, Awareness)', 'Paper-II (100 Marks Computer Science / IT / Engineering)', 'Document Verification'],
    requiredSkills: ['Operating Systems', 'DBMS', 'SQL', 'Computer Networks', 'Python', 'C++', 'Quantitative Aptitude', 'Logical Reasoning'],
    syllabusMapping: 'Directly maps Operating Systems, DBMS/SQL, Computer Networks, C++/Python, and GIS/Data processing to Paper-II.',
    officialPortalUrl: 'https://ssc.gov.in/',
    accentBg: '#B1E5FC',
  },
  {
    id: 'map-isro-sc',
    commission: 'ISRO',
    shortCode: 'ISRO ICRB Scientist-SC',
    examTitle: 'ISRO Centralised Recruitment Board (ICRB) Scientist/Engineer',
    postTitle: 'Scientist / Engineer "SC" (Computer Science & Mission Avionics)',
    groupCategory: 'Space & Defence R&D',
    payScale: '7th CPC Pay Level 10 (₹56,100 Basic + ~₹95,000/mo Gross)',
    eligibility: 'B.E. / B.Tech in CSE / IT / ECE with minimum 65% marks (CGPA 6.84/10)',
    selectionStages: ['Written CBT (80 Core CS Questions + 15 Engineering Aptitude)', 'ISRO Technical Panel Interview (100 Marks)'],
    requiredSkills: ['C++', 'Python', 'Data Structures & Algorithms', 'Operating Systems', 'DBMS', 'Computer Networks', 'Linux', 'Unit Testing'],
    syllabusMapping: '100% alignment with B.Tech CSE core subjects: Algorithms, OS, DBMS, Computer Networks, Compiler/Linux, and Software Testing.',
    officialPortalUrl: 'https://www.isro.gov.in/Careers.html',
    accentBg: '#CABDFF',
  },
  {
    id: 'map-drdo-rac',
    commission: 'DRDO',
    shortCode: 'DRDO RAC / CEPTAM',
    examTitle: 'DRDO Scientist "B" (RAC) & CEPTAM Senior Technical Assistant',
    postTitle: 'Scientist "B" (Defence AI / Cyber / Radar) & STA-B',
    groupCategory: 'Space & Defence R&D',
    payScale: '7th CPC Pay Level 10 (₹56,100 – ₹1,77,500 + Defence Allowances)',
    eligibility: 'First Class B.E. / B.Tech in CS/IT + Valid GATE Score (or CEPTAM CBT for STA-B)',
    selectionStages: ['GATE Score Shortlisting / Descriptive Engineering Exam', 'RAC Technical & Systems Defense Interview'],
    requiredSkills: ['Python', 'C++', 'Machine Learning', 'Cybersecurity', 'Data Structures & Algorithms', 'Operating Systems', 'Linux', 'DBMS'],
    syllabusMapping: 'Maps AI/ML, Cybersecurity, C++/Python, Linux Systems, and Core Computer Science directly to DRDO laboratory divisions (CAIR, SAG, DYSL-AI).',
    officialPortalUrl: 'https://rac.gov.in/',
    accentBg: '#FFD88D',
  },
  {
    id: 'map-nic-meity',
    commission: 'NIC / MeitY',
    shortCode: 'NIC Scientist-B & SO',
    examTitle: 'NIC / NIELIT Scientist-"B" & Scientific Officer Recruitment',
    postTitle: 'Scientist-"B" & Scientific/Technical Assistant-A (Digital India)',
    groupCategory: 'Digital India & e-Governance',
    payScale: '7th CPC Pay Level 10 (₹56,100 – ₹1,77,500)',
    eligibility: 'B.E. / B.Tech / M.E. / M.Tech / MCA in Computer Science or IT',
    selectionStages: ['NIELIT Online CBT (65% Technical CS/Web/Security + 35% Generic Aptitude)', 'Personal Technical Interview'],
    requiredSkills: ['Java', 'Spring Boot', 'React', 'SQL', 'REST APIs', 'Cybersecurity', 'Computer Networks', 'Cloud Computing'],
    syllabusMapping: 'High overlap with Full-Stack & Cloud skills: Web Technologies (React/HTML/JS), Java/Spring, SQL Databases, Cloud, and Network Security.',
    officialPortalUrl: 'https://www.nic.in/',
    accentBg: '#B5E4CA',
  },
  {
    id: 'map-rbi-gradeb',
    commission: 'RBI',
    shortCode: 'RBI Grade B (Gen / DSIM)',
    examTitle: 'Reserve Bank of India Officer Grade "B" (DR - General & DSIM)',
    postTitle: 'Manager (Grade B) — Central Banking, FinTech & Data Analytics',
    groupCategory: 'Banking & Financial Regulators',
    payScale: 'RBI Grade B Pay Scale (₹55,200 Basic · ~₹1.16 Lakh/mo Gross)',
    eligibility: 'Bachelor / Master Degree (Min 60% marks; CS/Stats/Data Science for DSIM)',
    selectionStages: ['Phase-I Objective CBT', 'Phase-II (Economic/Social Issues, Finance/Data Analytics & Descriptive)', 'RBI Board Interview'],
    requiredSkills: ['Data Interpretation', 'Quantitative Aptitude', 'Logical Reasoning', 'Python', 'SQL', 'Machine Learning', 'General Studies & Polity'],
    syllabusMapping: 'Maps Data Interpretation, Python/SQL Statistical Modeling, Machine Learning, and Quantitative Reasoning to RBI Grade B Phase-I & II.',
    officialPortalUrl: 'https://opportunities.rbi.org.in/',
    accentBg: '#B1E5FC',
  },
  {
    id: 'map-ibps-sbi-so',
    commission: 'IBPS / SBI',
    shortCode: 'IBPS SO (IT) & SBI SCO',
    examTitle: 'IBPS Specialist Officer (IT Officer Scale-I) & SBI Specialist Cadre',
    postTitle: 'IT Officer (Scale-I/II), System Officer & Cloud/Data Specialist',
    groupCategory: 'Banking & Financial Regulators',
    payScale: 'IBA Officer Scale-I/II (₹48,480 – ₹85,920 + Banking Perks)',
    eligibility: '4-Year Engineering/Technology Degree in CS, IT, ECE, or MCA',
    selectionStages: ['Prelims (Reasoning, Quant, English)', 'Mains (60 Professional IT Knowledge Questions)', 'Common IBPS Interview'],
    requiredSkills: ['DBMS', 'SQL', 'Computer Networks', 'Operating Systems', 'Cybersecurity', 'Java', 'REST APIs', 'Quantitative Aptitude'],
    syllabusMapping: 'Directly tests DBMS & SQL queries, Data Communication & Networking, InfoSec, OS, Software Engineering, and Java/Web fundamentals.',
    officialPortalUrl: 'https://www.ibps.in/',
    accentBg: '#FFBC99',
  },
  {
    id: 'map-rrb-gate-psu',
    commission: 'RRB & GATE PSUs',
    shortCode: 'RRB JE/NTPC & Maharatna PSUs',
    examTitle: 'Indian Railways (RRB JE/NTPC) & GATE Maharatna PSU Recruitment',
    postTitle: 'Executive Trainee (ONGC, NTPC, BHEL, IOCL, PGCIL) & RRB JE (IT)',
    groupCategory: 'Railways & Maharatna PSUs',
    payScale: 'PSU IDA Scale (₹50,000 – ₹1,80,000 · CTC ₹15L–₹22L) / 7th CPC Level 6',
    eligibility: 'B.E. / B.Tech in CS/IT (for GATE PSUs & RRB JE IT) or Any Graduate (RRB NTPC)',
    selectionStages: ['GATE CS Score / RRB CBT Stage-I & II', 'Group Discussion & Technical Interview', 'Medical & Document Verification'],
    requiredSkills: ['Data Structures & Algorithms', 'DBMS', 'Operating Systems', 'Computer Networks', 'C++', 'SQL', 'Quantitative Aptitude', 'Logical Reasoning'],
    syllabusMapping: 'Combines GATE Computer Science core subjects (DSA, DBMS, OS, CN, C++) with RRB Quantitative & Analytical Aptitude.',
    officialPortalUrl: 'https://indianrailways.gov.in/',
    accentBg: '#CABDFF',
  },
];

export function mapCandidateToGovernmentSectors(params: {
  userSkills: string[];
  verifiedSkills?: string[];
}): MappedGovernmentSectorTrack[] {
  const { userSkills = [], verifiedSkills = [] } = params;
  const userSkillLower = new Set(userSkills.map((s) => s.trim().toLowerCase()));
  const verifiedLower = new Set(verifiedSkills.map((s) => s.trim().toLowerCase()));

  // Also infer foundational overlap (e.g. if user has SQL -> DBMS familiarity; Python/Java/TypeScript -> Logical Reasoning; Linux -> Operating Systems)
  const inferredSkills = new Set<string>(userSkillLower);
  if (userSkillLower.has('sql') || userSkillLower.has('mongodb')) {
    inferredSkills.add('dbms');
    inferredSkills.add('data interpretation');
  }
  if (userSkillLower.has('linux') || userSkillLower.has('docker') || userSkillLower.has('kubernetes')) {
    inferredSkills.add('operating systems');
    inferredSkills.add('computer networks');
  }
  if (userSkillLower.has('java') || userSkillLower.has('c++') || userSkillLower.has('python') || userSkillLower.has('typescript')) {
    inferredSkills.add('data structures & algorithms');
    inferredSkills.add('logical reasoning');
  }
  if (userSkillLower.has('machine learning') || userSkillLower.has('python') || userSkillLower.has('sql')) {
    inferredSkills.add('quantitative aptitude');
    inferredSkills.add('data interpretation');
  }

  return GOVERNMENT_SECTOR_CATALOG.map((track) => {
    const matchedSkills = track.requiredSkills.filter((req) =>
      inferredSkills.has(req.toLowerCase())
    );
    const missingSkills = track.requiredSkills.filter(
      (req) => !inferredSkills.has(req.toLowerCase())
    );
    const verifiedCount = matchedSkills.filter((req) =>
      verifiedLower.has(req.toLowerCase())
    ).length;

    const readiness = calculateReadinessScore({
      matchedCount: matchedSkills.length,
      totalRequired: track.requiredSkills.length,
      verifiedEvidenceCount: Math.max(verifiedCount, matchedSkills.length > 2 ? 1 : 0),
    });

    let readinessStatus: MappedGovernmentSectorTrack['readinessStatus'] =
      'Bridge Syllabus Needed';
    if (readiness.score >= 68) {
      readinessStatus = 'High Fit · Exam Ready';
    } else if (readiness.score >= 45) {
      readinessStatus = 'Strong Technical Base';
    }

    return {
      ...track,
      matchedSkills,
      missingSkills,
      verifiedCount,
      readinessScore: readiness.score,
      readinessStatus,
    };
  }).sort((a, b) => b.readinessScore - a.readinessScore);
}

export interface ProofEvidenceInput {
  id?: number | string;
  skill?: string;
  type?: string;
  title?: string;
  url?: string;
  attachment_name?: string;
  extracted_summary?: string;
  [key: string]: unknown;
}

export type ProofStrengthTier = 'strong' | 'moderate' | 'weak';

/**
 * Scores a single evidence artifact into 'strong' | 'moderate' | 'weak':
 * - Strong: Code repository (GitHub/GitLab/Bitbucket) or live deployed URL, or project/repo type with URL
 * - Moderate: Certificate, credential link, or uploaded verification document
 * - Weak: Self-reported claim without external link or verification file
 */
export function scoreProofStrength(item: ProofEvidenceInput): ProofStrengthTier {
  const typeLower = (item.type || '').trim().toLowerCase();
  const urlLower = (item.url || '').trim().toLowerCase();
  const titleLower = (item.title || '').trim().toLowerCase();
  const hasUrl = urlLower.startsWith('http://') || urlLower.startsWith('https://');
  const hasAttachment = Boolean((item.attachment_name || '').trim().length > 0);

  const isCodeOrDeployedUrl =
    hasUrl &&
    (urlLower.includes('github.com') ||
      urlLower.includes('gitlab.com') ||
      urlLower.includes('bitbucket.org') ||
      urlLower.includes('vercel.app') ||
      urlLower.includes('netlify.app') ||
      urlLower.includes('run.app') ||
      urlLower.includes('render.com') ||
      urlLower.includes('railway.app') ||
      urlLower.includes('pages.dev') ||
      typeLower.includes('github') ||
      typeLower === 'project' ||
      typeLower === 'deployment' ||
      typeLower === 'repo');

  if (isCodeOrDeployedUrl) {
    return 'strong';
  }

  const isCertificateOrVerifiedDoc =
    typeLower.includes('cert') ||
    typeLower.includes('credential') ||
    hasAttachment ||
    (hasUrl &&
      (urlLower.includes('coursera.org') ||
        urlLower.includes('udemy.com') ||
        urlLower.includes('credly.com') ||
        urlLower.includes('nptel') ||
        urlLower.includes('linkedin.com/learning') ||
        urlLower.includes('aws.amazon.com'))) ||
    titleLower.includes('certificate') ||
    titleLower.includes('certified');

  if (isCertificateOrVerifiedDoc) {
    return 'moderate';
  }

  if (hasUrl && (typeLower.includes('portfolio') || typeLower.includes('demo'))) {
    return 'strong';
  }

  if (hasUrl) {
    return 'moderate';
  }

  return 'weak';
}

export interface EvaluatedSkillProof {
  skill: string;
  overallTier: 'strong' | 'moderate' | 'weak' | 'none';
  meterPercent: number;
  tierLabel: string;
  tierDescription: string;
  items: Array<ProofEvidenceInput & { strength: ProofStrengthTier }>;
}

export function evaluateSkillProofSummary(
  skill: string,
  evidenceList: ProofEvidenceInput[]
): EvaluatedSkillProof {
  const target = (skill || '').trim().toLowerCase();
  const matching = (evidenceList || [])
    .filter((ev) => {
      const evSkill = (ev.skill || '').trim().toLowerCase();
      if (!evSkill || !target) return false;
      return evSkill === target || evSkill.includes(target) || target.includes(evSkill);
    })
    .map((ev) => ({
      ...ev,
      strength: scoreProofStrength(ev),
    }));

  if (matching.length === 0) {
    return {
      skill,
      overallTier: 'none',
      meterPercent: 12,
      tierLabel: 'Self-Reported / Unverified',
      tierDescription:
        'Listed on résumé or target role, but no repository, live deployment, or certificate is linked yet.',
      items: [],
    };
  }

  const hasStrong = matching.some((m) => m.strength === 'strong');
  const hasModerate = matching.some((m) => m.strength === 'moderate');

  if (hasStrong) {
    return {
      skill,
      overallTier: 'strong',
      meterPercent: 100,
      tierLabel: 'Strong (Code Repo / Live Link)',
      tierDescription:
        'Backed by a public code repository or live deployment URL that technical reviewers can inspect directly.',
      items: matching,
    };
  }

  if (hasModerate) {
    return {
      skill,
      overallTier: 'moderate',
      meterPercent: 68,
      tierLabel: 'Moderate (Certificate / Document)',
      tierDescription:
        'Verified via course certificate or uploaded document. Add a GitHub repo or deployed demo to reach Strong.',
      items: matching,
    };
  }

  return {
    skill,
    overallTier: 'weak',
    meterPercent: 35,
    tierLabel: 'Weak (Self-Reported Note)',
    tierDescription:
      'Recorded as a self-reported note without an external link. Attach a repository or live URL to upgrade.',
    items: matching,
  };
}

export interface DemoPresetDefinition {
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
    extracted_summary: string;
  }>;
}

export const DEMO_PROFILES: DemoPresetDefinition[] = [
  {
    id: 'senior-fullstack',
    label: 'Senior Full-Stack Engineer',
    badge: '89% Ready',
    name: 'Arjun Mehta',
    title: 'Senior Full-Stack Engineer',
    role: 'Job seeker',
    location: 'Bengaluru / Remote',
    education: 'B.Tech Computer Science, IIT Madras',
    skills_text:
      'React, TypeScript, Node.js, SQL, Docker, AWS, System Design, REST APIs, Git, Unit Testing, CI/CD',
    resume_text: `Arjun Mehta
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
React, TypeScript, Node.js, SQL, Docker, AWS, System Design, REST APIs, Git, Unit Testing, CI/CD`,
    targetJobTitle: 'Software Engineer — Full Stack & Cloud',
    targetCompany: 'Google',
    targetJobDescription:
      'Software Engineer — Full Stack & Cloud at Google (Bengaluru / Hyderabad)\n\nDesign, develop, test, deploy, and maintain large-scale distributed web applications and cloud services at Google. Required Skills: React, TypeScript, Node.js, Python, SQL, System Design, Docker, AWS, Unit Testing, Git.',
    evidence: [
      {
        skill: 'React',
        type: 'GitHub link',
        title: 'Realtime Telemetry Dashboard (React 19 + TypeScript)',
        url: 'https://github.com/arjun-mehta/telemetry-cloud-ui',
        extracted_summary: 'Production React + TypeScript monorepo with accessible bento components and Playwright E2E suite.',
      },
      {
        skill: 'TypeScript',
        type: 'project',
        title: 'Type-Safe RPC & Schema Validator Library',
        url: 'https://github.com/arjun-mehta/ts-rpc-schema',
        extracted_summary: 'Zero-dependency TypeScript validation package with 100% strict type coverage.',
      },
      {
        skill: 'Node.js',
        type: 'GitHub link',
        title: 'High-Throughput Event Ingestion Service (Node.js + SQL)',
        url: 'https://github.com/arjun-mehta/event-ingestor-node',
        extracted_summary: 'Express & PostgreSQL worker service with rate limiting, idempotency keys, and integration tests.',
      },
      {
        skill: 'Docker',
        type: 'certificate',
        title: 'AWS & Container Architecture Professional Certificate',
        url: 'https://www.coursera.org/account/accomplishments/verify/DEMO-DOCKER-AWS',
        extracted_summary: 'Verified credential covering multi-stage Docker builds, ECS orchestration, and CI/CD pipelines.',
      },
      {
        skill: 'Unit Testing',
        type: 'GitHub link',
        title: 'Automated API & UI Regression Suite (node:test + Playwright)',
        url: 'https://github.com/arjun-mehta/telemetry-cloud-ui/actions',
        extracted_summary: 'Continuous integration test suite executing 85 unit and browser checks on every pull request.',
      },
    ],
  },
  {
    id: 'upsc-tech-officer',
    label: 'UPSC Tech Officer',
    badge: '86% Ready',
    name: 'Priya Sharma',
    title: 'NIC Scientist-"B" & UPSC Engineering Cadre',
    role: 'Job seeker',
    location: 'New Delhi / All-India Cadre',
    education: 'B.E. Computer Science & Engineering, NIT Trichy',
    skills_text:
      'Computer Networks, Operating Systems, DBMS, Data Structures & Algorithms, Cybersecurity, SQL, Python, Java, General Studies & Polity, Quantitative Aptitude, Logical Reasoning',
    resume_text: `Priya Sharma
NIC Scientist-"B" & UPSC Technical Officer Aspirant | New Delhi | priya.sharma@example.com

SUMMARY:
Computer Science graduate with strong command over core GATE/NIC engineering subjects (Computer Networks, Operating Systems, DBMS, DSA, Cybersecurity) and UPSC/SSC General Studies, Quantitative Aptitude, and Public Digital Infrastructure (India Stack).

TECHNICAL & PUBLIC SECTOR PROJECTS:
1. Zero-Trust e-Governance Document Verification Portal (Python, SQL, Cybersecurity)
- Built cryptographic SHA-256 document verification workflow modelled on DigiLocker & India Stack APIs.
- Implemented role-based access control, audit logging, and OWASP security hardening.

2. Distributed Packet Analyzer & Network Intrusion Detector (C++, Python, Computer Networks)
- Engineered TCP/IP packet inspection tool for anomaly detection and network throughput benchmarking.

ACHIEVEMENTS & EXAMS:
- GATE Computer Science & IT: 99.1 Percentile (All India Rank Top 1%)
- Completed UPSC CSE / NIC Scientist-B Core Technical & General Studies Syllabus

SKILLS:
Computer Networks, Operating Systems, DBMS, Data Structures & Algorithms, Cybersecurity, SQL, Python, Java, General Studies & Polity, Quantitative Aptitude, Logical Reasoning`,
    targetJobTitle: 'NIC Scientist-"B" & UPSC Digital Governance Officer',
    targetCompany: 'NIC / MeitY & UPSC',
    targetJobDescription:
      'NIC Scientist-"B" (Group-A Gazetted) at National Informatics Centre (MeitY) & UPSC Technical Cadre\nPay Scale: 7th CPC Level 10 (₹56,100 – ₹1,77,500)\nSelection Stages: Prelims Written CBT > Descriptive Technical Mains > Directorate Interview\nRequired Skills: Computer Networks, Operating Systems, DBMS, Data Structures & Algorithms, Cybersecurity, SQL, Python, General Studies & Polity, Quantitative Aptitude, Logical Reasoning.',
    evidence: [
      {
        skill: 'Cybersecurity',
        type: 'GitHub link',
        title: 'DigiLocker-Style Cryptographic Document Verifier',
        url: 'https://github.com/priya-sharma/egov-doc-verifier',
        extracted_summary: 'SHA-256 digital signature verification and OWASP-hardened REST service for public sector records.',
      },
      {
        skill: 'Computer Networks',
        type: 'GitHub link',
        title: 'TCP/IP Packet Telemetry & Intrusion Detection Lab',
        url: 'https://github.com/priya-sharma/net-packet-inspector',
        extracted_summary: 'Custom network protocol analyzer implementing sliding window, congestion control, and firewall rules.',
      },
      {
        skill: 'Data Structures & Algorithms',
        type: 'GitHub link',
        title: '350+ Graph, DP & System Algorithms Repository',
        url: 'https://github.com/priya-sharma/gate-upsc-dsa-vault',
        extracted_summary: 'Benchmark implementations of shortest-path routing, B-Trees, and concurrency primitives.',
      },
      {
        skill: 'DBMS',
        type: 'certificate',
        title: 'NPTEL IIT Kharagpur — Database Management Systems Elite Gold',
        url: 'https://nptel.ac.in/noc/Ecertificate/?q=DEMO-NPTEL-DBMS',
        extracted_summary: 'Proctored certification covering B+ Trees, ACID transaction isolation, and SQL query optimization.',
      },
      {
        skill: 'General Studies & Polity',
        type: 'certificate',
        title: 'Digital India & Public Policy Governance Capstone',
        url: 'https://www.coursera.org/verify/DEMO-PUBLIC-POLICY',
        extracted_summary: 'Comprehensive policy brief on Digital Personal Data Protection (DPDP) Act and e-Governance.',
      },
    ],
  },
  {
    id: 'aanya-frontend',
    label: 'Frontend Dev (Aanya)',
    badge: '78% Ready',
    name: 'Aanya Kumar',
    title: 'Junior Frontend Developer',
    role: 'Student',
    location: 'Bengaluru / Remote',
    education: 'B.Tech Computer Science, 2026',
    skills_text:
      'React, TypeScript, JavaScript, HTML/CSS, Git, Figma, REST APIs, Unit Testing',
    resume_text: `Aanya Kumar
Junior Frontend Developer | Bengaluru / Remote | aanya@example.com

SUMMARY:
Enthusiastic front-end developer passionate about creating accessible, responsive React & TypeScript web applications with clean component architecture and testable code.

PROJECTS:
1. Responsive React & TypeScript Design System
- Developed interactive client application using React 19, TypeScript, and modern CSS Grid/Flexbox.
- Published clean open-source codebase on GitHub with modular component design and unit tests.
- Integrated REST API data feeds with optimistic UI updates.

2. Git-based Collaborative Task Tracker
- Implemented branching workflows, issue tracking, and peer reviews using Git and GitHub.

SKILLS:
React, TypeScript, JavaScript, HTML/CSS, Git, Figma, REST APIs, Unit Testing`,
    targetJobTitle: 'Frontend Developer (React / TypeScript)',
    targetCompany: 'Zoho',
    targetJobDescription:
      'Frontend Developer — Web & UI Engineering at Zoho (Chennai / Tenkasi / Coimbatore)\n\nCraft fast, accessible, and scalable web applications for Zoho’s global SaaS suite. Required Skills: React, TypeScript, JavaScript, HTML/CSS, REST APIs, Git, Unit Testing, Figma.',
    evidence: [
      {
        skill: 'React',
        type: 'GitHub link',
        title: 'Interactive React 19 Portfolio & Component Showcase',
        url: 'https://github.com/aanya-kumar/react-portfolio-showcase',
        extracted_summary: 'Responsive React + TypeScript application with keyboard navigation and dark mode support.',
      },
      {
        skill: 'HTML/CSS',
        type: 'project',
        title: 'Accessible Design System & Flex/Grid Layouts',
        url: 'https://github.com/aanya-kumar/accessible-design-system',
        extracted_summary: 'WCAG AA compliant design tokens and responsive bento layouts.',
      },
      {
        skill: 'Git',
        type: 'GitHub link',
        title: 'GitHub Profile & Verified Open-Source Commits',
        url: 'https://github.com/aanya-kumar',
        extracted_summary: 'Active commit history, pull request reviews, and GitHub Actions workflows.',
      },
    ],
  },
];



