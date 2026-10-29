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
  "coda",
  "extra",
  "last-bridge",
];

const CHORD_TOKEN_RE = /^(?:[A-G](?:#|b)?(?:maj|min|m|dim|aug)?\d*(?:(?:sus|add|no|maj|min|dim|aug)\d*)?(?:[#b]\d+)?(?:\/[A-G](?:#|b)?)?|N\.?C\.?|x\d+|[-–—/.]+)$/i;
const SECTION_NAME = 'pre[- ]?chorus|bridge[- ]?tag|last[- ]?bridge|instrumental|interlude|refrain|verse|chorus|bridge|intro|outro|ending|end|turnaround|tag|coda|extra';
const PERFORMANCE_NOTE_RE = new RegExp(`^(?:${[
  'note\\s*[:：]',
  'https?://',
  'the rest is (?:the )?same',
  'slight change to',
  'building up\\b',
  'slow ending\\b',
  '(?:drums?|bass|pianos?|guitars?|acoustic|electric|elec|pads?|cymbals?|full sound)\\b',
  '(?:go(?:ing)?\\s+(?:louder|to\\s+(?:verse|chorus|bridge|ending))|com(?:e|ing)\\s+in(?:\\s+full)?)(?:$|[,.])',
  '(?:to\\s+)?(?:quiet|loud)(?:er|est)?(?:$|[,.]|\\s+(?:with|at|on|then)\\b)',
  '\\d+\\s*bars?\\b',
  '(?:start|end)\\s+in\\s+[A-G]\\b',
  'intro melody\\b',
  'w/\\s*snares\\b',
].join('|')})`, 'i');

function repetitionIn(text) {
  const match = text.match(/(?:^|[\s(\]])x\s*(\d+)(?=$|[\s)\],])/i)
    || text.match(/(?:^|[\s(\]])(\d+)\s*x(?=$|[\s)\],])/i);
  return Math.max(1, Math.min(Number(match?.[1] || 1), 12));
}

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
    const contentPattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)(?:\s[^>]*)?\s*\/>/g;
    let contentMatch;
    while ((contentMatch = contentPattern.exec(body))) {
      if (contentMatch[1] !== undefined) chunks.push(decodeXmlEntities(contentMatch[1]));
      else if (contentMatch[0].startsWith("<w:tab")) chunks.push("\t");
      else chunks.push("\n");
    }
    const lines = chunks.join("").replace(/\u00a0/g, " ").split(/\r?\n/);
    for (const line of lines) paragraphs.push(line.trimEnd());
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
  const match = normalized.match(new RegExp(`^(${SECTION_NAME})\\s*(\\d+)?\\s*(alt\\d*)?$`, 'i'));
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
    coda: "Coda",
    extra: "Extra",
    "last-bridge": "Last Bridge",
  };
  return `${names[base] || base}${number}${variant ? ` ${variant}` : ""}`;
}

export function parseSectionLabel(text) {
  const source = text.trim().replace(/[:：]\s*$/, "");
  const bracketed = source.match(/^\[\s*([^\]]+?)\s*\]/i);
  const inline = !bracketed && source.match(new RegExp(`^(${SECTION_NAME})(?:\\s*(\\d+))?\\s*[:：]`, 'i'));
  let cleaned = bracketed ? bracketed[1].split(',')[0] : inline ? `${inline[1]}${inline[2] || ''}` : source;
  const repeat = repetitionIn(bracketed ? `${cleaned} ${source.slice(bracketed[0].length)}` : cleaned);
  cleaned = cleaned.replace(/\s+(?:x\s*\d+|\d+\s*x)$/i, "");
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
    repeat,
  };
}

function sequenceTokenToKey(token) {
  const normalized = token
    .trim()
    .replace(/[\[\]()]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (!normalized) return null;

  if (normalized === 'lb') return 'last-bridge';
  const bridgeTag = normalized.match(/^b(\d+)t$/i);
  if (bridgeTag) return `bridge-tag${bridgeTag[1]}`;
  const short = normalized.match(/^(pc|p|v|c|b|i|t|o|e)(\d+|alt)?$/i);
  if (short) {
    const bases = { pc: "pre-chorus", p: "pre-chorus", v: "verse", c: "chorus", b: "bridge", i: "intro", t: "tag", o: "outro", e: "ending" };
    return `${bases[short[1]]}${short[2] || ""}`;
  }

  const long = baseAndNumber(normalized);
  return long ? `${long.base}${long.number}${long.variant}` : null;
}

export function parseSequenceText(text) {
  const cleaned = text.trim()
    .replace(/^(?:sequence|option\s*\d+)\s*[:：]\s*/i, "")
    .replace(/pre-chorus/gi, 'prechorus')
    .replace(/bridge-tag/gi, 'bridge tag')
    .replace(/last-bridge/gi, 'last bridge');
  const rawTokens = cleaned.split(/\s*(?:-|–|—|→|>|,|\/|\|)\s*/).filter(Boolean);
  if (rawTokens.length < 2) return null;
  const expanded = rawTokens.map((token) => {
    let normalizedToken = token.trim().replace(/^quiet\s+/i, "");
    let count = 1;
    normalizedToken = normalizedToken.replace(/\(([^()]*)\)/g, (_, note) => {
      count = repetitionIn(note);
      return '';
    }).trim();
    const repeated = normalizedToken.match(/^(.*?)(?:x\s*(\d+)|(\d+)\s*x)$/i);
    if (repeated) {
      normalizedToken = repeated[1].trim();
      count = Math.max(1, Math.min(Number(repeated[2] || repeated[3]), 12));
    }
    const key = sequenceTokenToKey(normalizedToken);
    if (!key) return null;
    return Array.from({ length: count }, () => key);
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
    .replace(/^\*+\s*/, "")
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
  const value = text
    .replace(/\(([^)]*)(?:\)|$)/g, (_, inner) => CHORD_TOKEN_RE.test(inner.trim()) ? ` ${inner} ` : ' ')
    .replace(/\[[^\]]*(?:\]|$)/g, ' ')
    .trim();
  if (!value) return false;
  if (/[가-힣]/.test(value)) return false;
  const tokens = value
    .replace(/[|:–—-]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[([{]+|[\])},.]+$/g, ""))
    .filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every((token) => CHORD_TOKEN_RE.test(token));
}

