import {
  GeneratedComprehensionPassage,
  GeneratedScenarioWord,
} from '../../src/jobs/clients/ClaudeClient';
import { LessonGeneratorClient } from '../../src/jobs/clients/LessonGeneratorClient';

describe('LessonGeneratorClient', () => {
  function makeWord(word: string): GeneratedScenarioWord {
    return {
      word,
      ipa: null,
      complexityLevel: 'intermediate',
      examplePhrases: [
        { text: 'frase operativa', translation: 'operational phrase' },
        { text: 'frase contextual', translation: 'context phrase' },
      ],
      fillGapSentences: [
        { template: 'En el standup tecnico, necesitamos ___ hoy.', answer: word },
        { template: 'Al validar el release, confirmamos ___ antes del despliegue.', answer: word },
      ],
      tags: ['tag1', 'tag2', 'tag3'],
      translations: { en: word },
    };
  }

  function makePassage(words: string[]): GeneratedComprehensionPassage[] {
    return [
      {
        position: 1,
        content: words.join(' '),
        questions: [
          {
            position: 1,
            questionText: 'Cual es el siguiente paso?',
            questionType: 'multiple_choice',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 'A',
          },
          {
            position: 2,
            questionText: 'Que riesgo afecta el despliegue?',
            questionType: 'multiple_choice',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 'A',
          },
          {
            position: 3,
            questionText: 'Que decision se tomo?',
            questionType: 'multiple_choice',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 'A',
          },
          {
            position: 4,
            questionText: 'Que condicion desbloquea el siguiente paso?',
            questionType: 'multiple_choice',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 'A',
          },
          {
            position: 5,
            questionText: 'Cual es el bloqueo principal?',
            questionType: 'short_answer',
            options: null,
            correctAnswer: 'Bloqueo principal',
          },
        ],
      },
    ];
  }

  it('keeps requesting supplemental words until target count is reached', async () => {
    const generateScenarioWords = jest
      .fn()
      .mockResolvedValueOnce([makeWord('dependencia'), makeWord('despliegue')])
      .mockResolvedValueOnce([makeWord('prioridad'), makeWord('latencia')])
      .mockResolvedValueOnce([makeWord('rollback')]);

    const generateScenarioComprehension = jest
      .fn()
      .mockResolvedValue(makePassage(['dependencia', 'despliegue', 'prioridad', 'latencia', 'rollback']));

    const client = new LessonGeneratorClient({
      generateScenarioWords,
      generateScenarioComprehension,
    } as any);

    const lesson = await client.generateLesson({
      profession: 'software_engineer',
      subcategoryName: 'System Design & Architecture',
      scenarioName: 'Technical Standup',
      targetLanguage: 'es',
      baseLanguages: ['en'],
      count: 5,
    });

    expect(lesson.words).toHaveLength(5);
    expect(generateScenarioWords).toHaveBeenCalledTimes(3);
  });

  it('fails instead of returning a partial lesson when too few acceptable words are produced', async () => {
    const generateScenarioWords = jest
      .fn()
      .mockResolvedValue([makeWord('dependencia')]);

    const generateScenarioComprehension = jest.fn();

    const client = new LessonGeneratorClient({
      generateScenarioWords,
      generateScenarioComprehension,
    } as any);

    await expect(
      client.generateLesson({
        profession: 'product_manager',
        subcategoryName: 'Roadmap Prioritization',
        scenarioName: 'Executive Readout',
        targetLanguage: 'es',
        baseLanguages: ['en'],
        count: 3,
      }),
    ).rejects.toThrow('Scenario generation returned only 1 acceptable words out of 3');

    expect(generateScenarioWords).toHaveBeenCalledTimes(6);
    expect(generateScenarioComprehension).not.toHaveBeenCalled();
  });

  it('retries up to max attempts then fails without hardcoded content fallback', async () => {
    const generateScenarioWords = jest
      .fn()
      .mockResolvedValue([makeWord('dependencia')]);

    const generateScenarioComprehension = jest.fn();

    const client = new LessonGeneratorClient({
      generateScenarioWords,
      generateScenarioComprehension,
    } as any);

    await expect(
      client.generateLesson({
        profession: 'software_engineer',
        subcategoryName: 'System Design & Architecture',
        scenarioName: 'Technical Standup',
        targetLanguage: 'es',
        baseLanguages: ['en'],
        count: 3,
      }),
    ).rejects.toThrow('Scenario generation returned only 1 acceptable words out of 3');

    expect(generateScenarioWords).toHaveBeenCalledTimes(6);
    expect(generateScenarioComprehension).not.toHaveBeenCalled();
  });
});