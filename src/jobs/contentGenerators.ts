import { WordData } from '../services/VocabularyService';

export interface GeneratedLessonWord extends WordData {
  translation: string;
  subcategory: string;
}

export interface GeneratedStoryQuestion {
  questionText: string;
  options?: string[];
  correctAnswer: string;
  questionType: 'MULTIPLE_CHOICE' | 'SHORT_ANSWER';
  position: number;
}

export interface GeneratedStoryContent {
  content: string;
  questions: GeneratedStoryQuestion[];
  vocabularyCoverage: string[];
}

export interface GeneratedPronunciationExercise {
  targetText: string;
  complexityLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  position: number;
}

const lessonTemplatesByLanguage: Record<string, Record<string, Array<{ word: string; translation: string; tags: string[] }>>> = {
  de: {
    healthcare: [
      { word: 'Pflege', translation: 'care', tags: ['patient-care', 'clinical'] },
      { word: 'Medikament', translation: 'medication', tags: ['treatment', 'pharmacy'] },
      { word: 'Notfall', translation: 'emergency', tags: ['triage', 'response'] },
      { word: 'Untersuchung', translation: 'assessment', tags: ['intake', 'clinical'] },
      { word: 'Patient', translation: 'patient', tags: ['healthcare', 'role'] },
      { word: 'Vitalwerte', translation: 'vital signs', tags: ['monitoring', 'healthcare'] },
    ],
    default: [
      { word: 'Aufgabe', translation: 'task', tags: ['work', 'planning'] },
      { word: 'Team', translation: 'team', tags: ['collaboration', 'people'] },
      { word: 'Ergebnis', translation: 'result', tags: ['outcome', 'analysis'] },
      { word: 'Priorität', translation: 'priority', tags: ['planning', 'focus'] },
      { word: 'Besprechung', translation: 'meeting', tags: ['communication', 'work'] },
      { word: 'Arbeitsplan', translation: 'work plan', tags: ['workflow', 'operations'] },
    ],
  },
  es: {
    default: [
      { word: 'objetivo', translation: 'goal', tags: ['planning', 'work'] },
      { word: 'equipo', translation: 'team', tags: ['collaboration', 'people'] },
      { word: 'proceso', translation: 'process', tags: ['workflow', 'operations'] },
      { word: 'resultado', translation: 'result', tags: ['outcome', 'analysis'] },
      { word: 'prioridad', translation: 'priority', tags: ['planning', 'focus'] },
      { word: 'mejora', translation: 'improvement', tags: ['growth', 'iteration'] },
    ],
  },
};

const lessonTemplates: Record<string, Array<{ word: string; translation: string; tags: string[] }>> = {
  healthcare: [
    { word: 'consulta', translation: 'consultation', tags: ['patient-care', 'appointments'] },
    { word: 'síntoma', translation: 'symptom', tags: ['diagnosis', 'triage'] },
    { word: 'tratamiento', translation: 'treatment', tags: ['care-plan', 'clinical'] },
    { word: 'receta', translation: 'prescription', tags: ['medication', 'pharmacy'] },
    { word: 'urgencia', translation: 'emergency', tags: ['triage', 'response'] },
    { word: 'historial', translation: 'medical history', tags: ['records', 'intake'] },
  ],
  engineering: [
    { word: 'plano', translation: 'blueprint', tags: ['design', 'planning'] },
    { word: 'ensayo', translation: 'test run', tags: ['quality', 'validation'] },
    { word: 'revisión', translation: 'review', tags: ['process', 'iteration'] },
    { word: 'ajuste', translation: 'adjustment', tags: ['tuning', 'calibration'] },
    { word: 'seguridad', translation: 'safety', tags: ['compliance', 'operations'] },
    { word: 'despliegue', translation: 'deployment', tags: ['delivery', 'release'] },
  ],
  hospitality: [
    { word: 'reserva', translation: 'reservation', tags: ['front-desk', 'booking'] },
    { word: 'huésped', translation: 'guest', tags: ['service', 'hospitality'] },
    { word: 'menú', translation: 'menu', tags: ['restaurant', 'service'] },
    { word: 'turno', translation: 'shift', tags: ['staffing', 'operations'] },
    { word: 'factura', translation: 'bill', tags: ['payments', 'front-desk'] },
    { word: 'bienvenida', translation: 'welcome', tags: ['greeting', 'service'] },
  ],
};

const defaultTemplates = [
  { word: 'objetivo', translation: 'goal', tags: ['planning', 'work'] },
  { word: 'equipo', translation: 'team', tags: ['collaboration', 'people'] },
  { word: 'proceso', translation: 'process', tags: ['workflow', 'operations'] },
  { word: 'resultado', translation: 'result', tags: ['outcome', 'analysis'] },
  { word: 'prioridad', translation: 'priority', tags: ['planning', 'focus'] },
  { word: 'mejora', translation: 'improvement', tags: ['growth', 'iteration'] },
];

