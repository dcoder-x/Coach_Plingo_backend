/**
 * Validate the configured AI provider key and confirm lesson generation works.
 *
 * Usage:
 *   ts-node --transpile-only scripts/test_ai_key.ts
 *
 * Reads AI_PROVIDER, OPENAI_API_KEY / OPENROUTER_API_KEY, and the model env
 * vars from .env (same as the production server). Sends one real generation
 * request and prints a pass/fail summary.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

// ── Config resolution (mirrors ClaudeClient) ─────────────────────────────────

type Provider = 'openai' | 'openrouter';

const provider: Provider =
  (process.env.AI_PROVIDER || 'openrouter').toLowerCase() === 'openai'
    ? 'openai'
    : 'openrouter';

const apiKey =
  provider === 'openai'
    ? process.env.OPENAI_API_KEY
    : process.env.OPENROUTER_API_KEY || process.env.CLAUDE_API_KEY;

const model =
  provider === 'openai'
    ? process.env.OPENAI_MODEL || 'gpt-4o-mini'
    : process.env.OPENROUTER_MODEL || process.env.CLAUDE_MODEL || 'anthropic/claude-3.5-sonnet';

const endpoint =
  provider === 'openai'
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(msg: string) { console.log(`  ✓  ${msg}`); }
function fail(msg: string) { console.error(`  ✗  ${msg}`); }
function info(msg: string) { console.log(`     ${msg}`); }

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nCoach Plingo — AI key validation\n');
  info(`Provider : ${provider}`);
  info(`Model    : ${model}`);
  info(`Endpoint : ${endpoint}`);
  console.log('');

  // 1. Key present
  if (!apiKey) {
    fail(
      provider === 'openai'
        ? 'OPENAI_API_KEY is not set in .env'
        : 'OPENROUTER_API_KEY (or CLAUDE_API_KEY) is not set in .env',
    );
    process.exit(1);
  }

  if (apiKey === 'YOUR_OPENAI_API_KEY' || apiKey.length < 20) {
    fail('API key looks like a placeholder or is too short.');
    process.exit(1);
  }

  ok('API key is present');

  // 2. Real generation — one Spanish word for a software scenario.
  //    This exercises the exact same code-path as lesson generation.
  console.log('\n  Sending a test generation request (1 word)…\n');

  const prompt = [
    'Return ONLY a valid JSON object. No markdown, no code fences, no prose.',
    'Generate exactly 1 Spanish vocabulary word for a software engineer in a "Technical Standup" scenario.',
    'Schema: { "words": [ { "word": "<es>", "ipa": "/<ipa>/", "complexityLevel": "beginner", ',
    '"examplePhrases": [{ "text": "<es phrase>", "translation": "<en translation>" }], ',
    '"fillGapSentences": [{ "template": "<es sentence with ___ blank>", "answer": "<word>", "templateTranslation": "<en>" }], ',
    '"tags": ["software"], "translations": { "en": "<translation>" } } ] }',
  ].join('');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL || 'http://localhost:3000';
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME || 'CoachPlingo';
  }

  let raw: string;
  try {
    const res = await axios.post(
      endpoint,
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.7,
      },
      { headers, timeout: 30_000 },
    );

    const choice = res.data?.choices?.[0];
    const finishReason = choice?.finish_reason;
    raw = choice?.message?.content?.trim() ?? '';

    if (!raw) {
      fail('Model returned an empty response.');
      process.exit(1);
    }

    if (finishReason === 'content_filter') {
      fail('Request was blocked by the content filter.');
      process.exit(1);
    }

    ok(`Model responded (finish_reason: ${finishReason ?? 'unknown'})`);
  } catch (err: unknown) {
    const status = axios.isAxiosError(err) ? err.response?.status : null;
    const body = axios.isAxiosError(err) ? JSON.stringify(err.response?.data) : '';
    if (status === 401) {
      fail('Invalid API key (401). Check OPENAI_API_KEY / OPENROUTER_API_KEY.');
    } else if (status === 403) {
      fail(`Forbidden (403) — key may lack access to model "${model}". ${body}`);
    } else if (status === 429) {
      fail('Rate-limited (429). The key works but has hit its quota.');
    } else if (status === 402) {
      fail('Insufficient credits (402). Top up your OpenRouter balance.');
    } else {
      fail(`Request failed (${status ?? 'network error'}): ${axios.isAxiosError(err) ? err.message : String(err)}`);
      if (body) info(body);
    }
    process.exit(1);
  }

  // 4. Validate the response parses as valid JSON with the expected shape.
  let parsed: { words?: unknown[] };
  try {
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```[a-z]*\n?/, '').replace(/```$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    fail('Model response is not valid JSON.');
    info('Raw response:');
    info(raw.slice(0, 500));
    process.exit(1);
  }

  if (!Array.isArray(parsed.words) || parsed.words.length === 0) {
    fail('JSON parsed but missing "words" array — model may be off-schema.');
    info(JSON.stringify(parsed, null, 2).slice(0, 500));
    process.exit(1);
  }

  const word = parsed.words[0] as Record<string, unknown>;
  ok(`JSON is valid — got word: "${word.word}" (${word.complexityLevel})`);

  const requiredFields = ['word', 'ipa', 'complexityLevel', 'examplePhrases', 'fillGapSentences', 'translations'];
  const missing = requiredFields.filter((f) => !(f in word));
  if (missing.length > 0) {
    fail(`Schema incomplete — missing fields: ${missing.join(', ')}`);
    process.exit(1);
  }

  ok('All required fields present');

  console.log('\n  ✅  API key is valid and lesson generation will work.\n');
}

main().catch((err) => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
