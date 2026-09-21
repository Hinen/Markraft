import { describe, expect, it } from 'vitest';
import { messages, resolveLocale, translate } from '../../src/i18n/messages';

describe('language selection', () => {
  it.each([
    ['system', ['ko-KR', 'en-US'], 'ko'],
    ['system', ['ja-JP'], 'ja'],
    ['system', ['en-GB'], 'en'],
    ['system', ['fr-FR', 'ja-JP'], 'ja'],
    ['system', ['fr-FR'], 'en'],
    ['system', [], 'en'],
    ['ko', ['ja-JP'], 'ko'],
    ['en', ['ko-KR'], 'en'],
    ['ja', ['en-US'], 'ja'],
  ] as const)('%s with %j resolves to %s', (preference, languages, expected) => {
    expect(resolveLocale(preference, languages)).toBe(expected);
  });
  it('every translation retains all interpolation placeholders', () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{\w+\}|\$/g)].map((match) => match[0]).sort();
    for (const [key, translations] of Object.entries(messages)) {
      expect(translations).toHaveLength(2);
      for (const translation of translations) {
        expect(translation.trim().length, key).toBeGreaterThan(0);
        expect(placeholders(translation), key).toEqual(placeholders(key));
      }
    }
  });
  it('translates native errors and preserves user data in placeholders', () => {
    expect(translate('en', '바이너리 파일은 열 수 없습니다.')).toBe(
      'Binary files cannot be opened.',
    );
    expect(translate('ja', 'Saved {name}', { name: '한국어-日本語.json' })).toBe(
      '한국어-日本語.json を保存しました',
    );
    expect(translate('ko', 'Save')).toBe('저장');
  });
});
