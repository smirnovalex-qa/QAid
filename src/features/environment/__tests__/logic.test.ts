import { describe, expect, it } from 'vitest';
import {
  applyQueryProfile,
  buildHeaderRules,
  deriveLanguages,
  hasPageOverrides,
  headerRuleId,
  HEADER_RESOURCE_TYPES,
  isValidAcceptLanguage,
  isValidAccuracy,
  isValidLanguageTag,
  isValidLatitude,
  isValidLongitude,
  isValidTimeZone,
  isValidUserAgent,
  RULE_ID_BASE,
} from '../logic';
import { EMPTY_ENVIRONMENT_CONFIG, EMPTY_GEO } from '../types';
import type { EnvironmentConfig } from '../types';

describe('headerRuleId', () => {
  it('детерминирован по вкладке (BASE + tabId)', () => {
    expect(headerRuleId(0)).toBe(RULE_ID_BASE);
    expect(headerRuleId(7)).toBe(RULE_ID_BASE + 7);
  });
});

describe('isValidUserAgent', () => {
  it('принимает обычную UA-строку', () => {
    expect(isValidUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/124')).toBe(true);
  });
  it('отвергает пустую и слишком длинную', () => {
    expect(isValidUserAgent('')).toBe(false);
    expect(isValidUserAgent('x'.repeat(1025))).toBe(false);
  });
  it('отвергает управляющие символы (защита от инъекции заголовка)', () => {
    expect(isValidUserAgent('UA\r\nInjected: 1')).toBe(false);
    expect(isValidUserAgent('UA\0null')).toBe(false);
  });
});

describe('isValidLanguageTag', () => {
  it('принимает BCP-47 теги', () => {
    expect(isValidLanguageTag('en')).toBe(true);
    expect(isValidLanguageTag('en-US')).toBe(true);
    expect(isValidLanguageTag('zh-Hant-TW')).toBe(true);
  });
  it('отвергает мусор', () => {
    expect(isValidLanguageTag('')).toBe(false);
    expect(isValidLanguageTag('english')).toBe(false);
    expect(isValidLanguageTag('e')).toBe(false);
    expect(isValidLanguageTag('en_US')).toBe(false);
  });
});

describe('isValidAcceptLanguage', () => {
  it('принимает список с весами q', () => {
    expect(isValidAcceptLanguage('en-US,en;q=0.9')).toBe(true);
    expect(isValidAcceptLanguage('fr-FR,fr;q=0.9,en;q=0.8')).toBe(true);
    expect(isValidAcceptLanguage('de')).toBe(true);
  });
  it('отвергает пустые, плохие теги и плохой q', () => {
    expect(isValidAcceptLanguage('')).toBe(false);
    expect(isValidAcceptLanguage('en,,de')).toBe(false);
    expect(isValidAcceptLanguage('english;q=0.5')).toBe(false);
    expect(isValidAcceptLanguage('en;q=2')).toBe(false);
    expect(isValidAcceptLanguage('en;x=0.5')).toBe(false);
    expect(isValidAcceptLanguage('en;q=0.9;q=0.8')).toBe(false);
  });
});

describe('deriveLanguages', () => {
  it('возвращает базовые теги в порядке, без дублей и без q', () => {
    expect(deriveLanguages('fr-FR,fr;q=0.9,en;q=0.8,fr')).toEqual(['fr-FR', 'fr', 'en']);
  });
  it('игнорирует пустые записи', () => {
    expect(deriveLanguages('en, ,de')).toEqual(['en', 'de']);
  });
});

describe('координатные валидаторы', () => {
  it('широта в [-90, 90]', () => {
    expect(isValidLatitude(0)).toBe(true);
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(90.1)).toBe(false);
    expect(isValidLatitude(Number.NaN)).toBe(false);
  });
  it('долгота в [-180, 180]', () => {
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(-180)).toBe(true);
    expect(isValidLongitude(181)).toBe(false);
    expect(isValidLongitude(Number.POSITIVE_INFINITY)).toBe(false);
  });
  it('точность — конечная неотрицательная', () => {
    expect(isValidAccuracy(0)).toBe(true);
    expect(isValidAccuracy(50)).toBe(true);
    expect(isValidAccuracy(-1)).toBe(false);
    expect(isValidAccuracy(Number.NaN)).toBe(false);
  });
});

