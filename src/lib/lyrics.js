import JSZip from 'jszip';

const SECTION_BASES = [
  "pre-chorus",
  "bridge tag",
  "instrumental",
  "interlude",
  "refrain",
  "verse",
  "chorus",
  "bridge",
  "intro",
  "outro",
  "ending",
  "turnaround",
  "tag",
];

const CHORD_TOKEN_RE = /^(?:[A-G](?:#|b)?(?:\d+)?(?:(?:maj|min|m|dim|aug|sus|add|no)\d*)?(?:\/[A-G](?:#|b)?)?|N\.?C\.?|x\d+|[-–—/.]+)$/i;

function decodeXmlEntities(value) {
  const entities = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
  };
  return value.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity[0] === "#") {
      const isHex = entity[1].toLowerCase() === "x";
      return String.fromCodePoint(Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10));
    }
    return entities[entity.toLowerCase()] ?? _;
  });
}

export function extractParagraphsFromDocumentXml(xml) {
  const paragraphs = [];
  const paragraphPattern = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
  let paragraphMatch;

  while ((paragraphMatch = paragraphPattern.exec(xml))) {
    const body = paragraphMatch[1];
    const chunks = [];
    const contentPattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br(?:\s[^>]*)?\s*\/>/g;
    let contentMatch;
    while ((contentMatch = contentPattern.exec(body))) {
      if (contentMatch[1] !== undefined) chunks.push(decodeXmlEntities(contentMatch[1]));
      else if (contentMatch[0].startsWith("<w:tab")) chunks.push("\t");
      else chunks.push("\n");
    }
    const lines = chunks.join("").replace(/\u00a0/g, " ").split(/\r?\n/);
    for (const line of lines) paragraphs.push(line.trim());
  }

  return paragraphs;
}

