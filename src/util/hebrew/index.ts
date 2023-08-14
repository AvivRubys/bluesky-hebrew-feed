import path from 'path';
import { Histogram } from 'prom-client';
import FastText from 'fasttext';
import logger from '../../logger';

const hebrewLetters = new Set('אבגדהוזחטיכךלמםנןסעפףצץקרשת'.split(''));
export function hasHebrewLetters(text: string) {
  for (const letter of text) {
    if (hebrewLetters.has(letter)) {
      return true;
    }
  }

  return false;
}

export const LANGS_HEBREW = ['he', 'iw'];
export const LANGS_YIDDISH = ['yi'];
export const LANG_UNKNOWN = 'unknown';
export const HEBREW_LOOKALIKES = [
  ...LANGS_HEBREW,
  ...LANGS_YIDDISH,
  LANG_UNKNOWN,
];

const classifier = new FastText.Classifier(path.join(__dirname, 'model.ftz'));
const indexer_language_detections = new Histogram({
  name: 'indexer_language_detections',
  help: 'Results of language detections',
  labelNames: ['language'],
  buckets: [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2],
});
export async function extractTextLanguage(text: string) {
  let language = LANG_UNKNOWN;
  let confidence: number | undefined;

  try {
    const detected = await classifier.predict(text, 1);

    if (detected.length > 0) {
      language = detected[0].label.replace('__label__', '');
      confidence = detected[0].value;
    }
  } catch (err) {
    logger.error({ err, text }, 'Failed to identify language');
  }

  indexer_language_detections.observe({ language }, confidence ?? 0);

  return language;
}