function getProfessionTemplates(profession: string): Array<{ word: string; translation: string; tags: string[] }> {
  const normalized = profession.trim().toLowerCase();

  return lessonTemplates[normalized] ?? defaultTemplates;
}

function getLanguageAwareTemplates(
  profession: string,
  language: string,
): Array<{ word: string; translation: string; tags: string[] }> {
  const normalizedProfession = profession.trim().toLowerCase();
  const normalizedLanguage = language.trim().toLowerCase();

  const byLanguage = lessonTemplatesByLanguage[normalizedLanguage];
  if (byLanguage) {
    return byLanguage[normalizedProfession] ?? byLanguage.default;
  }

  return getProfessionTemplates(profession);
}

import { SentenceExample } from '../services/VocabularyService';

function buildExamples(word: string, translation: string): {
  examplePhrases: SentenceExample[];
  exampleSentences: SentenceExample[];
} {
  return {
    examplePhrases: [
      {
        text: `${word} esencial`,
        translation: `essential ${translation}`,
        keywords: [
          { word, translation, pronunciation: `/${word}/` },
          { word: 'esencial', translation: 'essential', pronunciation: '/e.sen.sial/' }
        ]
      }
    ],
    exampleSentences: [
      {
        text: `Usamos ${word} cada día.`,
        translation: `We use ${translation} every day.`,
        keywords: [
          { word, translation, pronunciation: `/${word}/` }
        ]
      }
    ],
  };
}

export function generateFallbackLessonWords(input: {
  profession: string;
  language: string;
  subcategory: string;
  count: number;
  excludeWords?: string[];
}): GeneratedLessonWord[] {
  const templates = getLanguageAwareTemplates(input.profession, input.language);
  const excluded = new Set((input.excludeWords ?? []).map((word) => word.toLowerCase()));
  const results: GeneratedLessonWord[] = [];
  let cursor = 0;

  while (results.length < input.count) {
    const template = templates[cursor % templates.length];
    const suffix = cursor >= templates.length ? ` ${Math.floor(cursor / templates.length) + 1}` : '';
    const candidateWord = `${template.word}${suffix}`;

    if (!excluded.has(candidateWord.toLowerCase())) {
      const examples = buildExamples(candidateWord, template.translation);
      results.push({
        word: candidateWord,
        translation: `${template.translation}${suffix}`,
        subcategory: input.subcategory,
        complexityLevel: results.length < Math.ceil(input.count * 0.7) ? 'BEGINNER' : 'INTERMEDIATE',
        examplePhrases: examples.examplePhrases,
        exampleSentences: examples.exampleSentences,
        tags: template.tags,
      });
      excluded.add(candidateWord.toLowerCase());
    }

    cursor += 1;
  }

  return results;
}

export function generateFallbackStory(input: {
  language: string;
  profession: string;
  vocabulary: Array<{ word: string; translation: string }>;
}): GeneratedStoryContent {
  const vocabWords = input.vocabulary.map((entry) => entry.word);
  const content = [
    `Durante una jornada de ${input.profession}, el equipo practica ${input.language} usando palabras clave como ${vocabWords.join(', ')}.`,
    `Cada interacción refuerza el vocabulario profesional en un contexto realista y fácil de recordar.`,
  ].join(' ');

  const firstWord = input.vocabulary[0]?.word ?? 'palabra';
  const secondWord = input.vocabulary[1]?.translation ?? 'translation';

  return {
    content,
    vocabularyCoverage: vocabWords,
    questions: [
      {
        questionText: `¿Cuál de estas palabras apareció en la historia?`,
        options: [firstWord, 'oficina', 'descanso', 'silla'],
        correctAnswer: firstWord,
        questionType: 'MULTIPLE_CHOICE',
        position: 1,
      },
      {
        questionText: `Escribe la traducción de una palabra usada en la historia, por ejemplo ${firstWord}.`,
        correctAnswer: secondWord,
        questionType: 'SHORT_ANSWER',
        position: 2,
      },
    ],
  };
}

export function generateFallbackPronunciationExercises(input: {
  profession: string;
  vocabulary: string[];
}): GeneratedPronunciationExercise[] {
  return input.vocabulary.slice(0, 5).map((word, index) => ({
    targetText: `Repito ${word} con claridad para una situación de ${input.profession}.`,
    complexityLevel: index < 3 ? 'BEGINNER' : 'INTERMEDIATE',
    position: index + 1,
  }));
}
