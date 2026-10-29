import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  buildLyricsText, extractParagraphsFromDocumentXml, extractSongsFromDocx,
  inferOutputFilename, isChordOnly, parseSectionLabel, parseSequenceText, parseSongsFromParagraphs,
} from './lyrics.js';

const sequenceLabels = (song) => song.sequence.map((id) => song.sections.find((section) => section.id === id).label);

describe('lyrics parser', () => {
  it('extracts groups, removes chord lines, and applies an explicit sequence', () => {
    const songs = parseSongsFromParagraphs([
      'Example Song (V1-C-V2-C)', '', '[Verse 1]', 'C   G/B   Am7   F', 'First verse', '',
      '[Chorus]', 'F   G   C', 'Main chorus', '', '[Verse 2]', 'Second verse',
    ]);
    expect(songs).toHaveLength(1);
    expect(songs[0].sections.map((section) => section.label)).toEqual(['Verse1', 'Chorus', 'Verse2']);
    expect(buildLyricsText(songs)).toBe('*Example Song\nFirst verse\nMain chorus\nSecond verse\nMain chorus');
    expect(buildLyricsText(songs, { includeTags: true })).toContain('[Verse1]\nFirst verse');
  });

  it('recognizes common chord and filename formats', () => {
    expect(isChordOnly('C#7   Bm7   A/C#   E7sus')).toBe(true);
    expect(isChordOnly('Above all powers')).toBe(false);
    expect(inferOutputFilename('2026 Sep_18_FPN.docx')).toBe('260918.txt');
    expect(inferOutputFilename('FPN 26_10_23.docx')).toBe('261023.txt');
  });

  it('reads plain TXT output with starred song titles', () => {
    const songs = parseSongsFromParagraphs([
      '*First Song', 'First line', 'Second line', '',
      '*Second Song', '[Verse1]', 'Another line',
    ]);
    expect(songs.map((song) => song.title)).toEqual(['First Song', 'Second Song']);
    expect(buildLyricsText(songs)).toContain('*Second Song\nAnother line');
  });

  it.each([
    ['I–V1-PC-C(2x)-B1-B2-C(2x)-Outro', ['intro', 'verse1', 'pre-chorus', 'chorus', 'chorus', 'bridge1', 'bridge2', 'chorus', 'chorus', 'outro']],
    ['Option 1: I-V1-C-V2-C-C(ending)', ['intro', 'verse1', 'chorus', 'verse2', 'chorus', 'chorus']],
    ['V1-C2x-Bx2-C(quiet)', ['verse1', 'chorus', 'chorus', 'bridge', 'bridge', 'chorus']],
    ['V-PC-C-B1T-B2T-LB-E', ['verse', 'pre-chorus', 'chorus', 'bridge-tag1', 'bridge-tag2', 'last-bridge', 'ending']],
    ['Verse1 - Pre-Chorus - Chorus', ['verse1', 'pre-chorus', 'chorus']],
  ])('recognizes the complete sequence %s', (source, expected) => {
    expect(parseSequenceText(source)).toEqual(expected);
  });

  it.each([
    ['[Chorus, Loud/Full]x2', 'chorus', 2],
    ['[Verse 3, starts quiet]:', 'verse3', 1],
    ['[Verse 1] x 2', 'verse1', 2],
    ['[Chorus 2x]', 'chorus', 2],
    ['[Last Bridge] (build)', 'last-bridge', 1],
    ['[Extra]', 'extra', 1],
    ['[Coda] only drum here', 'coda', 1],
    ['Intro : E Esus (relaxed, acoustic)', 'intro', 1],
  ])('recognizes annotated section %s', (source, key, repeat) => {
    expect(parseSectionLabel(source)).toMatchObject({ key, repeat });
  });

  it.each([
    'D/F#-G    G/B-C    D-Em     G/B-C',
    '|G / / /| / / / / /| G2/E / / /|',
    '(E)',
    'A N.C.(A-G#-F-#-E-F#-G#',
    'E/G# A2 [intro melody till next line?]',
    '(bass enter) A E/G# F#m7 E',
    'D(Pianos) Am',
  ])('removes chord-only notation %s', (source) => {
    expect(isChordOnly(source)).toBe(true);
  });

  it('keeps repeated lyric lines and reuses whole repeated sections', () => {
    const songs = parseSongsFromParagraphs([
      'Repeated Song (E)', '[Chorus]', 'C G', 'Sing again', 'Sing again',
      '[Chorus] x2', '[Chorus]', 'Sing again', 'Sing again',
    ]);
    expect(songs[0].sections).toHaveLength(1);
    expect(songs[0].sections[0].lyrics).toBe('Sing again\nSing again');
    expect(sequenceLabels(songs[0])).toEqual(['Chorus', 'Chorus', 'Chorus', 'Chorus']);
  });

  it('uses later lyric variations in the explicit sequence without merging verses', () => {
    const [song] = parseSongsFromParagraphs([
      'Changed Song (G)', 'V1-C-V2-C-C(ending)',
      '[Verse 1]', 'First verse', '[Chorus]', 'First refrain',
      '[Verse 2]', 'Second verse', '[Chorus]', '[Chorus]', 'Final refrain',
    ]);
    expect(sequenceLabels(song)).toEqual(['Verse1', 'Chorus', 'Verse2', 'Chorus', 'Chorus alt']);
    expect(song.sections.find((section) => section.label === 'Chorus').lyrics).toBe('First refrain');
    expect(song.sections.find((section) => section.label === 'Chorus alt').lyrics).toBe('Final refrain');
    expect(buildLyricsText([song])).toBe('*Changed Song\nFirst verse\nFirst refrain\nSecond verse\nFirst refrain\nFinal refrain');
  });

  it('does not multiply section repeats twice when an explicit order is provided', () => {
    const [song] = parseSongsFromParagraphs([
      'Repeat Counts (G)', 'V-C(2x)-B-C2x',
      '[Verse]', 'Verse words', '[Chorus]x2', 'Chorus words',
      '[Bridge]', 'Bridge words', '[Chorus]x2',
    ]);
    expect(sequenceLabels(song)).toEqual(['Verse', 'Chorus', 'Chorus', 'Bridge', 'Chorus', 'Chorus']);
  });

  it('removes performance notes while retaining sung parentheticals and articles', () => {
    const [song] = parseSongsFromParagraphs([
      'Clean Song (E)', '[Verse]', 'A new day', 'C drum comes in',
      'C#7       Another lyric (drum enter)', 'Another line ↳going to verse',
      '↗Sing this****', '(to quiet)', 'building up → medium → loud',
      'Note : use the recording timestamps', '[Try Interlude 1 Bar, then enter v3 Quiet]',
      'A sung line (let it rise)', 'Come in Your power', 'Quiet my soul',
    ]);
    expect(song.sections[0].lyrics).toBe('A new day\nAnother lyric\nAnother line\nSing this\nA sung line (let it rise)\nCome in Your power\nQuiet my soul');
  });

  it('fills in an abbreviated reprise when the sheet says the rest is the same', () => {
    const [song] = parseSongsFromParagraphs([
      'Partial Reprise (E)', 'C1-B-C1', '[Chorus 1]', 'First line', 'Second line', 'Third line',
      '[Bridge]', 'Bridge line', '[Chorus 1]', '(slight change to the first line:',
      'Changed first line', 'The rest is same as Chorus 1)',
    ]);
    expect(sequenceLabels(song)).toEqual(['Chorus1', 'Bridge', 'Chorus1 alt']);
    expect(song.sections.at(-1).lyrics).toBe('Changed first line\nSecond line\nThird line');
  });

  it('reports missing lyric groups without discarding the rest of the sequence', () => {
    const [song] = parseSongsFromParagraphs([
      'Incomplete Sheet (C)', 'I-V1-C1-B1T-C2-B2T-E',
      '[Verse 1]', 'Verse words', '[Chorus]', 'Chorus words',
    ]);
    expect(song.unresolvedSections).toEqual(['Bridge Tag1', 'Bridge Tag2']);
    expect(sequenceLabels(song)).toEqual(['Verse1', 'Chorus', 'Chorus']);
  });

  it('reads Word run breaks, tabs and XML entities', () => {
    expect(extractParagraphsFromDocumentXml('<w:p><w:r><w:t>A &amp; B</w:t><w:tab/><w:t>line</w:t><w:cr/><w:t>Next</w:t><w:br/><w:t>Last</w:t></w:r></w:p>'))
      .toEqual(['A & B\tline', 'Next', 'Last']);
  });

  it('infers a retreat date written separately from its year', () => {
    expect(inferOutputFilename('Worship Setlist 2026 Fall Retreat Sunday Afternoon (10_31).docx')).toBe('261031.txt');
  });
});

