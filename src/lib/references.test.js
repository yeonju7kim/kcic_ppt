import { describe, expect, it } from 'vitest';
import { extractReferences, formatReference } from './references.js';

describe('extractReferences', () => {
  it('extracts Korean and English references in document order', () => {
    const result = extractReferences('먼저 요한복음 3:16-17, 그리고 Romans 8:28을 봅니다.');
    expect(result.map((ref) => formatReference(ref, 'en'))).toEqual([
      'John 3:16-17',
      'Romans 8:28',
    ]);
  });

  it('supports Korean chapter/verse notation and common abbreviations', () => {
    const [reference] = extractReferences('시 23편 1-3절');
    expect(formatReference(reference)).toBe('시편 23:1-3');
  });

  it('deduplicates identical references while keeping the first occurrence', () => {
    const result = extractReferences('요 3:16 / John 3:16 / 요한복음 3장 16절');
    expect(result).toHaveLength(1);
  });
});
