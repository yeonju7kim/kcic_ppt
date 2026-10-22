import { describe, expect, it } from 'vitest';
import { buildLyricsText, inferOutputFilename, isChordOnly, parseSongsFromParagraphs } from './lyrics.js';

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
});
