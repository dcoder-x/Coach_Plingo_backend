import {
  ClaudeClient,
  GeneratedComprehensionPassage,
  GeneratedScenarioWord,
  ScenarioComprehensionInput,
  ScenarioGenerationInput,
} from './ClaudeClient';

export interface GenerateLessonInput extends ScenarioGenerationInput {
  passageCount?: 1 | 2;
}

export interface GeneratedLesson {
  words: GeneratedScenarioWord[];
  passages: GeneratedComprehensionPassage[];
}

export class LessonGeneratorClient {
  private static readonly MAX_WORD_GENERATION_ATTEMPTS = 6;

  constructor(private readonly claudeClient: ClaudeClient) {}

  async generateLesson(input: GenerateLessonInput): Promise<GeneratedLesson> {
    const targetCount = input.count ?? 10;

    const words = await this.generateWordsWithSupplement(input, targetCount);

    const comprehensionInput: ScenarioComprehensionInput = {
      profession: input.profession,
      subcategoryName: input.subcategoryName,
      scenarioName: input.scenarioName,
      targetLanguage: input.targetLanguage,
      baseLanguage: input.baseLanguages[0] ?? 'en',
      words: words.map((word) => ({ word: word.word })),
      passageCount: input.passageCount ?? 1,
    };

    let passages = await this.claudeClient.generateScenarioComprehension(comprehensionInput);

    const missingWords = this.collectMissingWords(passages, words.map((word) => word.word));
    if (missingWords.length > 0) {
      passages = await this.claudeClient.generateScenarioComprehension(comprehensionInput);
    }

    return { words, passages };
  }

  private async generateWordsWithSupplement(
    input: GenerateLessonInput,
    targetCount: number,
  ): Promise<GeneratedScenarioWord[]> {
    const acceptedWords: GeneratedScenarioWord[] = [];
    const seenWords = new Set((input.excludeWords ?? []).map((word) => word.toLowerCase()));

    for (
      let attempt = 0;
      attempt < LessonGeneratorClient.MAX_WORD_GENERATION_ATTEMPTS && acceptedWords.length < targetCount;
      attempt += 1
    ) {
      const remaining = targetCount - acceptedWords.length;
      let batch: GeneratedScenarioWord[];
      try {
        batch = await this.claudeClient.generateScenarioWords({
          ...input,
          count: remaining,
          excludeWords: [...seenWords],
        });
      } catch {
        // Transient model failure — skip this attempt and retry
        continue;
      }

      for (const word of batch) {
        const key = word.word.toLowerCase();
        if (seenWords.has(key)) {
          continue;
        }

        seenWords.add(key);
        acceptedWords.push(word);

        if (acceptedWords.length >= targetCount) {
          break;
        }
      }
    }

    if (acceptedWords.length < targetCount) {
      throw new Error(
        `Scenario generation returned only ${acceptedWords.length} acceptable words out of ${targetCount}`,
      );
    }

    return acceptedWords.slice(0, targetCount);
  }

  private collectMissingWords(passages: GeneratedComprehensionPassage[], words: string[]): string[] {
    const passageText = passages.map((passage) => passage.content.toLowerCase()).join(' ');
    return words.filter((word) => !passageText.includes(word.toLowerCase()));
  }
}
