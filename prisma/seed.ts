import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Voice IDs are ElevenLabs voice IDs for native-accent speakers of each language.
// To find or replace a voice: ElevenLabs dashboard → Voices → copy the ID from the voice detail panel.
// null = fall back to the ELEVENLABS_VOICE_ID env var (used as the English/default voice).
const languages: Array<{ code: string; name: string; ttsVoiceId: string | null }> = [
  { code: 'en', name: 'English', ttsVoiceId: null },                    // uses ELEVENLABS_VOICE_ID env var
  { code: 'es', name: 'Spanish', ttsVoiceId: 'Gg1duEKiqWOgqcCJCFVh' }, // Rafael — calm, conversational Latin American Spanish
  { code: 'de', name: 'German',  ttsVoiceId: 'pqHfZKP75CvOlQylNhV4' }, // Bill — multilingual, German accent
  { code: 'fr', name: 'French',  ttsVoiceId: 'XB0fDUnXU5powFXDhCwa' }, // Charlotte — native French speaker
];

const professions = [
  { slug: 'healthcare', name: 'Healthcare' },
  { slug: 'engineering', name: 'Engineering' },
  { slug: 'marketing', name: 'Marketing' },
  { slug: 'technology_it', name: 'Technology & IT' },
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
  healthcare: [
    {
      name: 'Patient Care',
      description: 'Vocabulary for intake, care plans, and patient communication.',
      position: 1,
    },
    {
      name: 'Emergency Medicine',
      description: 'Terms for triage, urgent assessment, and rapid response.',
      position: 2,
    },
    {
      name: 'Nursing Practice',
      description: 'Language for shift handoffs, monitoring, and care coordination.',
      position: 3,
    },
    {
      name: 'Medical Administration',
      description: 'Vocabulary for billing, compliance, and documentation.',
      position: 4,
    },
  ],
  engineering: [
    {
      name: 'Civil Engineering',
      description: 'Terms for infrastructure design, inspections, and permitting.',
      position: 1,
    },
    {
      name: 'Mechanical Engineering',
      description: 'Vocabulary for design review, testing, and failure analysis.',
      position: 2,
    },
    {
      name: 'Construction & Site Management',
      description: 'Language for site briefings, safety, and subcontractor coordination.',
      position: 3,
    },
    {
      name: 'Project Engineering',
      description: 'Terms for scoping, scheduling, and stakeholder updates.',
      position: 4,
    },
  ],
  marketing: [
    {
      name: 'Digital Marketing',
      description: 'Vocabulary for campaigns, ad platforms, and performance metrics.',
      position: 1,
    },
    {
      name: 'Content Marketing',
      description: 'Terms for content strategy, editorial process, and storytelling.',
      position: 2,
    },
    {
      name: 'Brand Management',
      description: 'Language for brand guidelines, positioning, and reputation.',
      position: 3,
    },
    {
      name: 'Sales & Business Development',
      description: 'Vocabulary for discovery calls, objections, and negotiation.',
      position: 4,
    },
  ],
  technology_it: [
    {
      name: 'Software Development',
      description: 'Terms for code review, incidents, and engineering process.',
      position: 1,
    },
    {
      name: 'Data Analytics',
      description: 'Vocabulary for insights, data quality, and stakeholder reporting.',
      position: 2,
    },
    {
      name: 'Product Management',
      description: 'Language for prioritization, requirements, and roadmap trade-offs.',
      position: 3,
    },
    {
      name: 'Cybersecurity',
      description: 'Terms for incident response, audits, and risk assessment.',
      position: 4,
    },
  ],
};

