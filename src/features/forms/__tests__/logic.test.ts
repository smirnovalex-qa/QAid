import { describe, expect, it } from 'vitest';
import {
  auditForm,
  buildAuditReport,
  classifyField,
  generateValue,
  seededRandom,
  summarizeAudit,
  toAuditReportRows,
} from '@/shared/inspection/forms/logic';
import type { FieldKind, FillProfile } from '@/shared/inspection/forms/types';
import { makeAttrs, violationModel } from './fixtures/forms';

/** Детерминированный источник для воспроизводимости в тестах. */
const rng = (): ReturnType<typeof seededRandom> => seededRandom(12345);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

describe('classifyField', () => {
  it('classifies by tag name (textarea/select)', () => {
    expect(classifyField(makeAttrs({ tagName: 'textarea', type: null }))).toBe('textarea');
    expect(classifyField(makeAttrs({ tagName: 'select', type: null }))).toBe('select');
  });

  it('classifies by explicit input[type]', () => {
    expect(classifyField(makeAttrs({ type: 'email' }))).toBe('email');
    expect(classifyField(makeAttrs({ type: 'tel' }))).toBe('tel');
    expect(classifyField(makeAttrs({ type: 'url' }))).toBe('url');
    expect(classifyField(makeAttrs({ type: 'number' }))).toBe('number');
    expect(classifyField(makeAttrs({ type: 'date' }))).toBe('date');
    expect(classifyField(makeAttrs({ type: 'password' }))).toBe('password');
    expect(classifyField(makeAttrs({ type: 'checkbox' }))).toBe('checkbox');
    expect(classifyField(makeAttrs({ type: 'radio' }))).toBe('radio');
  });

  it('falls back to heuristics on name/id/placeholder/label/autocomplete', () => {
    expect(classifyField(makeAttrs({ name: 'user_email' }))).toBe('email');
    expect(classifyField(makeAttrs({ id: 'phoneNumber' }))).toBe('tel');
    expect(classifyField(makeAttrs({ placeholder: 'First name' }))).toBe('first');
    expect(classifyField(makeAttrs({ labelText: 'Last name' }))).toBe('last');
    expect(classifyField(makeAttrs({ name: 'fullname' }))).toBe('name');
    expect(classifyField(makeAttrs({ autocomplete: 'street-address' }))).toBe('address');
    expect(classifyField(makeAttrs({ name: 'website' }))).toBe('url');
    expect(classifyField(makeAttrs({ placeholder: 'Age' }))).toBe('number');
    expect(classifyField(makeAttrs({ name: 'birthdate' }))).toBe('date');
  });

  it('defaults generic text to `text`, unknown types to `unknown`', () => {
    expect(classifyField(makeAttrs({ type: 'text' }))).toBe('text');
    expect(classifyField(makeAttrs({ type: 'color' }))).toBe('unknown');
  });
});

describe('generateValue — valid profile', () => {
  it('produces a valid email', () => {
    const v = generateValue('email', 'valid', rng());
    expect(typeof v).toBe('string');
    expect(v as string).toMatch(EMAIL_RE);
  });

  it('produces an ISO date within a sane range', () => {
    const v = generateValue('date', 'valid', rng()) as string;
    expect(v).toMatch(ISO_DATE_RE);
    const year = Number.parseInt(v.slice(0, 4), 10);
    expect(year).toBeGreaterThanOrEqual(1970);
    expect(year).toBeLessThanOrEqual(2005);
  });

  it('produces a numeric string within bounds', () => {
    const v = generateValue('number', 'valid', rng()) as string;
    const n = Number.parseInt(v, 10);
    expect(Number.isNaN(n)).toBe(false);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(1000);
  });

  it('produces a URL and a password of reasonable length', () => {
    expect(generateValue('url', 'valid', rng()) as string).toMatch(/^https:\/\/[a-z]+\.com$/);
    expect((generateValue('password', 'valid', rng()) as string).length).toBeGreaterThanOrEqual(12);
  });

  it('honours maxLength (truncates)', () => {
    const v = generateValue('name', 'valid', rng(), { maxLength: 4 }) as string;
    expect(v.length).toBeLessThanOrEqual(4);
  });

  it('satisfies a simple digit pattern', () => {
    const v = generateValue('text', 'valid', rng(), { pattern: '\\d{4}' }) as string;
    expect(v).toMatch(/^\d{4}$/);
  });

  it('returns boolean true for checkbox/radio', () => {
    expect(generateValue('checkbox', 'valid', rng())).toBe(true);
    expect(generateValue('radio', 'valid', rng())).toBe(true);
  });

  it('is deterministic for a fixed seed', () => {
    expect(generateValue('email', 'valid', seededRandom(7))).toBe(
      generateValue('email', 'valid', seededRandom(7)),
    );
  });
});

