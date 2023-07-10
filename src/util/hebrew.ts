import cld from 'cld';
import logger from '../logger';

const hebrewLetters = new Set('אבגדהוזחטיכךלמםנןסעפףצץקרשת'.split(''));
function hasHebrewLetters(text: string) {
  for (const letter of text) {
    if (hebrewLetters.has(letter)) {
      return true;
    }
  }

  return false;
}

export const LANG_HEBREW = cld.LANGUAGES['HEBREW'];
export const LANG_YIDDISH = cld.LANGUAGES['YIDDISH'];

export async function extractTextLanguage(text: string) {
  if (!hasHebrewLetters(text)) {
    return;
  }

  try {
    const detected = await cld.detect(text);
    const language = detected.languages[0].code;

    logger.info({ text, language }, 'Language detected');

    if (language === LANG_HEBREW || language === LANG_YIDDISH) {
      return language;
    }
  } catch (err) {
    logger.warn({ text }, 'Failed to identify language');
  }
}