const professionScenarios: Record<string, SeedScenario[]> = {
  healthcare: [
    { slug: 'patient-intake-consult', displayName: 'Patient Intake Consult', description: 'Intake and history-taking conversation with a new patient.', position: 1 },
    { slug: 'discharge-instructions', displayName: 'Discharge Instructions', description: 'Explaining a care plan and discharge instructions to a patient or family.', position: 2 },
    { slug: 'triage-assessment', displayName: 'Triage Assessment', description: 'Rapid triage and severity communication in an urgent setting.', position: 3 },
    { slug: 'code-team-handoff', displayName: 'Code Team Handoff', description: 'Urgent handoff to an incoming code or trauma team.', position: 4 },
    { slug: 'shift-handoff-sbar', displayName: 'Shift Handoff (SBAR)', description: 'SBAR-style shift handoff to an incoming nurse or provider.', position: 5 },
    { slug: 'physician-escalation', displayName: 'Physician Escalation', description: 'Escalating a patient concern or advocating for a care change with a physician.', position: 6 },
    { slug: 'insurance-billing-call', displayName: 'Insurance & Billing Call', description: 'Explaining coverage and billing details to a patient.', position: 7 },
    { slug: 'compliance-documentation-review', displayName: 'Compliance Documentation Review', description: 'Reviewing chart documentation for regulatory compliance.', position: 8 },
    { slug: 'family-care-conference', displayName: 'Family Care Conference', description: "Discussing a treatment plan and prognosis with a patient's family.", position: 9 },
    { slug: 'interdisciplinary-rounds', displayName: 'Interdisciplinary Rounds', description: 'Coordinating care across nursing, physician, and administrative roles during rounds.', position: 10 },
  ],
  engineering: [
    { slug: 'site-inspection-report', displayName: 'Site Inspection Report', description: 'Reporting inspection findings to a client or regulator.', position: 1 },
    { slug: 'permit-review-meeting', displayName: 'Permit Review Meeting', description: 'Regulatory and permit approval discussion.', position: 2 },
    { slug: 'design-review-meeting', displayName: 'Design Review Meeting', description: 'Presenting a design for technical review and feedback.', position: 3 },
    { slug: 'failure-analysis-debrief', displayName: 'Failure Analysis Debrief', description: 'Explaining root-cause failure analysis to stakeholders.', position: 4 },
    { slug: 'daily-site-briefing', displayName: 'Daily Site Briefing', description: 'Morning safety and schedule briefing on a job site.', position: 5 },
    { slug: 'subcontractor-coordination', displayName: 'Subcontractor Coordination', description: 'Coordinating scope and schedule with a subcontractor.', position: 6 },
    { slug: 'project-kickoff-scoping', displayName: 'Project Kickoff & Scoping', description: 'Kickoff call defining project scope and timeline.', position: 7 },
    { slug: 'stakeholder-status-update', displayName: 'Stakeholder Status Update', description: 'Progress and budget update to project stakeholders.', position: 8 },
    { slug: 'safety-incident-report', displayName: 'Safety Incident Report', description: 'Reporting and documenting a site safety incident.', position: 9 },
    { slug: 'schedule-delay-negotiation', displayName: 'Schedule Delay Negotiation', description: 'Communicating a schedule delay and renegotiating timeline with a client.', position: 10 },
  ],
  marketing: [
    { slug: 'campaign-performance-review', displayName: 'Campaign Performance Review', description: 'Reporting campaign metrics to a client or lead.', position: 1 },
    { slug: 'ad-platform-troubleshooting', displayName: 'Ad Platform Troubleshooting', description: 'Diagnosing an underperforming ad account issue.', position: 2 },
    { slug: 'content-strategy-pitch', displayName: 'Content Strategy Pitch', description: 'Pitching a content plan to stakeholders.', position: 3 },
    { slug: 'editorial-feedback-session', displayName: 'Editorial Feedback Session', description: 'Giving and receiving editorial feedback.', position: 4 },
    { slug: 'brand-guideline-alignment', displayName: 'Brand Guideline Alignment', description: 'Enforcing brand consistency with a partner or internal team.', position: 5 },
    { slug: 'reputation-crisis-response', displayName: 'Reputation Crisis Response', description: 'Responding to a brand or PR issue.', position: 6 },
    { slug: 'discovery-call', displayName: 'Discovery Call', description: 'Sales discovery call with a prospective customer.', position: 7 },
    { slug: 'objection-handling-negotiation', displayName: 'Objection Handling & Negotiation', description: 'Handling objections and negotiating contract terms.', position: 8 },
    { slug: 'influencer-partnership-outreach', displayName: 'Influencer Partnership Outreach', description: 'Negotiating terms with an influencer or brand partner.', position: 9 },
    { slug: 'quarterly-marketing-review', displayName: 'Quarterly Marketing Review', description: 'Presenting quarterly marketing results and strategy to leadership.', position: 10 },
  ],
  technology_it: [
    { slug: 'code-review-discussion', displayName: 'Code Review Discussion', description: 'Giving and receiving code review feedback.', position: 1 },
    { slug: 'incident-postmortem', displayName: 'Incident Postmortem', description: 'Blameless postmortem discussion after a production incident.', position: 2 },
    { slug: 'insights-presentation', displayName: 'Insights Presentation', description: 'Presenting data findings to non-technical stakeholders.', position: 3 },
    { slug: 'data-quality-escalation', displayName: 'Data Quality Escalation', description: 'Escalating a data quality issue to relevant teams.', position: 4 },
    { slug: 'roadmap-prioritization', displayName: 'Roadmap Prioritization', description: 'Prioritization and trade-off discussion for the product roadmap.', position: 5 },
    { slug: 'feature-requirements-review', displayName: 'Feature Requirements Review', description: 'Requirements-gathering session with stakeholders.', position: 6 },
    { slug: 'incident-response-briefing', displayName: 'Incident Response Briefing', description: 'Security incident briefing to leadership or affected teams.', position: 7 },
    { slug: 'security-audit-findings', displayName: 'Security Audit Findings', description: 'Presenting security audit findings and a remediation plan.', position: 8 },
    { slug: 'technical-standup', displayName: 'Technical Standup', description: 'Daily technical standup covering progress and blockers.', position: 9 },
    { slug: 'vendor-risk-assessment', displayName: 'Vendor Risk Assessment', description: "Evaluating a third-party vendor's security posture.", position: 10 },
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