function baseAndNumber(label) {
  const normalized = label
    .toLowerCase()
    .replace(/[\[\]]/g, "")
    .replace(/[_–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(/^(pre[- ]?chorus|bridge\s+tag|instrumental|interlude|refrain|verse|chorus|bridge|intro|outro|ending|end|turnaround|tag)\s*(\d+)?\s*(alt)?$/i);
  if (!match) return null;
  const base = match[1].replace(/\s+/g, "-").replace("prechorus", "pre-chorus").replace(/^end$/, "ending");
  return { base, number: match[2] || "", variant: match[3] || "" };
}

function displayLabel(base, number = "", variant = "") {
  const names = {
    "pre-chorus": "Pre-Chorus",
    "bridge-tag": "Bridge Tag",
    instrumental: "Instrumental",
    interlude: "Interlude",
    refrain: "Refrain",
    verse: "Verse",
    chorus: "Chorus",
    bridge: "Bridge",
    intro: "Intro",
    outro: "Outro",
    ending: "Ending",
    turnaround: "Turnaround",
    tag: "Tag",
  };
  return `${names[base] || base}${number}${variant ? ` ${variant}` : ""}`;
}

export function parseSectionLabel(text) {
  const source = text.trim().replace(/[:：]\s*$/, "");
  const bracketed = source.match(/^\[\s*([^\]]+?)\s*\](?:\s*x\d+)?/i);
  let cleaned = bracketed ? bracketed[1] : source;
  cleaned = cleaned.replace(/\s+\d+x$/i, "");
  const short = cleaned.match(/^(pc|v|c|b|i|t|o|e)(\d+)$/i);
  if (short) {
    const bases = { pc: "pre-chorus", v: "verse", c: "chorus", b: "bridge", i: "intro", t: "tag", o: "outro", e: "ending" };
    cleaned = `${bases[short[1].toLowerCase()]}${short[2]}`;
  }
  const parsed = baseAndNumber(cleaned);
  if (!parsed) return null;
  return {
    key: `${parsed.base}${parsed.number}${parsed.variant}`,
    base: parsed.base,
    number: parsed.number,
    variant: parsed.variant,
    label: displayLabel(parsed.base, parsed.number, parsed.variant),
  };
}

function sequenceTokenToKey(token) {
  const normalized = token
    .trim()
    .replace(/[\[\]()]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (!normalized) return null;

  const short = normalized.match(/^(pc|p|v|c|b|i|t|o|e)(\d+|alt)?$/i);
  if (short) {
    const bases = { pc: "pre-chorus", p: "pre-chorus", v: "verse", c: "chorus", b: "bridge", i: "intro", t: "tag", o: "outro", e: "ending" };
    return `${bases[short[1]]}${short[2] || ""}`;
  }

  const long = baseAndNumber(normalized);
  return long ? `${long.base}${long.number}${long.variant}` : null;
}

export function parseSequenceText(text) {
  const cleaned = text.trim().replace(/^sequence\s*[:：]\s*/i, "");
  const rawTokens = cleaned.split(/\s*(?:-|–|—|→|>|,|\/|\|)\s*/).filter(Boolean);
  if (rawTokens.length < 2) return null;
  const expanded = rawTokens.map((token) => {
    const normalizedToken = token.trim().replace(/^quiet\s+/i, "");
    const trailingCount = normalizedToken.match(/^(.*?)(\d+)x$/i);
    const repeated = trailingCount || normalizedToken.match(/^(.*?)(?:x(\d+))?$/i);
    const key = sequenceTokenToKey(repeated?.[1] || normalizedToken);
    if (!key) return null;
    return Array.from({ length: Math.min(Number(repeated?.[2] || 1), 12) }, () => key);
  });
  return expanded.every(Boolean) ? expanded.flat() : null;
}

function stripOuterSequence(text) {
  let sequence = null;
  const title = text.replace(/\(([^()]*)\)/g, (full, inner) => {
    const parsed = parseSequenceText(inner);
    if (parsed) {
      sequence = parsed;
      return "";
    }
    return full;
  });
  return { title: title.replace(/\s+/g, " ").trim(), sequence };
}

function cleanTitle(rawTitle) {
  const extracted = stripOuterSequence(rawTitle);
  let titleSource = extracted.title;
  let sequence = extracted.sequence;
  if (!sequence) {
    const token = "(?:PC|P|V|C|B|I|T|O|E)(?:\\d+|alt)?(?:(?:x\\d+)|(?:\\d+x))?";
    const inlineSequence = titleSource.match(new RegExp(`\\s+(${token}(?:\\s*[-–—]\\s*${token})+)(?:\\s+.*)?$`, "i"));
    if (inlineSequence) {
      sequence = parseSequenceText(inlineSequence[1]);
      titleSource = titleSource.slice(0, inlineSequence.index);
    }
  }
  const title = titleSource
    .replace(/\s*[([]\s*(?:key\s*[:：]?\s*)?[A-G](?:#|b)?(?:m)?\s*[)\]]\s*$/i, "")
    .replace(/\s*\((?:key\s*[:：]?\s*)?[A-G](?:#|b)?(?:m)?\)\s*$/i, "")
    .replace(/\s*\[(?:key\s*[:：]?\s*)?[A-G](?:#|b)?(?:m)?\]\s*$/i, "")
    .replace(/\s+in\s+[A-G](?:#|b)?(?:m)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return { title: title || rawTitle.trim(), sequence };
}

function extractKey(rawTitle) {
  const match = rawTitle.match(/[([]\s*(?:key\s*[:：]?\s*)?([A-G](?:#|b)?m?)\s*[)\]]\s*$/i);
  return match?.[1] || "";
}

export function isChordOnly(text) {
  const value = text.replace(/\([^)]*\)/g, " ").trim();
  if (!value) return false;
  if (/[가-힣]/.test(value)) return false;
  const tokens = value
    .replace(/[|:]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[([{]+|[\])},.]+$/g, ""))
    .filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every((token) => CHORD_TOKEN_RE.test(token));
}

function cleanLyricLine(text) {
  if (isChordOnly(text)) return "";
  let value = text.trim();
  const leadingNote = value.match(/^\([^)]*\)\s*/);
  if (leadingNote) {
    const afterNote = value.slice(leadingNote[0].length).trim();
    const firstAfterNote = afterNote.split(/\s+/)[0]?.replace(/^[([{]+|[\])},.]+$/g, "");
    if (CHORD_TOKEN_RE.test(firstAfterNote || "")) value = afterNote;
  }
  const tokens = value.split(/\s+/);
  let chordCount = 0;
  while (tokens.length) {
    const token = tokens[0].replace(/^[([{]+|[\])},.]+$/g, "");
    if (!CHORD_TOKEN_RE.test(token)) break;
    tokens.shift();
    chordCount += 1;
  }
  const firstSourceToken = value.split(/\s+/)[0] || "";
  const ambiguousArticle = chordCount === 1
    && /^[A-G]$/.test(firstSourceToken)
    && !/^[A-G]\s{2,}/.test(value);
  if (chordCount && tokens.length && !ambiguousArticle) return tokens.join(" ").trim();
  return value;
}

function previousBlankCount(paragraphs, index) {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && !paragraphs[cursor].trim(); cursor -= 1) count += 1;
  return count;
}

function nextNonBlank(paragraphs, index, limit = 5) {
  const values = [];
  for (let cursor = index + 1; cursor < paragraphs.length && values.length < limit; cursor += 1) {
    if (paragraphs[cursor].trim()) values.push({ index: cursor, text: paragraphs[cursor].trim() });
  }
  return values;
}

function findSongStarts(paragraphs) {
  const first = paragraphs.findIndex((paragraph) => paragraph.trim());
  if (first < 0) return [];
  const starts = [first];

  for (let index = first + 1; index < paragraphs.length; index += 1) {
    const text = paragraphs[index].trim();
    if (!text) continue;
    if (parseSectionLabel(text) || parseSequenceText(text) || isChordOnly(text)) continue;
    const after = nextNonBlank(paragraphs, index, 3);
    const immediatelyHasSequence = after[0] && parseSequenceText(after[0].text);
    const hasEmbeddedSequence = Boolean(cleanTitle(text).sequence);
    const looksLikeStandaloneTitle = previousBlankCount(paragraphs, index) >= 1
      && text.length > 3
      && text === text.toUpperCase()
      && !/[\[\]]/.test(text)
      && after[0]
      && !parseSectionLabel(after[0].text);
    if (hasEmbeddedSequence || immediatelyHasSequence || looksLikeStandaloneTitle || (previousBlankCount(paragraphs, index) >= 2 && after.some((item) => parseSectionLabel(item.text)))) starts.push(index);
  }

  return starts;
}

function resolveSequence(keys, sections) {
  return keys
    .map((key) => {
      const exact = sections.find((section) => section.key === key);
      if (exact) return exact.id;
      const requestedBase = key.replace(/\d+$/, "");
      return sections.find((section) => section.base === requestedBase)?.id || null;
    })
    .filter(Boolean);
}

function parseSong(paragraphs, start, end, songIndex) {
  const rawTitle = paragraphs[start].trim();
  const cleanedTitle = cleanTitle(rawTitle);
  let explicitSequence = cleanedTitle.sequence;
  const sectionMap = new Map();
  const sectionOrder = [];
  const orphanLyrics = [];
  let currentSection = null;

  for (let index = start + 1; index < end; index += 1) {
    const text = paragraphs[index].trim();
    if (!text) continue;
    const standaloneSequence = parseSequenceText(text);
    if (standaloneSequence) {
      explicitSequence = standaloneSequence;
      continue;
    }

    const sectionLabel = parseSectionLabel(text);
    if (sectionLabel) {
      if (!sectionMap.has(sectionLabel.key)) {
        const section = {
          id: `song-${songIndex}-${sectionLabel.key}`,
          ...sectionLabel,
          lyrics: "",
        };
        sectionMap.set(sectionLabel.key, section);
      }
      currentSection = sectionMap.get(sectionLabel.key);
      sectionOrder.push(currentSection.id);
      continue;
    }

    const lyricLine = cleanLyricLine(text);
    if (!lyricLine) continue;
    if (!currentSection) {
      orphanLyrics.push(lyricLine);
      continue;
    }
    const existingLines = currentSection.lyrics ? currentSection.lyrics.split("\n") : [];
    if (!existingLines.includes(lyricLine)) currentSection.lyrics = [...existingLines, lyricLine].join("\n");
  }

  if (!sectionMap.size && orphanLyrics.length) {
    const section = {
      id: `song-${songIndex}-lyrics`,
      key: "lyrics",
      base: "lyrics",
      number: "",
      variant: "",
      label: "Lyrics",
      lyrics: orphanLyrics.join("\n"),
    };
    sectionMap.set(section.key, section);
    sectionOrder.push(section.id);
  } else if (sectionMap.size && orphanLyrics.length >= 3) {
    const section = {
      id: `song-${songIndex}-opening`,
      key: "opening",
      base: "opening",
      number: "",
      variant: "",
      label: "Verse",
      lyrics: orphanLyrics.join("\n"),
    };
    sectionMap.set(section.key, section);
    sectionOrder.unshift(section.id);
    explicitSequence = null;
  }

  const sections = [...sectionMap.values()].filter((section) => section.lyrics.trim());
  const validIds = new Set(sections.map((section) => section.id));
  const defaultSequence = explicitSequence
    ? resolveSequence(explicitSequence, sections)
    : sectionOrder.filter((id) => validIds.has(id));
  const fallbackSequence = defaultSequence.length ? defaultSequence : sections.map((section) => section.id);

  return {
    id: `song-${songIndex}`,
    title: cleanedTitle.title,
    sourceTitle: rawTitle,
    key: extractKey(rawTitle),
    included: true,
    sections,
    defaultSequence: [...fallbackSequence],
    sequence: [...fallbackSequence],
  };
}

export function parseSongsFromParagraphs(paragraphs) {
  const starts = findSongStarts(paragraphs);
  const parsed = starts
    .map((start, index) => parseSong(paragraphs, start, starts[index + 1] ?? paragraphs.length, index))
    .filter((song) => song.sections.length);
  const signatures = new Set();
  const normalizeForSignature = (value) => value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "");
  return parsed.filter((song) => {
    const signature = JSON.stringify({
      title: normalizeForSignature(song.title),
      sections: song.sections.map((section) => [normalizeForSignature(section.label), normalizeForSignature(section.lyrics)]),
      sequence: song.sequence.map((id) => song.sections.find((section) => section.id === id)?.label.toLowerCase()),
    });
    if (signatures.has(signature)) return false;
    signatures.add(signature);
    return true;
  });
}

export async function extractSongsFromDocx(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("올바른 Word DOCX 파일이 아닙니다.");
  const xml = await documentFile.async("string");
  return parseSongsFromParagraphs(extractParagraphsFromDocumentXml(xml));
}

export function buildLyricsText(songs, { includeTags = false } = {}) {
  return songs
    .filter((song) => song.included)
    .map((song) => {
      const sectionById = new Map(song.sections.map((section) => [section.id, section]));
      const parts = song.sequence
        .map((sectionId) => sectionById.get(sectionId))
        .filter((section) => section?.lyrics.trim())
        .map((section) => includeTags
          ? `[${section.label}]\n${section.lyrics.trim()}`
          : section.lyrics.trim());
      const separator = includeTags ? "\n\n" : "\n";
      return `*${song.title.trim()}\n${parts.join(separator)}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

export function inferOutputFilename(fileName) {
  const base = fileName.replace(/\.[^.]+$/, "");
  const monthNames = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const named = base.match(/(?:20)?(\d{2})\s*[-_ ]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*[-_ ]*(\d{1,2})/i);
  if (named) return `${named[1]}${String(monthNames[named[2].slice(0, 3).toLowerCase()]).padStart(2, "0")}${named[3].padStart(2, "0")}.txt`;
  const numeric = base.match(/(?:20)?(\d{2})\s*[-_ ]+(\d{1,2})\s*[-_ ]+(\d{1,2})/);
  if (numeric) return `${numeric[1]}${numeric[2].padStart(2, "0")}${numeric[3].padStart(2, "0")}.txt`;
  const compact = base.match(/(?:20)?(\d{2})(\d{2})(\d{2})/);
  if (compact) return `${compact[1]}${compact[2]}${compact[3]}.txt`;
  return `${base.replace(/\s+/g, "_")}.txt`;
}

export const sectionPresets = SECTION_BASES.map((base) => ({ base: base.replace(/\s+/g, "-"), label: displayLabel(base.replace(/\s+/g, "-")) }));