describe('generateValue — profiles yield expected classes', () => {
  it('empty → empty string / false', () => {
    expect(generateValue('email', 'empty', rng())).toBe('');
    expect(generateValue('text', 'empty', rng())).toBe('');
    expect(generateValue('checkbox', 'empty', rng())).toBe(false);
  });

  it('boundary → string exactly at maxLength', () => {
    const v = generateValue('text', 'boundary', rng(), { maxLength: 50 }) as string;
    expect(v.length).toBe(50);
  });

  it('injection → a known XSS/SQL test string, clamped to maxLength', () => {
    const v = generateValue('text', 'injection', rng()) as string;
    expect(v.length).toBeGreaterThan(0);
    // Содержит характерный признак инъекционной тест-строки.
    expect(/[<'{$]/.test(v)).toBe(true);
    const clamped = generateValue('text', 'injection', rng(), { maxLength: 3 }) as string;
    expect(clamped.length).toBeLessThanOrEqual(3);
  });

  it('every kind is generatable under every profile without throwing', () => {
    const kinds: FieldKind[] = [
      'email',
      'tel',
      'name',
      'first',
      'last',
      'address',
      'date',
      'number',
      'url',
      'password',
      'text',
      'textarea',
      'select',
      'checkbox',
      'radio',
      'unknown',
    ];
    const profiles: FillProfile[] = ['valid', 'boundary', 'empty', 'injection'];
    for (const kind of kinds) {
      for (const profile of profiles) {
        expect(() => generateValue(kind, profile, rng())).not.toThrow();
      }
    }
  });
});

describe('auditForm', () => {
  const issues = auditForm(violationModel());
  const byRule = (rule: string): string[] =>
    issues.filter((i) => i.rule === rule).map((i) => i.selector);

  it('flags fields without an accessible label', () => {
    expect(byRule('label-missing')).toContain('#a');
  });

  it('flags required-by-appearance fields without required/aria-required', () => {
    expect(byRule('required-missing')).toContain('#req');
  });

  it('flags duplicate ids (once per occurrence)', () => {
    expect(byRule('duplicate-id')).toEqual(['#dup', '#dup2']);
  });

  it('flags type↔kind mismatch (email kind on type=text)', () => {
    expect(byRule('type-mismatch')).toContain('#a');
  });

  it('leaves a fully correct field alone', () => {
    expect(issues.some((i) => i.selector === '#ok')).toBe(false);
  });

  it('summarizes by severity', () => {
    const s = summarizeAudit(issues);
    expect(s.error).toBe(3); // label-missing(1) + duplicate-id(2)
    expect(s.warning).toBe(2); // type-mismatch(1) + required-missing(1)
    expect(s.total).toBe(5);
  });
});

describe('buildAuditReport', () => {
  const issues = auditForm(violationModel());
  const rows = toAuditReportRows(issues, (k) => `T:${k}`);

  it('translates message keys via the injected translator', () => {
    expect(rows[0]?.message.startsWith('T:forms.audit.')).toBe(true);
  });

  it('emits CSV with a header row', () => {
    const csv = buildAuditReport(rows, 'csv');
    expect(csv.split('\r\n')[0]).toBe('rule,selector,severity,message');
  });

  it('emits JSON array', () => {
    const parsed = JSON.parse(buildAuditReport(rows, 'json')) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(issues.length);
  });

  it('emits plain lines', () => {
    const plain = buildAuditReport(rows, 'plain');
    expect(plain.split('\n')).toHaveLength(issues.length);
  });
});
