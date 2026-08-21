const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

let anthropic = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set — content generation is unavailable');
  }
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

function itemObjectSchema(properties, required) {
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties,
          required,
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  };
}

const SCHEMAS = {
  VOCAB: itemObjectSchema(
    { es: { type: 'string' }, en: { type: 'string' }, ex: { type: 'string' }, exen: { type: 'string' } },
    ['es', 'en', 'ex', 'exen']
  ),
  VOCAB_EASY: itemObjectSchema(
    { es: { type: 'string' }, en: { type: 'string' }, opts: { type: 'array', items: { type: 'string' } } },
    ['es', 'en', 'opts']
  ),
  LISTEN: itemObjectSchema(
    { es: { type: 'string' }, en: { type: 'string' } },
    ['es', 'en']
  ),
  LISTEN_EASY: itemObjectSchema(
    { es: { type: 'string' }, en: { type: 'string' }, wrong: { type: 'array', items: { type: 'string' } } },
    ['es', 'en', 'wrong']
  ),
  SPEAK: itemObjectSchema(
    { es: { type: 'string' }, en: { type: 'string' } },
    ['es', 'en']
  ),
  SPEAK_EASY: itemObjectSchema(
    { es: { type: 'string' }, en: { type: 'string' } },
    ['es', 'en']
  ),
  GRAMMAR: itemObjectSchema(
    {
      verb: { type: 'string' },
      pronoun: { type: 'string' },
      tense: { type: 'string' },
      sentence: { type: 'string' },
      answer: { type: 'string' },
      en: { type: 'string' },
    },
    ['verb', 'pronoun', 'tense', 'sentence', 'answer', 'en']
  ),
  GRAMMAR_EASY: itemObjectSchema(
    {
      verb: { type: 'string' },
      pronoun: { type: 'string' },
      sentence: { type: 'string' },
      answer: { type: 'string' },
      opts: { type: 'array', items: { type: 'string' } },
      en: { type: 'string' },
    },
    ['verb', 'pronoun', 'sentence', 'answer', 'opts', 'en']
  ),
  IMPROV_TOPICS: itemObjectSchema(
    { topic: { type: 'string' }, prompts: { type: 'array', items: { type: 'string' } } },
    ['topic', 'prompts']
  ),
};

const PROMPT_INTRO = {
  VOCAB:
    'Intermediate/advanced Spanish vocabulary: single words, verb phrases, or idioms useful for natural conversation. ' +
    'Each item needs an English translation ("en"), a natural Spanish example sentence ("ex"), and its English translation ("exen").',
  VOCAB_EASY:
    'Common, everyday beginner Spanish words (nouns, adjectives, simple verbs). Each item needs an English ' +
    'translation ("en") and an "opts" array of exactly 3 strings: the correct English translation plus 2 plausible-but-wrong ones, in any order.',
  LISTEN:
    'Natural, conversational Spanish sentences (intermediate level) with an English translation ("en"), suitable for a listening comprehension exercise.',
  LISTEN_EASY:
    'Short, simple Spanish sentences for beginners. Each item needs the Spanish sentence ("es"), its English ' +
    'translation ("en"), and a "wrong" array of exactly 2 near-miss variants of the same sentence (small word swaps) ' +
    'to use as multiple-choice distractors.',
  SPEAK:
    'Natural, conversational Spanish sentences (intermediate level) for a speaking/pronunciation practice exercise. ' +
    'Each item needs the Spanish sentence ("es") and its English translation ("en").',
  SPEAK_EASY:
    'Short, simple beginner Spanish sentences or phrases for a speaking practice exercise. ' +
    'Each item needs the Spanish sentence ("es") and its English translation ("en").',
  GRAMMAR:
    'Spanish verb conjugation drills at intermediate level, covering present/preterite/future/conditional tenses. ' +
    'Each item needs the infinitive "verb", the "pronoun", the "tense" name, a "sentence" with the verb blanked out as "___", ' +
    'the correct conjugated "answer", and "en": the English translation of the complete sentence (with the blank filled in by the answer).',
  GRAMMAR_EASY:
    'Spanish present-tense verb conjugation drills for beginners. Each item needs the infinitive "verb", the "pronoun", ' +
    'a "sentence" with the verb blanked out as "___", the correct "answer", an "opts" array of exactly 3 strings (the correct answer ' +
    'plus 2 plausible wrong conjugations), and "en": the English translation of the complete sentence (with the blank filled in by the answer).',
  IMPROV_TOPICS:
    'Everyday conversation topics in Spanish for a free-talk practice exercise. Each item needs a short "topic" phrase in Spanish and a "prompts" array of exactly 3 follow-up questions in Spanish.',
};

function normalizeText(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function itemKey(item) {
  if (typeof item === 'string') return normalizeText(item);
  if (item.es) return normalizeText(item.es);
  if (item.topic) return normalizeText(item.topic);
  if (item.sentence) return normalizeText(`${item.verb}|${item.pronoun}|${item.sentence}`);
  return normalizeText(JSON.stringify(item));
}

function dedupeAgainstExisting(newItems, existingItems) {
  const seen = new Set(existingItems.map(itemKey));
  const out = [];
  for (const item of newItems) {
    const key = itemKey(item);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function buildPrompt(category, existingSamples, count) {
  const intro = PROMPT_INTRO[category];
  const avoid = existingSamples.length
    ? `Do not repeat or closely paraphrase any of these already-used items:\n${existingSamples.join('\n')}\n\n`
    : '';
  return (
    `Generate exactly ${count} new items for a Spanish-learning app. Category: ${category}.\n` +
    `${intro}\n\n${avoid}Return them as JSON matching the given schema. Vary the topics, tenses, and grammar patterns naturally — don't cluster around one theme.`
  );
}

async function generateItems(category, existingItems, count) {
  const schema = SCHEMAS[category];
  if (!schema) throw new Error(`Unknown category: ${category}`);

  const existingSamples = existingItems.map(itemKey).filter(Boolean).slice(-150);
  const prompt = buildPrompt(category, existingSamples, count);

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema },
    },
    messages: [{ role: 'user', content: prompt }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Content generation was declined');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No content returned from generation');
  const parsed = JSON.parse(textBlock.text);
  const items = parsed.items || [];
  return dedupeAgainstExisting(items, existingItems);
}

module.exports = { generateItems, SCHEMAS, dedupeAgainstExisting, itemKey };
