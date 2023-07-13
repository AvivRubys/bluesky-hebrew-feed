import cld from 'cld';
import logger from '../logger';

const hebrewLetters = new Set('אבגדהוזחטיכךלמםנןסעפףצץקרשת'.split(''));
export function hasHebrewLetters(text: string) {
  for (const letter of text) {
    if (hebrewLetters.has(letter)) {
      return true;
    }
  }

  return false;
}

export const LANG_HEBREW = cld.LANGUAGES['HEBREW'];
export const LANG_YIDDISH = cld.LANGUAGES['YIDDISH'];
export const LANG_UNKNOWN = 'unknown';

export async function extractTextLanguage(text: string) {
  try {
    const detected = await cld.detect(text);
    const language = detected.languages[0].code;

    logger.info({ text, language }, 'Language detected');

    return language;
  } catch (err) {
    logger.warn({ text }, 'Failed to identify language');
  }

  return LANG_UNKNOWN;
}