describe('sequence and one copy of each part', () => {
  it('writes the full order and each named part once, preserving repeated lines inside a part', () => {
    const songs = parseSongsFromParagraphs([
      'Example Song (G)', 'V1-C-V2-C-C',
      '[Verse 1]', 'First verse', 'First verse', '[Chorus]', 'Main chorus',
      '[Verse 2]', 'Second verse',
    ]);
    const output = buildLyricsText(songs, { includeSequence: true });
    expect(output).toBe([
      '*Example Song', 'Sequence: Verse1 - Chorus - Verse2 - Chorus - Chorus', '',
      '[Verse1]', 'First verse', 'First verse', '',
      '[Chorus]', 'Main chorus', '', '[Verse2]', 'Second verse',
    ].join('\n'));
    expect(buildLyricsText(songs)).toBe('*Example Song\nFirst verse\nFirst verse\nMain chorus\nSecond verse\nMain chorus\nMain chorus');
  });

  it('follows edited order, keeps variant parts separate, and omits unused or empty parts', () => {
    const [song] = parseSongsFromParagraphs([
      'Edited Song (E)', '[Verse]', 'Same words', '[Chorus]', 'Same words',
      '[Chorus]', 'Changed chorus', '[Ending]', 'Unused ending',
    ]);
    const [verse, chorus, variant] = song.sections;
    song.sections.push({ id: 'empty', label: 'Empty', lyrics: '  ' });
    song.sequence = [variant.id, 'missing', chorus.id, 'empty', verse.id, variant.id];
    const output = buildLyricsText([song], { includeSequence: true });
    expect(output).toBe([
      '*Edited Song', 'Sequence: Chorus alt - Chorus - Verse - Chorus alt', '',
      '[Chorus alt]', 'Changed chorus', '', '[Chorus]', 'Same words', '', '[Verse]', 'Same words',
    ].join('\n'));
    expect(output).not.toMatch(/Ending|Empty|undefined|missing/);
  });

  it('prints separate sequences only for included songs', () => {
    const songs = parseSongsFromParagraphs([
      '*First Song', '[Verse]', 'First words',
      '*Skipped Song', '[Verse]', 'Skipped words',
      '*Last Song', '[Chorus]', 'Last words', '[Chorus]',
    ]);
    songs[1].included = false;
    expect(buildLyricsText(songs, { includeSequence: true })).toBe([
      '*First Song', 'Sequence: Verse', '', '[Verse]', 'First words', '',
      '*Last Song', 'Sequence: Chorus - Chorus', '', '[Chorus]', 'Last words',
    ].join('\n'));
  });
});

