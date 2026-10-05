/** Фикстуры для тестов логики мока сети (TASK-022): конструкторы правил/запросов. */
import type { MockRule, RequestMeta } from '../../types';
import { DEFAULT_ACTION, DEFAULT_MATCHER } from '../../types';

let seq = 0;

/** Строит сырое правило с дефолтами и переопределениями (независимые ссылки). */
export function makeRule(overrides?: Partial<MockRule>): MockRule {
  seq += 1;
  return {
    id: `rule-${String(seq)}`,
    label: '',
    enabled: true,
    matcher: { ...DEFAULT_MATCHER, methods: [], headerPredicates: [] },
    action: { ...DEFAULT_ACTION, headers: [] },
    once: null,
    ...overrides,
  };
}

/** Строит объект запроса для матчинга. */
export function makeRequest(overrides?: Partial<RequestMeta>): RequestMeta {
  return {
    method: 'GET',
    url: 'https://api.example.com/users',
    requestHeaders: {},
    ...overrides,
  };
}
