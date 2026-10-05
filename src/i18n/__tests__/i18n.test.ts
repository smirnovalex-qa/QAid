import { afterEach, describe, expect, it } from 'vitest';
import { locale, mergeCatalog, setLocale, t } from '@/i18n';

afterEach(() => {
  setLocale('ru');
});

describe('i18n', () => {
  it('translates a known key in the active locale', () => {
    setLocale('ru');
    expect(t('category.generators')).toBe('Генераторы');
    setLocale('en');
    expect(t('category.generators')).toBe('Generators');
  });

  it('reacts to locale switching via the signal', () => {
    setLocale('en');
    expect(locale.value).toBe('en');
    expect(t('toast.copied')).toBe('Copied');
  });

  it('falls back to the key when missing', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('interpolates variables', () => {
    mergeCatalog('en', { 'test.greet': 'Hi {name}, {n} left' });
    setLocale('en');
    expect(t('test.greet', { name: 'Sam', n: 3 })).toBe('Hi Sam, 3 left');
  });

  it('mergeCatalog adds feature fragments without touching the shell keys', () => {
    mergeCatalog('ru', { 'feature.x.title': 'Фича X' });
    setLocale('ru');
    expect(t('feature.x.title')).toBe('Фича X');
    expect(t('app.title')).toBe('QA Toolbox');
  });
});
