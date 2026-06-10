import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Voice IDs are ElevenLabs voice IDs for native-accent speakers of each language.
// To find or replace a voice: ElevenLabs dashboard → Voices → copy the ID from the voice detail panel.
// null = fall back to the ELEVENLABS_VOICE_ID env var (used as the English/default voice).
const languages: Array<{ code: string; name: string; ttsVoiceId: string | null }> = [
  { code: 'en', name: 'English', ttsVoiceId: null },                    // uses ELEVENLABS_VOICE_ID env var
  { code: 'es', name: 'Spanish', ttsVoiceId: 'kgG7dCoKTfoYNFAuKnyk' }, // Antoni — native Spanish cadence
  { code: 'de', name: 'German',  ttsVoiceId: 'pqHfZKP75CvOlQylNhV4' }, // Bill — multilingual, German accent
  { code: 'fr', name: 'French',  ttsVoiceId: 'XB0fDUnXU5powFXDhCwa' }, // Charlotte — native French speaker
];

const professions = [
  { slug: 'software_engineer', name: 'Software Engineer' },
  { slug: 'product_manager', name: 'Product Manager' },
  { slug: 'entrepreneur', name: 'Entrepreneur' },
];

type SeedSubcategory = {
  name: string;
  description: string;
  position: number;
};