describe('isValidTimeZone', () => {
  it('принимает реальные IANA-зоны', () => {
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('America/Los_Angeles')).toBe(true);
  });
  it('отвергает пустую и несуществующую', () => {
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('Mars/Phobos')).toBe(false);
  });
});

describe('buildHeaderRules', () => {
  const withUa: EnvironmentConfig = { ...EMPTY_ENVIRONMENT_CONFIG, userAgent: 'Custom UA' };
  const withLang: EnvironmentConfig = {
    ...EMPTY_ENVIRONMENT_CONFIG,
    acceptLanguage: 'fr-FR,fr;q=0.9',
  };

  it('строит одно правило с обоими заголовками', () => {
    const config: EnvironmentConfig = {
      ...EMPTY_ENVIRONMENT_CONFIG,
      userAgent: 'Custom UA',
      acceptLanguage: 'de-DE,de;q=0.9',
    };
    const rules = buildHeaderRules(config, 42);
    expect(rules).toHaveLength(1);
    const rule = rules[0]!;
    expect(rule.id).toBe(headerRuleId(42));
    expect(rule.condition.tabIds).toEqual([42]);
    expect(rule.condition.resourceTypes).toBe(HEADER_RESOURCE_TYPES);
    expect(rule.action.requestHeaders.map((h) => h.header)).toEqual([
      'user-agent',
      'accept-language',
    ]);
  });

  it('включает только заданный заголовок', () => {
    expect(buildHeaderRules(withUa, 1)[0]!.action.requestHeaders).toEqual([
      { header: 'user-agent', operation: 'set', value: 'Custom UA' },
    ]);
    expect(buildHeaderRules(withLang, 1)[0]!.action.requestHeaders).toEqual([
      { header: 'accept-language', operation: 'set', value: 'fr-FR,fr;q=0.9' },
    ]);
  });

  it('пустой результат, когда подменять нечего или значения невалидны', () => {
    expect(buildHeaderRules(EMPTY_ENVIRONMENT_CONFIG, 1)).toEqual([]);
    const bad: EnvironmentConfig = {
      ...EMPTY_ENVIRONMENT_CONFIG,
      userAgent: 'bad\r\nua',
      acceptLanguage: 'not a tag',
    };
    expect(buildHeaderRules(bad, 1)).toEqual([]);
  });
});

describe('hasPageOverrides', () => {
  it('false для пустого конфига', () => {
    expect(hasPageOverrides(EMPTY_ENVIRONMENT_CONFIG)).toBe(false);
  });
  it('true при любом заданном канале', () => {
    expect(hasPageOverrides({ ...EMPTY_ENVIRONMENT_CONFIG, userAgent: 'x' })).toBe(true);
    expect(hasPageOverrides({ ...EMPTY_ENVIRONMENT_CONFIG, timezone: 'UTC' })).toBe(true);
    expect(
      hasPageOverrides({ ...EMPTY_ENVIRONMENT_CONFIG, geo: { ...EMPTY_GEO, mode: 'coords' } }),
    ).toBe(true);
  });
});

describe('applyQueryProfile', () => {
  it('добавляет/заменяет включённые флаги и удаляет выключенные', () => {
    const out = applyQueryProfile('https://ex.test/p?a=1&keep=9', [
      { key: 'a', value: '2', enabled: true },
      { key: 'b', value: 'x', enabled: true },
      { key: 'keep', value: '', enabled: false },
    ]);
    const u = new URL(out);
    expect(u.searchParams.get('a')).toBe('2');
    expect(u.searchParams.get('b')).toBe('x');
    expect(u.searchParams.has('keep')).toBe(false);
  });

  it('идемпотентен: повторное применение не плодит дубли', () => {
    const flags = [{ key: 'ff', value: 'on', enabled: true }];
    const once = applyQueryProfile('https://ex.test/', flags);
    const twice = applyQueryProfile(once, flags);
    expect(twice).toBe(once);
    expect([...new URL(twice).searchParams.getAll('ff')]).toEqual(['on']);
  });

  it('пропускает флаги с пустым ключом и не трогает непарсибельный URL', () => {
    expect(applyQueryProfile('https://ex.test/', [{ key: '', value: 'v', enabled: true }])).toBe(
      'https://ex.test/',
    );
    expect(applyQueryProfile('not a url', [{ key: 'a', value: '1', enabled: true }])).toBe(
      'not a url',
    );
  });
});
