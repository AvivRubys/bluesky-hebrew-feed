import path from 'path';
import { Counter } from 'prom-client';
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

const classifier = new FastText.Classifier(path.join(__dirname, 'model.ftz'));
const indexer_language_detections = new Counter({
  name: 'indexer_language_detections',
  help: 'Results of language detections',
  labelNames: ['language', 'confidence'],
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

  indexer_language_detections.inc({
    language,
    confidence,
  });

  return language;
}