function isPerformanceNote(text) {
  const value = text.trim().replace(/^[(*\s]+|[)*\s]+$/g, '');
  return PERFORMANCE_NOTE_RE.test(value)
    || /^\[[^\]]+\]/.test(value)
    || /\s\|\s/.test(value);
}

function cleanLyricLine(text) {
  if (isChordOnly(text)) return "";
  let value = text.trim()
    .replace(/\(([^)]*)\)/g, (full, note) => isPerformanceNote(note) ? ' ' : full)
    .replace(/[↗↘↙↖]/g, '')
    .replace(/[↳→].*$/, '')
    .replace(/\*+$/g, '')
    .trim();
  if (!value || isPerformanceNote(value)) return '';
  value = value.replace(/\([^)]*$/, '').trim();
  if (isChordOnly(value)) return '';
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
  if (chordCount && isPerformanceNote(tokens.join(' '))) return '';
  if (chordCount && tokens.length && !ambiguousArticle) value = tokens.join(" ").trim();
  if (isPerformanceNote(value) || isChordOnly(value)) return '';
  return value.replace(/([a-z])\s+-\s+([a-z])/gi, '$1$2').trim();
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
    if (text.startsWith("*")) {
      starts.push(index);
      continue;
    }
    if (parseSectionLabel(text) || parseSequenceText(text) || isChordOnly(text)) continue;
    if (isPerformanceNote(text)) continue;
    const after = nextNonBlank(paragraphs, index, 3);
    const immediatelyHasSequence = after[0] && parseSequenceText(after[0].text);
    const hasEmbeddedSequence = Boolean(cleanTitle(text).sequence);
    const hasKey = Boolean(extractKey(text));
    const looksLikeStandaloneTitle = previousBlankCount(paragraphs, index) >= 1
      && text.length > 3
      && text === text.toUpperCase()
      && !/[\[\]]/.test(text)
      && after[0]
      && !parseSectionLabel(after[0].text);
    if (hasKey || hasEmbeddedSequence || immediatelyHasSequence || looksLikeStandaloneTitle || (previousBlankCount(paragraphs, index) >= 2 && after[0] && parseSectionLabel(after[0].text))) starts.push(index);
  }

  return starts;
}

function sectionForKey(key, sections) {
  const exact = sections.find((section) => section.key === key);
  if (exact) return exact;
  const requestedBase = key.replace(/(?:\d+|alt\d*)$/, '');
  if (requestedBase === 'last-bridge') return sections.findLast((section) => section.base === 'bridge');
  if (requestedBase === 'tag' && !sections.some((section) => section.base === 'tag')) {
    return sections.find((section) => section.base === 'turnaround');
  }
  return sections.find((section) => section.base === requestedBase) || null;
}

