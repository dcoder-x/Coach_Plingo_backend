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

  // Below this floor, a lesson isn't worth publishing even if the scenario's
  // vocabulary pool is exhausted — better to fail loudly than ship a thin lesson.
  private static readonly MIN_ACCEPTABLE_WORDS = 6;

  private async generateWordsWithSupplement(
    input: GenerateLessonInput,
    targetCount: number,
  ): Promise<GeneratedScenarioWord[]> {
    const acceptedWords: GeneratedScenarioWord[] = [];
    const seenWords = new Set((input.excludeWords ?? []).map((word) => word.toLowerCase()));
    let consecutiveZeroProgressAttempts = 0;

    for (
      let attempt = 0;
      attempt < LessonGeneratorClient.MAX_WORD_GENERATION_ATTEMPTS && acceptedWords.length < targetCount;
      attempt += 1
    ) {
      // Always request a full-size batch, not just the remaining count.
      // A request for "1-2 more words" gives the model little room to diversify,
      // and it tends to re-suggest the same already-excluded core terms.
      // Requesting the full target count each time — with the growing exclude
      // list — gives it more surface area to find genuinely new words.
      let batch: GeneratedScenarioWord[];
      try {
        batch = await this.claudeClient.generateScenarioWords({
          ...input,
          count: targetCount,
          excludeWords: [...seenWords],
        });
      } catch {
        // Transient model failure — skip this attempt and retry
        continue;
      }

      const countBefore = acceptedWords.length;

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

      if (acceptedWords.length === countBefore) {
        consecutiveZeroProgressAttempts += 1;
        // The model keeps re-suggesting words we've already excluded — the
        // scenario's natural vocabulary pool is exhausted. Stop burning
        // retries and accept what we have rather than exhausting all attempts.
        if (consecutiveZeroProgressAttempts >= 2 && acceptedWords.length >= LessonGeneratorClient.MIN_ACCEPTABLE_WORDS) {
          break;
        }
      } else {
        consecutiveZeroProgressAttempts = 0;
      }
    }

    const minAcceptable = Math.min(targetCount, LessonGeneratorClient.MIN_ACCEPTABLE_WORDS);
    if (acceptedWords.length < minAcceptable) {
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
