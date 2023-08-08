import path from 'path';
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
export async function extractTextLanguage(text: string) {
  try {
    const detected = await classifier.predict(text, 1);

    if (detected.length == 0) {
      logger.warn({ text }, 'Failed to identify language');
      return LANG_UNKNOWN;
    }

    const language = detected[0].label.replace('__label__', '');
    logger.info({ text, language }, 'Language detected');

    return language;
  } catch (err) {
    logger.error({ err, text }, 'Failed to identify language');
  }

  return LANG_UNKNOWN;
}
