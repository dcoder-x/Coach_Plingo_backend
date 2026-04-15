import {
  generateFallbackLessonWords,
  generateFallbackPronunciationExercises,
  generateFallbackStory,
} from '../../src/jobs/contentGenerators';

describe('contentGenerators', () => {
  it('generates lesson words while respecting exclusions', () => {
    const words = generateFallbackLessonWords({
      profession: 'healthcare',
      language: 'Spanish',
      subcategory: 'Nursing',
      count: 4,
      excludeWords: ['consulta'],
    });

    expect(words).toHaveLength(4);
    expect(words.map((word) => word.word.toLowerCase())).not.toContain('consulta');
    expect(words[0]).toEqual(
      expect.objectContaining({
        translation: expect.any(String),
        subcategory: 'Nursing',
        examplePhrases: expect.any(Array),
        exampleSentences: expect.any(Array),
      }),
    );
  });

  it('generates a story with questions and vocabulary coverage', () => {
    const story = generateFallbackStory({
      language: 'Spanish',
      profession: 'healthcare',
      vocabulary: [
        { word: 'consulta', translation: 'consultation' },
        { word: 'síntoma', translation: 'symptom' },
      ],
    });

    expect(story.content).toContain('consulta');
    expect(story.questions).toHaveLength(2);
    expect(story.vocabularyCoverage).toEqual(['consulta', 'síntoma']);
  });

  it('generates ordered pronunciation exercises', () => {
    const exercises = generateFallbackPronunciationExercises({
      profession: 'engineering',
      vocabulary: ['plano', 'ensayo', 'seguridad'],
    });

    expect(exercises).toHaveLength(3);
    expect(exercises[0].position).toBe(1);
    expect(exercises[0].targetText).toContain('plano');
  });
});
