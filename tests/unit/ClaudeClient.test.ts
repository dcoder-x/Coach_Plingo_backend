import { ClaudeClient } from '../../src/jobs/clients/ClaudeClient';

describe('ClaudeClient pronunciation critic helpers', () => {
  it('rewrites risky English-like tokens in spoken form for non-English languages', () => {
    const client = new ClaudeClient() as any;

    const rewritten = client.rewriteSpeechForm(
      'Update the report before handoff.',
      'de',
    );

    expect(rewritten).toContain('Aktualisierung');
    expect(rewritten).toContain('bericht');
    expect(rewritten).toContain('uebergabe');
  });

  it('keeps English text unchanged when target language is English', () => {
    const client = new ClaudeClient() as any;

    const rewritten = client.rewriteSpeechForm(
      'Update the report before handoff.',
      'en',
    );

    expect(rewritten).toBe('Update the report before handoff.');
  });

  it('filters pronunciation exercises whose spoken form stays risky after repair', () => {
    const client = new ClaudeClient() as any;

    const critiqued = client.critiquePronunciationExercises(
      [
        {
          targetText: 'Update the report now',
          spokenForm: 'Update the report now',
          complexityLevel: 'BEGINNER',
          position: 1,
        },
      ],
      'de',
    );

    expect(critiqued).toHaveLength(1);
    expect(critiqued[0].spokenForm).toContain('Aktualisierung');
    expect(critiqued[0].spokenForm).toContain('bericht');
  });

  it('rejects generic Spanish engineering scenario words', () => {
    const client = new ClaudeClient() as any;

    const accepted = client.isScenarioWordCandidateStrong(
      {
        word: 'progreso',
        ipa: '/pro.ɡɾe.so/',
        complexityLevel: 'beginner',
        examplePhrases: [
          { text: 'progreso semanal', translation: 'weekly progress' },
          { text: 'reporte de progreso', translation: 'progress report' },
        ],
        fillGapSentences: [
          { template: 'En la reunion tecnica, el ___ es satisfactorio.', answer: 'progreso' },
          { template: 'Al cerrar el sprint, reportamos el ___.', answer: 'progreso' },
        ],
        tags: ['standup', 'updates', 'coordination'],
        translations: { en: 'progress' },
      },
      {
        profession: 'software_engineer',
        subcategoryName: 'System Design & Architecture',
        scenarioName: 'Technical Standup',
        targetLanguage: 'es',
        baseLanguages: ['en'],
      },
    );

    expect(accepted).toBe(false);
  });

  it('rejects English loanwords in Spanish scenario vocabulary when avoidable', () => {
    const client = new ClaudeClient() as any;

    const accepted = client.isScenarioWordCandidateStrong(
      {
        word: 'trade-off',
        ipa: '/treɪd.ɔf/',
        complexityLevel: 'advanced',
        examplePhrases: [
          { text: 'trade-off tecnico', translation: 'technical trade-off' },
          { text: 'trade-off de costos', translation: 'cost trade-off' },
        ],
        fillGapSentences: [
          { template: 'En la evaluacion del sistema, discutimos el ___.', answer: 'trade-off' },
          { template: 'Al definir la arquitectura, el ___ afecta la decision.', answer: 'trade-off' },
        ],
        tags: ['decision making', 'system design', 'trade-offs'],
        translations: { en: 'trade-off' },
      },
      {
        profession: 'software_engineer',
        subcategoryName: 'System Design & Architecture',
        scenarioName: 'Technical Standup',
        targetLanguage: 'es',
        baseLanguages: ['en'],
      },
    );

    expect(accepted).toBe(false);
  });

  it('accepts scenario-specific engineering vocabulary with concrete cues', () => {
    const client = new ClaudeClient() as any;

    const accepted = client.isScenarioWordCandidateStrong(
      {
        word: 'despliegue',
        ipa: '/desˈplje.ɣe/',
        complexityLevel: 'intermediate',
        examplePhrases: [
          { text: 'despliegue sin bloqueo', translation: 'deployment without blocker' },
          { text: 'despliegue en produccion', translation: 'production deployment' },
        ],
        fillGapSentences: [
          { template: 'En el standup tecnico, el ___ de hoy depende del rollback.', answer: 'despliegue' },
          { template: 'Al aprobar el release, validamos el ___ tras revisar la latencia.', answer: 'despliegue' },
        ],
        tags: ['release', 'rollback', 'delivery'],
        translations: { en: 'deployment' },
      },
      {
        profession: 'software_engineer',
        subcategoryName: 'System Design & Architecture',
        scenarioName: 'Technical Standup',
        targetLanguage: 'es',
        baseLanguages: ['en'],
      },
    );

    expect(accepted).toBe(true);
  });
});
