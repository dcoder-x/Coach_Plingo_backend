import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const languages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
];

const professions = [
  { slug: 'software_engineer', name: 'Software Engineer' },
  { slug: 'product_manager', name: 'Product Manager' },
  { slug: 'data_analyst', name: 'Data Analyst' },
  { slug: 'marketing_manager', name: 'Marketing Manager' },
  { slug: 'sales_representative', name: 'Sales Representative' },
  { slug: 'nurse', name: 'Nurse' },
  { slug: 'doctor', name: 'Doctor' },
  { slug: 'teacher', name: 'Teacher' },
  { slug: 'lawyer', name: 'Lawyer' },
  { slug: 'entrepreneur', name: 'Entrepreneur' },
];

type SeedSubcategory = {
  name: string;
  description: string;
  position: number;
};

const professionSubcategories: Record<string, SeedSubcategory[]> = {
  software_engineer: [
    {
      name: 'System Design & Architecture',
      description: 'Vocabulary for architecture discussions, scalability, and trade-offs.',
      position: 1,
    },
    {
      name: 'Backend APIs & Services',
      description: 'Terms for API contracts, services, and integration patterns.',
      position: 2,
    },
    {
      name: 'Frontend Delivery',
      description: 'Language for UI implementation, accessibility, and performance.',
      position: 3,
    },
    {
      name: 'Quality & Testing',
      description: 'Terms for unit, integration, regression, and release quality.',
      position: 4,
    },
    {
      name: 'DevOps & Reliability',
      description: 'Operational vocabulary for CI/CD, observability, and incident response.',
      position: 5,
    },
  ],
  product_manager: [
    {
      name: 'Discovery & User Research',
      description: 'Vocabulary for interviews, insights, and problem validation.',
      position: 1,
    },
    {
      name: 'Roadmapping & Prioritization',
      description: 'Terms used in planning, sequencing, and trade-off decisions.',
      position: 2,
    },
    {
      name: 'Product Analytics',
      description: 'Language for metrics, funnels, and experiment analysis.',
      position: 3,
    },
    {
      name: 'Stakeholder Communication',
      description: 'Vocabulary for alignment, updates, and expectation management.',
      position: 4,
    },
    {
      name: 'Launch & Growth',
      description: 'Terms for launches, adoption, retention, and optimization.',
      position: 5,
    },
  ],
  data_analyst: [
    {
      name: 'Data Preparation',
      description: 'Vocabulary for cleaning, transformations, and data quality.',
      position: 1,
    },
    {
      name: 'Descriptive Analytics',
      description: 'Language for trends, slices, and comparative reporting.',
      position: 2,
    },
    {
      name: 'Statistical Reasoning',
      description: 'Terms for confidence, significance, and hypothesis testing.',
      position: 3,
    },
    {
      name: 'Visualization & Storytelling',
      description: 'Vocabulary for dashboards and data-driven narratives.',
      position: 4,
    },
    {
      name: 'Business Recommendations',
      description: 'Terms for insights, actions, and impact communication.',
      position: 5,
    },
  ],
  marketing_manager: [
    {
      name: 'Brand Positioning',
      description: 'Vocabulary for messaging, audience, and brand voice.',
      position: 1,
    },
    {
      name: 'Campaign Strategy',
      description: 'Language for campaign planning and channel mix.',
      position: 2,
    },
    {
      name: 'Content & Creative',
      description: 'Terms for briefs, assets, and creative iteration.',
      position: 3,
    },
    {
      name: 'Performance Marketing',
      description: 'Vocabulary for acquisition, CAC, and optimization.',
      position: 4,
    },
    {
      name: 'Reporting & Attribution',
      description: 'Language for attribution models and performance reporting.',
      position: 5,
    },
  ],
  sales_representative: [
    {
      name: 'Prospecting & Outreach',
      description: 'Vocabulary for outreach strategy and lead qualification.',
      position: 1,
    },
    {
      name: 'Discovery Calls',
      description: 'Terms for needs analysis and opportunity framing.',
      position: 2,
    },
    {
      name: 'Negotiation & Objections',
      description: 'Language for pricing conversations and objection handling.',
      position: 3,
    },
    {
      name: 'Closing & Contracts',
      description: 'Terms for agreement finalization and procurement flow.',
      position: 4,
    },
    {
      name: 'Account Expansion',
      description: 'Vocabulary for renewals, upsell, and relationship growth.',
      position: 5,
    },
  ],
  nurse: [
    {
      name: 'Patient Intake & Triage',
      description: 'Clinical intake, triage, and immediate assessment vocabulary.',
      position: 1,
    },
    {
      name: 'Medication & Treatment',
      description: 'Language for medication administration and treatment plans.',
      position: 2,
    },
    {
      name: 'Monitoring & Documentation',
      description: 'Terms for charting, vitals, and ongoing observation.',
      position: 3,
    },
    {
      name: 'Patient Communication',
      description: 'Vocabulary for bedside communication and patient education.',
      position: 4,
    },
    {
      name: 'Emergency Response',
      description: 'Language for urgent care and escalation procedures.',
      position: 5,
    },
  ],
  doctor: [
    {
      name: 'Diagnosis & Assessment',
      description: 'Vocabulary for symptom analysis and clinical diagnosis.',
      position: 1,
    },
    {
      name: 'Treatment Planning',
      description: 'Terms for treatment selection, follow-up, and care plans.',
      position: 2,
    },
    {
      name: 'Clinical Procedures',
      description: 'Language for procedures, preparation, and patient safety.',
      position: 3,
    },
    {
      name: 'Interdisciplinary Coordination',
      description: 'Vocabulary for handoffs, referrals, and specialist collaboration.',
      position: 4,
    },
    {
      name: 'Patient Counseling',
      description: 'Language for communicating diagnosis and treatment decisions.',
      position: 5,
    },
  ],
  teacher: [
    {
      name: 'Lesson Planning',
      description: 'Vocabulary for objectives, sequencing, and instructional planning.',
      position: 1,
    },
    {
      name: 'Classroom Instruction',
      description: 'Terms for guidance, explanations, and classroom management.',
      position: 2,
    },
    {
      name: 'Assessment & Feedback',
      description: 'Language for formative/summative evaluation and feedback.',
      position: 3,
    },
    {
      name: 'Parent Communication',
      description: 'Vocabulary for parent meetings and learner progress updates.',
      position: 4,
    },
    {
      name: 'Curriculum Development',
      description: 'Terms for curriculum mapping and continuous improvement.',
      position: 5,
    },
  ],
  lawyer: [
    {
      name: 'Contracts & Agreements',
      description: 'Legal terminology for drafting and reviewing contracts.',
      position: 1,
    },
    {
      name: 'Litigation & Court Procedure',
      description: 'Vocabulary for courtroom and legal proceedings.',
      position: 2,
    },
    {
      name: 'Corporate & Business Law',
      description: 'Terms used in corporate advisory and transactions.',
      position: 3,
    },
    {
      name: 'Compliance & Regulation',
      description: 'Vocabulary for regulatory interpretation and compliance.',
      position: 4,
    },
    {
      name: 'Client Advisory',
      description: 'Language for legal strategy and client communication.',
      position: 5,
    },
  ],
  entrepreneur: [
    {
      name: 'Opportunity Discovery',
      description: 'Vocabulary for market problems and opportunity analysis.',
      position: 1,
    },
    {
      name: 'Product & MVP',
      description: 'Terms for MVP scope, validation, and iteration.',
      position: 2,
    },
    {
      name: 'Go-to-Market',
      description: 'Language for GTM strategy, channels, and positioning.',
      position: 3,
    },
    {
      name: 'Finance & Operations',
      description: 'Vocabulary for runway, unit economics, and operations.',
      position: 4,
    },
    {
      name: 'Pitching & Fundraising',
      description: 'Terms for investor communication and fundraising process.',
      position: 5,
    },
  ],
};