// Synthetic lyrics reproduce the three document layouts without storing song lyrics.
const retreatLayouts = [
  {
    name: 'Sunday morning',
    titles: ['New Name Written Down In Glory', 'Indescribable', 'Lord I Need You', 'Living Hope', 'Great Are You Lord'],
    paragraphs: [
      'New Name Written Down In Glory (Key : G)',
      'I - V1 - PC - C - V2 - PC - C(2x) - B1-B2- C(2x) - Outro',
      '[Verse 1]', 'Opening verse', '[Pre-Chorus]', 'Opening prelude', '[Chorus]', 'Opening chorus',
      '[Verse 2]', 'Second verse', '[Pre-Chorus]', '[Chorus]2x',
      '[Bridge 1]', 'First bridge', '[Bridge 2]**** (Louder)', 'Second bridge', '[Chorus]',
      '[Outro]', 'Closing words',
      'Indescribable (E)', 'Option 1: I-V1-C-V2-C-C(ending)',
      '[Verse 1] (Guitars)', 'Another verse', '[Chorus]', 'Another chorus',
      '[Verse 2]', 'Another second verse', '[Chorus]', '[Chorus]', 'Different final chorus',
      'Lord I Need You (G)', 'I-V1-V1-C-V2-C-B-C-Ending', '[Verse 1]x2', 'Third opening',
      '[Chorus]', 'Third chorus', '[Verse 2]', 'Third verse', '[Bridge]', 'Third bridge', '[Ending]', 'Third ending',
      'Living Hope (Key : B)', 'I-V1-V2-C-C-V3-V3-C-C', '[Verse 1]', 'Fourth opening',
      '[Verse 2]', 'Fourth verse', '[Chorus]', 'Fourth chorus', '[Verse 3]', 'Fourth finale',
      'Great Are You Lord (Key : E)', 'V-C-V-C-C-Bx3-Cx2-C', '[Verse]', 'Fifth opening',
      '[Chorus]', 'Fifth chorus', '[Bridge]x3 quiet', 'Fifth bridge',
    ],
  },
  {
    name: 'Saturday night',
    titles: ['Tribes', 'Firm Foundation', 'Great Are You Lord', 'We Fall Down', 'Worthy', 'Worthy of It All'],
    paragraphs: [
      'Tribes (Key : G)', 'I–V-PC-C-C-T1-V-PC-C-C-T1-T1-T2', '[Intro]', 'D/F#-G G/B-C D-Em',
      '[Verse]', 'First verse', '[Pre-Chorus]', 'First prelude', '[Chorus]', 'First chorus',
      '[Tag 1]', 'First tag', 'First tag', '[Tag 2]', 'Second tag',
      'Note : recording timestamps refer to the playlist',
      'Firm Foundation (Key : E)', 'I-C1-T1-C2-T2-C1-T2-B1-B1-B2-C1',
      'Intro : E Esus (relaxed, acoustic)', '[Chorus 1]', 'Second chorus', '[Tag 1]', 'Second tag',
      '[Chorus 2]', 'Different second chorus', '[Tag 2]', 'Different second tag',
      '[Bridge 1]', 'First bridge', '[Bridge 2]', 'Second bridge',
      'Great Are You Lord (Key : E)', 'B-B-B-B-C-C-E', '[Bridge] x4',
      'building up → medium → loud', 'Third bridge', '[Chorus]x2', 'Third chorus', '[Ending]', 'Third ending',
      'We Fall Down (Key : D)', 'I-V-C-V-C-C',
      'Recording reference | Artist | Live', '[Verse]', 'Fourth verse', '[Chorus]', 'Fourth chorus',
      'Worthy (Key :D)', 'C-C-B-B-C-C', '[Chorus 2]2x (loudest)', 'Fifth chorus', '[Bridge]', 'Fifth bridge',
      'Worthy of It All (Key : E)', 'I-V-C-V-Cx2-Bx2-Cx4', '[Verse]', 'Sixth verse',
      '[Chorus]', 'Sixth chorus', '[Bridge]x2', 'Sixth bridge',
    ],
  },
  {
    name: 'Sunday afternoon',
    titles: ['Chosen Generation - Chris Tomlin', 'My Heart Sings Praises', 'Thank you Jesus for the blood', 'Revelation Song', 'Here In Your Presence'],
    paragraphs: [
      'Chosen Generation - Chris Tomlin (Key: G)', '[Intro]', '|G / / /| G2/E / / /|',
      '[Chorus]bass, elec', 'First chorus', '[Extra]', 'Extra words', '[Verse]', 'First verse',
      '[Coda] only drum here', 'Coda words', '[Ending]', 'Closing words',
      'My Heart Sings Praises (Key: A)', '[Intro] full sound', 'Dmaj7 C#7 F#m7 B7/F#',
      '[Verse]', 'Second verse', '[Chorus]', 'C#7       Second chorus', '[Verse]', '[Chorus]',
      'Thank you Jesus for the blood (Key: C)', 'V1-C1-V2-C1-C2-B1-B1T-C1-C2-B2-B2T-E',
      '[Verse 1]', 'Third verse', '[Chorus]', 'Third chorus', '[Verse 2]', 'Third second verse',
      '[Bridge]2X', 'Third bridge', '[Chorus]',
      'Revelation Song (D)', 'Intro : D Am C G', 'I-V1-V1-C-I-V2-C-I-V3-C-C(quiet)',
      '[Verse 1]', 'Fourth verse', '[Chorus]', 'Fourth chorus', '[Verse 2]', 'Fourth second verse',
      '[Chorus, Loud/Full]x2', '[Try Interlude 1 Bar, then enter v3 Quiet]',
      '[Verse 3, starts quiet]:', 'Fourth final verse', '[Chorus]x2',
      'Here In Your Presence (Key : A)', 'I-V-PC-C-I-V-PC-C-Bx3-LB-C-C',
      '[Verse]', 'Fifth verse', '[Pre-chorus]', 'Fifth prelude', '[Chorus]', 'Fifth chorus',
      '[Bridge]', 'Fifth bridge', '[Last Bridge] (16th notes buildup - intense!!)', 'Fifth last bridge',
    ],
  },
];