type SeedScenario = {
  slug: string;
  displayName: string;
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

const professionScenarios: Record<string, SeedScenario[]> = {
  software_engineer: [
    { slug: 'technical-standup', displayName: 'Technical Standup', description: 'Daily progress updates, blockers, and coordination with the team.', position: 1 },
    { slug: 'feature-kickoff', displayName: 'Feature Kickoff', description: 'Clarifying scope, requirements, and implementation approach.', position: 2 },
    { slug: 'code-review', displayName: 'Code Review Discussion', description: 'Giving and receiving implementation feedback with precision.', position: 3 },
    { slug: 'incident-response', displayName: 'Incident Response', description: 'Diagnosing failures, mitigation, and post-incident communication.', position: 4 },
    { slug: 'api-design', displayName: 'API Design Meeting', description: 'Designing contracts, payloads, and backward-compatible changes.', position: 5 },
    { slug: 'architecture-review', displayName: 'Architecture Review', description: 'Discussing scalability, reliability, and technical trade-offs.', position: 6 },
    { slug: 'qa-triage', displayName: 'QA Bug Triage', description: 'Prioritizing defects and agreeing on release blockers.', position: 7 },
    { slug: 'release-planning', displayName: 'Release Planning', description: 'Defining release scope, readiness checks, and rollback plans.', position: 8 },
    { slug: 'stakeholder-update', displayName: 'Stakeholder Update', description: 'Explaining technical status and delivery risks to non-engineers.', position: 9 },
    { slug: 'retrospective', displayName: 'Sprint Retrospective', description: 'Reflecting on outcomes, process issues, and improvement actions.', position: 10 },
  ],
  product_manager: [
    { slug: 'user-research-interview', displayName: 'User Research Interview', description: 'Running discovery interviews to validate user problems.', position: 1 },
    { slug: 'problem-framing', displayName: 'Problem Framing Workshop', description: 'Aligning on problem statements, constraints, and outcomes.', position: 2 },
    { slug: 'roadmap-prioritization', displayName: 'Roadmap Prioritization', description: 'Sequencing initiatives and balancing trade-offs.', position: 3 },
    { slug: 'backlog-refinement', displayName: 'Backlog Refinement', description: 'Clarifying stories, acceptance criteria, and dependencies.', position: 4 },
    { slug: 'analytics-review', displayName: 'Product Analytics Review', description: 'Interpreting funnel metrics and experiment results.', position: 5 },
    { slug: 'cross-functional-planning', displayName: 'Cross-functional Planning', description: 'Coordinating with design, engineering, and go-to-market teams.', position: 6 },
    { slug: 'launch-readiness', displayName: 'Launch Readiness Check', description: 'Confirming launch criteria, comms, and rollout plan.', position: 7 },
    { slug: 'executive-readout', displayName: 'Executive Readout', description: 'Presenting product impact and strategic next steps.', position: 8 },
    { slug: 'customer-feedback-loop', displayName: 'Customer Feedback Loop', description: 'Synthesizing feedback and identifying iteration priorities.', position: 9 },
    { slug: 'post-launch-review', displayName: 'Post-launch Review', description: 'Assessing adoption, retention, and learning for next cycle.', position: 10 },
  ],
  entrepreneur: [
    { slug: 'idea-validation', displayName: 'Idea Validation', description: 'Testing assumptions and validating customer pain points.', position: 1 },
    { slug: 'mvp-scoping', displayName: 'MVP Scoping', description: 'Defining MVP boundaries, constraints, and success criteria.', position: 2 },
    { slug: 'market-positioning', displayName: 'Market Positioning', description: 'Crafting value proposition and competitive differentiation.', position: 3 },
    { slug: 'go-to-market-plan', displayName: 'Go-to-Market Plan', description: 'Planning channels, messaging, and first customer acquisition.', position: 4 },
    { slug: 'customer-discovery-call', displayName: 'Customer Discovery Call', description: 'Interviewing prospects to refine product direction.', position: 5 },
    { slug: 'partnership-negotiation', displayName: 'Partnership Negotiation', description: 'Exploring strategic partnerships and commercial terms.', position: 6 },
    { slug: 'operations-review', displayName: 'Operations Review', description: 'Reviewing execution bottlenecks and process improvements.', position: 7 },
    { slug: 'financial-planning', displayName: 'Financial Planning', description: 'Discussing runway, unit economics, and spending priorities.', position: 8 },
    { slug: 'investor-pitch', displayName: 'Investor Pitch', description: 'Presenting traction, vision, and funding ask to investors.', position: 9 },
    { slug: 'growth-retrospective', displayName: 'Growth Retrospective', description: 'Analyzing growth experiments and choosing next bets.', position: 10 },
  ],
};

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');




async function main(): Promise<void> {
  const supportedLanguageCodes = languages.map((language) => language.code);
  const supportedProfessionSlugs = professions.map((profession) => profession.slug);

  for (const language of languages) {
    await prisma.languageOption.upsert({
      where: { code: language.code },
      update: {
        name: language.name,
        ttsVoiceId: language.ttsVoiceId,
        isActive: true,
      },
      create: {
        code: language.code,
        name: language.name,
        ttsVoiceId: language.ttsVoiceId,
        isActive: true,
      },
    });
  }

  await prisma.languageOption.updateMany({
    where: {
      code: { notIn: supportedLanguageCodes },
    },
    data: {
      isActive: false,
    },
  });

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

  await prisma.professionOption.updateMany({
    where: {
      slug: { notIn: supportedProfessionSlugs },
    },
    data: {
      isActive: false,
    },
  });

  let seededSubcategories = 0;
  let seededScenarios = 0;

  for (const profession of professions) {
    const subcategories = professionSubcategories[profession.slug];

    if (!subcategories || subcategories.length === 0) {
      continue;
    }

    const dbProfession = await prisma.professionOption.findUnique({
      where: { slug: profession.slug },
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
          slug: toSlug(subcategory.name),
          name: subcategory.name,
          description: subcategory.description,
          position: subcategory.position,
        },
      });
      seededSubcategories += 1;
    }

    const scenarios = professionScenarios[profession.slug] || [];
    for (const scenario of scenarios) {
      await prisma.professionScenario.upsert({
        where: {
          professionId_position: {
            professionId: dbProfession.id,
            position: scenario.position,
          },
        },
        update: {
          slug: scenario.slug,
          displayName: scenario.displayName,
          description: scenario.description,
        },
        create: {
          professionId: dbProfession.id,
          slug: scenario.slug,
          displayName: scenario.displayName,
          description: scenario.description,
          position: scenario.position,
        },
      });
      seededScenarios += 1;
    }
  }

  // Seed common word glosses for comprehension support (Phase 2)
  const commonWordGlosses: Array<{ language: string; token: string; lemma?: string; baseLanguageGloss: string; partOfSpeech?: string; frequencyRank?: number }> = [
    // Spanish common words
    { language: 'es', token: 'el', lemma: 'el', baseLanguageGloss: 'the (masculine)', partOfSpeech: 'article', frequencyRank: 1 },
    { language: 'es', token: 'la', lemma: 'la', baseLanguageGloss: 'the (feminine)', partOfSpeech: 'article', frequencyRank: 2 },
    { language: 'es', token: 'de', lemma: 'de', baseLanguageGloss: 'of, from', partOfSpeech: 'preposition', frequencyRank: 3 },
    { language: 'es', token: 'y', lemma: 'y', baseLanguageGloss: 'and', partOfSpeech: 'conjunction', frequencyRank: 4 },
    { language: 'es', token: 'que', lemma: 'que', baseLanguageGloss: 'that, which, what', partOfSpeech: 'pronoun', frequencyRank: 5 },
    { language: 'es', token: 'en', lemma: 'en', baseLanguageGloss: 'in, on', partOfSpeech: 'preposition', frequencyRank: 6 },
    { language: 'es', token: 'a', lemma: 'a', baseLanguageGloss: 'to, at', partOfSpeech: 'preposition', frequencyRank: 7 },
    { language: 'es', token: 'es', lemma: 'ser', baseLanguageGloss: 'is', partOfSpeech: 'verb', frequencyRank: 8 },
    // English common words
    { language: 'en', token: 'the', lemma: 'the', baseLanguageGloss: 'el, la', partOfSpeech: 'article', frequencyRank: 1 },
    { language: 'en', token: 'of', lemma: 'of', baseLanguageGloss: 'de', partOfSpeech: 'preposition', frequencyRank: 2 },
    { language: 'en', token: 'and', lemma: 'and', baseLanguageGloss: 'y', partOfSpeech: 'conjunction', frequencyRank: 3 },
    { language: 'en', token: 'to', lemma: 'to', baseLanguageGloss: 'a, para', partOfSpeech: 'preposition', frequencyRank: 4 },
  ];

  const spanishEnglishHighFrequency: Array<{ token: string; baseLanguageGloss: string; frequencyRank: number }> = [
    { token: 'como', baseLanguageGloss: 'as', frequencyRank: 1 },
    { token: 'yo', baseLanguageGloss: 'I', frequencyRank: 2 },
    { token: 'su', baseLanguageGloss: 'his', frequencyRank: 3 },
    { token: 'que', baseLanguageGloss: 'that', frequencyRank: 4 },
    { token: 'él', baseLanguageGloss: 'he', frequencyRank: 5 },
    { token: 'era', baseLanguageGloss: 'was', frequencyRank: 6 },
    { token: 'para', baseLanguageGloss: 'for', frequencyRank: 7 },
    { token: 'en', baseLanguageGloss: 'on, at', frequencyRank: 8 },
    { token: 'son', baseLanguageGloss: 'are', frequencyRank: 9 },
    { token: 'con', baseLanguageGloss: 'with', frequencyRank: 10 },
    { token: 'ellos', baseLanguageGloss: 'they', frequencyRank: 11 },
    { token: 'ser', baseLanguageGloss: 'be', frequencyRank: 12 },
    { token: 'uno', baseLanguageGloss: 'one', frequencyRank: 14 },
    { token: 'tener', baseLanguageGloss: 'have', frequencyRank: 15 },
    { token: 'este', baseLanguageGloss: 'this', frequencyRank: 16 },
    { token: 'desde', baseLanguageGloss: 'from', frequencyRank: 17 },
    { token: 'por', baseLanguageGloss: 'by', frequencyRank: 18 },
    { token: 'caliente', baseLanguageGloss: 'hot', frequencyRank: 19 },
    { token: 'palabra', baseLanguageGloss: 'word', frequencyRank: 20 },
    { token: 'pero', baseLanguageGloss: 'but', frequencyRank: 21 },
    { token: 'qué', baseLanguageGloss: 'what', frequencyRank: 23 },
    { token: 'algunos', baseLanguageGloss: 'some', frequencyRank: 24 },
    { token: 'es', baseLanguageGloss: 'is', frequencyRank: 25 },
    { token: 'lo', baseLanguageGloss: 'it', frequencyRank: 26 },
    { token: 'usted', baseLanguageGloss: 'you', frequencyRank: 27 },
    { token: 'o', baseLanguageGloss: 'or', frequencyRank: 28 },
    { token: 'tenido', baseLanguageGloss: 'had', frequencyRank: 29 },
    { token: 'la', baseLanguageGloss: 'the', frequencyRank: 30 },
    { token: 'de', baseLanguageGloss: 'of', frequencyRank: 31 },
  ];

  // Keep unique tokens because CommonWordGloss enforces unique(language, token).
  const mergedSpanishHighFrequency = Array.from(
    new Map(
      spanishEnglishHighFrequency.map((entry) => [entry.token, entry]),
    ).values(),
  );

  for (const gloss of commonWordGlosses) {
    await prisma.commonWordGloss.upsert({
      where: {
        language_token: {
          language: gloss.language,
          token: gloss.token,
        },
      },
      update: {
        lemma: gloss.lemma,
        baseLanguageGloss: gloss.baseLanguageGloss,
        partOfSpeech: gloss.partOfSpeech,
        frequencyRank: gloss.frequencyRank,
      },
      create: {
        language: gloss.language,
        token: gloss.token,
        lemma: gloss.lemma,
        baseLanguageGloss: gloss.baseLanguageGloss,
        partOfSpeech: gloss.partOfSpeech,
        frequencyRank: gloss.frequencyRank,
        source: 'common_lexicon',
      },
    });
  }

  for (const entry of mergedSpanishHighFrequency) {
    await prisma.commonWordGloss.upsert({
      where: {
        language_token: {
          language: 'es',
          token: entry.token,
        },
      },
      update: {
        lemma: entry.token,
        baseLanguageGloss: entry.baseLanguageGloss,
        partOfSpeech: 'unknown',
        frequencyRank: entry.frequencyRank,
        source: 'common_lexicon',
      },
      create: {
        language: 'es',
        token: entry.token,
        lemma: entry.token,
        baseLanguageGloss: entry.baseLanguageGloss,
        partOfSpeech: 'unknown',
        frequencyRank: entry.frequencyRank,
        source: 'common_lexicon',
      },
    });
  }

  const commonWordCount = commonWordGlosses.length + mergedSpanishHighFrequency.length;

  process.stdout.write(
    `Seeded ${languages.length} active languages, ${professions.length} active professions, ${seededSubcategories} profession subcategories, ${seededScenarios} profession scenarios, and ${commonWordCount} common word glosses\n`,
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
