import { BOOKS } from '../data/books.js';

const normalize = (value) => value.replace(/\s+/g, '').toLowerCase();
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const aliasMap = new Map();
for (const book of BOOKS) {
  for (const alias of book.aliases) aliasMap.set(normalize(alias), book);
}

const aliasPattern = [...new Set(BOOKS.flatMap((book) => book.aliases))]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|');

const colonPattern = new RegExp(
  `(?<book>${aliasPattern})\\.?\\s*(?<chapter>\\d+)\\s*[:：]\\s*(?<start>\\d+)(?:\\s*[-–~]\\s*(?<end>\\d+))?`,
  'giu',
);

const koreanPattern = new RegExp(
  `(?<book>${aliasPattern})\\.?\\s*(?<chapter>\\d+)\\s*[장편]\\s*(?<start>\\d+)(?:\\s*[-–~]\\s*(?<end>\\d+))?\\s*절`,
  'giu',
);

export function makeReference(book, chapter, verseStart, verseEnd = verseStart, extra = {}) {
  const start = Number(verseStart);
  const end = Math.max(Number(verseEnd || verseStart), start);
  return {
    id: extra.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    bookEn: book.en,
    bookKo: book.ko,
    slug: book.slug,
    chapter: Number(chapter),
    verseStart: start,
    verseEnd: end,
    englishTranslation: extra.englishTranslation || 'NIV',
    koreanTranslation: extra.koreanTranslation || 'GAE',
  };
}

export function extractReferences(text, defaults = {}) {
  const matches = [];
  for (const pattern of [colonPattern, koreanPattern]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      matches.push({ index: match.index, groups: match.groups });
    }
  }
  matches.sort((a, b) => a.index - b.index);

  const seen = new Set();
  const references = [];
  for (const { groups } of matches) {
    const book = aliasMap.get(normalize(groups.book));
    if (!book) continue;
    const start = Number(groups.start);
    const end = Number(groups.end || groups.start);
    const key = `${book.en}:${groups.chapter}:${start}:${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push(makeReference(book, Number(groups.chapter), start, end, defaults));
  }
  return references;
}

export function formatReference(reference, language = 'ko') {
  const book = language === 'en' ? reference.bookEn : reference.bookKo;
  const verses = reference.verseStart === reference.verseEnd
    ? reference.verseStart
    : `${reference.verseStart}-${reference.verseEnd}`;
  return `${book} ${reference.chapter}:${verses}`;
}

export function findBook(bookEn) {
  return BOOKS.find((book) => book.en === bookEn);
}

export function cloneReference(reference) {
  return { ...reference, id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}` };
}
