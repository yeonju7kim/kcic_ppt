const BASE_URL = 'https://unitedbibles.org/data/chapters';
const memoryCache = new Map();

function openCache() {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open('kcic-ppt-cache', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('chapters')) {
        request.result.createObjectStore('chapters');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readCachedChapter(key) {
  const database = await openCache();
  if (!database) return null;
  return new Promise((resolve) => {
    const request = database.transaction('chapters', 'readonly').objectStore('chapters').get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

async function saveCachedChapter(key, value) {
  const database = await openCache();
  if (!database) return;
  await new Promise((resolve) => {
    const transaction = database.transaction('chapters', 'readwrite');
    transaction.objectStore('chapters').put(value, key);
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
  });
}

async function getChapter(slug, chapter, language) {
  const key = `${slug}:${chapter}`;
  if (memoryCache.has(key)) return memoryCache.get(key);

  const cached = await readCachedChapter(key);
  if (cached) {
    memoryCache.set(key, cached);
    return cached;
  }

  const response = await fetch(`${BASE_URL}/${slug}/${chapter}.json`);
  if (!response.ok) {
    throw new Error(language === 'ko'
      ? `성경 본문을 불러오지 못했습니다. (${response.status})`
      : `Scripture text could not be loaded. (${response.status})`);
  }
  const data = await response.json();
  if (!Array.isArray(data.v)) {
    throw new Error(language === 'ko'
      ? '성경 본문 응답 형식이 올바르지 않습니다.'
      : 'The Scripture response format is invalid.');
  }

  memoryCache.set(key, data.v);
  await saveCachedChapter(key, data.v);
  return data.v;
}

function selectVerses(chapterData, reference, translation, language) {
  const verses = new Map(chapterData.map(([number, translations]) => [Number(number), translations]));
  const result = [];
  for (let number = reference.verseStart; number <= reference.verseEnd; number += 1) {
    const text = verses.get(number)?.[translation]?.trim();
    if (!text) {
      const book = language === 'ko' ? reference.bookKo : reference.bookEn;
      throw new Error(language === 'ko'
        ? `${book} ${reference.chapter}:${number}의 ${translation} 본문을 찾지 못했습니다.`
        : `${translation} text was not found for ${book} ${reference.chapter}:${number}.`);
    }
    result.push({ number, text });
  }
  return result;
}

export async function fetchPassages(references, onProgress, language = 'en') {
  const uniqueChapters = new Map();
  for (const reference of references) {
    uniqueChapters.set(`${reference.slug}:${reference.chapter}`, reference);
  }

  const chapterEntries = [...uniqueChapters.entries()];
  const chapters = new Map();
  let completed = 0;
  await Promise.all(chapterEntries.map(async ([key, reference]) => {
    const data = await getChapter(reference.slug, reference.chapter, language);
    chapters.set(key, data);
    completed += 1;
    onProgress?.(completed, chapterEntries.length, reference);
  }));

  return references.map((reference) => {
    const data = chapters.get(`${reference.slug}:${reference.chapter}`);
    return {
      reference,
      english: selectVerses(data, reference, reference.englishTranslation, language),
      korean: selectVerses(data, reference, reference.koreanTranslation, language),
    };
  });
}