function resolveSequence(keys, sections, occurrences) {
  const requested = keys.map((key) => sectionForKey(key, sections));
  // Align the written order with the section occurrences so a later lyric
  // variation is used at its own position, while unwritten repeats reuse lyrics.
  const lengths = Array.from({ length: requested.length + 1 }, () => new Uint32Array(occurrences.length + 1));
  for (let i = requested.length - 1; i >= 0; i -= 1) {
    for (let j = occurrences.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = requested[i]?.key === occurrences[j].key
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const aligned = new Map();
  let i = 0;
  let j = 0;
  while (i < requested.length && j < occurrences.length) {
    if (requested[i]?.key === occurrences[j].key) {
      aligned.set(i, occurrences[j].id);
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) i += 1;
    else j += 1;
  }
  const previous = new Map();
  return requested.map((section, index) => {
    if (!section) return null;
    const id = aligned.get(index) || previous.get(section.key) || section.id;
    previous.set(section.key, id);
    return id;
  }).filter(Boolean);
}

function parseSong(paragraphs, start, end, songIndex) {
  const rawTitle = paragraphs[start].trim();
  const cleanedTitle = cleanTitle(rawTitle);
  let explicitSequence = cleanedTitle.sequence;
  const occurrences = [];
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
      currentSection = { ...sectionLabel, lines: [] };
      occurrences.push(currentSection);
      continue;
    }

    if (currentSection && /^the rest is (?:the )?same\b/i.test(text)) {
      currentSection.completeFromPrevious = true;
      continue;
    }
    const lyricLine = cleanLyricLine(text);
    if (!lyricLine) continue;
    if (!currentSection) {
      orphanLyrics.push(lyricLine);
      continue;
    }
    currentSection.lines.push(lyricLine);
  }

  if (orphanLyrics.length && (!occurrences.length || orphanLyrics.length >= 3)) {
    const opening = Boolean(occurrences.length);
    occurrences.unshift({
      key: opening ? 'opening' : 'lyrics',
      base: opening ? 'opening' : 'lyrics',
      number: '', variant: '', label: opening ? 'Verse' : 'Lyrics',
      repeat: 1, lines: orphanLyrics,
    });
    if (opening) explicitSequence = null;
  }

  const sections = [];
  const normalizedLyrics = (value) => value.replace(/\s+/g, ' ').trim();
  for (const occurrence of occurrences) {
    if (!occurrence.lines.length) continue;
    let lyrics = occurrence.lines.join('\n');
    const previousDefinition = sections.findLast((section) => section.key === occurrence.key);
    if (occurrence.completeFromPrevious && previousDefinition) {
      lyrics = [...occurrence.lines, ...previousDefinition.lyrics.split('\n').slice(occurrence.lines.length)].join('\n');
    }
    let section = sections.find((candidate) => candidate.key === occurrence.key
      && normalizedLyrics(candidate.lyrics) === normalizedLyrics(lyrics));
    if (!section) {
      const { lines, repeat, completeFromPrevious, ...label } = occurrence;
      const variantCount = sections.filter((candidate) => candidate.key === occurrence.key).length;
      section = {
        ...label,
        id: `song-${songIndex}-${occurrence.key}${variantCount ? `-alt${variantCount}` : ''}`,
        label: `${label.label}${variantCount ? ` alt${variantCount > 1 ? variantCount : ''}` : ''}`,
        lyrics,
      };
      sections.push(section);
    }
    occurrence.section = section;
  }

  const sectionOrder = [];
  const previous = new Map();
  for (const occurrence of occurrences) {
    const section = occurrence.section || previous.get(occurrence.key) || sectionForKey(occurrence.key, sections);
    if (!section) continue;
    previous.set(occurrence.key, section);
    for (let count = 0; count < occurrence.repeat; count += 1) {
      sectionOrder.push({ key: section.key, id: section.id });
    }
  }

  const unresolvedSections = [...new Set(explicitSequence || [])]
    .filter((key) => !sectionForKey(key, sections)
      && !/^(?:intro|outro|ending|instrumental|interlude|turnaround)\d*$/.test(key))
    .map((key) => {
      const parsed = baseAndNumber(key);
      return parsed ? displayLabel(parsed.base, parsed.number, parsed.variant) : key;
    });

  const defaultSequence = explicitSequence
    ? resolveSequence(explicitSequence, sections, sectionOrder)
    : sectionOrder.map((occurrence) => occurrence.id);
  const fallbackSequence = defaultSequence.length ? defaultSequence : sections.map((section) => section.id);

  return {
    id: `song-${songIndex}`,
    title: cleanedTitle.title,
    sourceTitle: rawTitle,
    key: extractKey(rawTitle),
    included: true,
    sections,
    unresolvedSections,
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

export function buildLyricsText(songs, { includeTags = false, includeSequence = false } = {}) {
  return songs
    .filter((song) => song.included)
    .map((song) => {
      const sectionById = new Map(song.sections.map((section) => [section.id, section]));
      const sequence = song.sequence
        .map((sectionId) => sectionById.get(sectionId))
        .filter((section) => section?.lyrics.trim());
      const sections = includeSequence
        ? [...new Map(sequence.map((section) => [section.id, section])).values()]
        : sequence;
      const parts = sections.map((section) => includeTags || includeSequence
          ? `[${section.label}]\n${section.lyrics.trim()}`
          : section.lyrics.trim());
      if (includeSequence && sequence.length) {
        return `*${song.title.trim()}\nSequence: ${sequence.map((section) => section.label).join(' - ')}\n\n${parts.join('\n\n')}`;
      }
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
  const retreatDate = base.match(/\b20(\d{2})\b.*\((\d{1,2})[_/-](\d{1,2})\)/);
  if (retreatDate) return `${retreatDate[1]}${retreatDate[2].padStart(2, '0')}${retreatDate[3].padStart(2, '0')}.txt`;
  return `${base.replace(/\s+/g, "_")}.txt`;
}

export const sectionPresets = SECTION_BASES.map((base) => ({ base: base.replace(/\s+/g, "-"), label: displayLabel(base.replace(/\s+/g, "-")) }));