async function main(): Promise<void> {
  for (const language of languages) {
    await prisma.languageOption.upsert({
      where: { code: language.code },
      update: {
        name: language.name,
        isActive: true,
      },
      create: {
        code: language.code,
        name: language.name,
        isActive: true,
      },
    });
  }

  for (const profession of professions) {
    await prisma.professionOption.upsert({
      where: { slug: profession.slug },
      update: {
        name: profession.name,
        isActive: true,
      },
      create: {
        slug: profession.slug,
        name: profession.name,
        isActive: true,
      },
    });
  }

  let seededSubcategories = 0;

  for (const profession of professions) {
    const subcategories = professionSubcategories[profession.slug];

    if (!subcategories || subcategories.length === 0) {
      continue;
    }

    const dbProfession = await prisma.professionOption.findUnique({
      where: { slug: profession.slug }
    });

    if (!dbProfession) continue;

    for (const subcategory of subcategories) {
      await prisma.professionSubcategory.upsert({
        where: {
          professionId_position: {
            professionId: dbProfession.id,
            position: subcategory.position,
          },
        },
        update: {
          name: subcategory.name,
          description: subcategory.description,
        },
        create: {
          profession: { connect: { id: dbProfession.id } },
          name: subcategory.name,
          description: subcategory.description,
          position: subcategory.position,
        },
      });
      seededSubcategories += 1;
    }
  }

  process.stdout.write(
    `Seeded ${languages.length} languages, ${professions.length} professions, and ${seededSubcategories} profession subcategories\n`,
  );
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