describe('retreat DOCX layouts', () => {
  it.each(retreatLayouts)('imports all songs in $name order and exports clean lyrics', async ({ paragraphs, titles, name }) => {
    const escapeXml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const zip = new JSZip();
    zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map((text) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`);
    const songs = await extractSongsFromDocx(await zip.generateAsync({ type: 'uint8array' }));
    expect(songs.map((song) => song.title)).toEqual(titles);
    const output = buildLyricsText(songs);
    expect(output.split('\n').filter((line) => line.startsWith('*'))).toEqual(titles.map((title) => `*${title}`));
    expect(output).not.toMatch(/Key\s*:|Option 1|D\/F#|G2\/E|Note :|building up|recording reference|\[Try|\bC#7\b/i);
    if (name === 'Sunday morning') {
      expect(sequenceLabels(songs[0])).toEqual(['Verse1', 'Pre-Chorus', 'Chorus', 'Verse2', 'Pre-Chorus', 'Chorus', 'Chorus', 'Bridge1', 'Bridge2', 'Chorus', 'Chorus', 'Outro']);
      expect(sequenceLabels(songs[1]).at(-1)).toBe('Chorus alt');
    } else if (name === 'Saturday night') {
      expect(songs[0].sections.find((section) => section.label === 'Tag1').lyrics).toBe('First tag\nFirst tag');
      expect(sequenceLabels(songs[2])).toEqual(['Bridge', 'Bridge', 'Bridge', 'Bridge', 'Chorus', 'Chorus', 'Ending']);
    } else {
      expect(songs[0].sections.map((section) => section.label)).toEqual(['Chorus', 'Extra', 'Verse', 'Coda', 'Ending']);
      expect(songs[2].unresolvedSections).toEqual(['Bridge Tag1', 'Bridge Tag2']);
      expect(songs[3].sections.map((section) => section.label)).toContain('Verse3');
      expect(sequenceLabels(songs[4])).toContain('Last Bridge');
    }
  });
});
