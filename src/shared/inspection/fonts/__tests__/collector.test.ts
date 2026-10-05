import { afterEach, describe, expect, it } from 'vitest';
import { collectFonts, FONTS_INSPECTOR_ID } from '../collector';

/** Мини-фейк вычисленного стиля (только читаемые сборщиком свойства). */
function fakeStyle(props: Partial<Record<string, string>>): CSSStyleDeclaration {
  return {
    display: 'block',
    fontFamily: 'sans-serif',
    fontSize: '16px',
    fontWeight: '400',
    fontStyle: 'normal',
    lineHeight: 'normal',
    letterSpacing: 'normal',
    ...props,
  } as unknown as CSSStyleDeclaration;
}

/** Фейковый FontFaceSet: `check` по набору доступных семейств + `forEach` по faces. */
function installFonts(available: Set<string>, faces: readonly Partial<FontFace>[]): void {
  const set = {
    check: (shorthand: string): boolean => {
      const m = /"([^"]+)"/.exec(shorthand);
      const fam = (m?.[1] ?? '').toLowerCase();
      return available.has(fam);
    },
    forEach: (cb: (face: FontFace) => void): void => {
      for (const face of faces) cb(face as FontFace);
    },
  };
  Object.defineProperty(document, 'fonts', { configurable: true, value: set });
}

/** Фейковые таблицы стилей: одна с `@font-face`, одна межоригинная (бросает на cssRules). */
function installStyleSheets(): void {
  const fontFaceRule = {
    type: 5,
    constructor: { name: 'CSSFontFaceRule' },
    style: {
      getPropertyValue: (prop: string): string => {
        if (prop === 'font-family') return '"Inter"';
        if (prop === 'src') return 'url(https://cdn.example/inter.woff2) format("woff2")';
        return '';
      },
    },
  };
  const localSheet = { cssRules: [fontFaceRule] };
  const crossOrigin = {
    get cssRules(): never {
      throw new DOMException('cross-origin', 'SecurityError');
    },
  };
  const list = [localSheet, crossOrigin];
  Object.defineProperty(document, 'styleSheets', { configurable: true, value: list });
}

afterEach(() => {
  Reflect.deleteProperty(document, 'fonts');
  Reflect.deleteProperty(document, 'styleSheets');
  document.body.innerHTML = '';
});

/** Собирает getStyle из карты «элемент → стиль» с базовым дефолтом. */
function styleReaderFrom(
  map: Map<Element, CSSStyleDeclaration>,
): (el: Element) => CSSStyleDeclaration {
  return (el) => map.get(el) ?? fakeStyle({});
}

describe('collectFonts', () => {
  it('id сборщика — стабильный', () => {
    expect(FONTS_INSPECTOR_ID).toBe('fonts');
  });

  it('снимает эффективное семейство, источник и метаданные, исключая оверлей', () => {
    document.body.innerHTML =
      '<h1 id="title" class="hero">Big Heading</h1>' +
      '<p class="lead">Lead paragraph</p>' +
      '<div data-qatb-overlay><span>overlay text</span></div>';

    installFonts(new Set(['inter']), [
      { family: 'Inter', weight: '700', style: 'normal', status: 'loaded' },
      { family: 'Roboto', weight: '400', style: 'normal', status: 'unloaded' },
    ]);
    installStyleSheets();

    const h1 = document.querySelector('h1') as Element;
    const p = document.querySelector('p') as Element;
    const map = new Map<Element, CSSStyleDeclaration>();
    // Inter доступен → эффективное семейство именно Inter (первый в цепочке).
    map.set(
      h1,
      fakeStyle({ fontFamily: '"Inter", Arial, sans-serif', fontSize: '32px', fontWeight: '700' }),
    );
    // Roboto недоступен → откат к родовому sans-serif (эффективное ≠ первый в списке).
    map.set(p, fakeStyle({ fontFamily: 'Roboto, sans-serif', fontSize: '16px' }));

    const data = collectFonts(document.body, styleReaderFrom(map));

    expect(data.fontsApiAvailable).toBe(true);
    expect(data.loadedFamilies).toEqual(['inter']);

    const face = data.faces.find((f) => f.family === 'Inter');
    expect(face?.url).toBe('https://cdn.example/inter.woff2');
    expect(face?.format).toBe('woff2');

    const heading = data.samples.find((s) => s.selector === 'h1#title.hero');
    expect(heading?.family).toBe('Inter');
    expect(heading?.fontSize).toBe('32px');

    const lead = data.samples.find((s) => s.text === 'Lead paragraph');
    expect(lead?.family).toBe('sans-serif');

    // Оверлей исключён из обхода — его текста в сэмплах нет.
    expect(data.samples.some((s) => s.text.includes('overlay text'))).toBe(false);
  });

  it('без document.fonts деградирует: fontsApiAvailable=false, семейство — первый в списке', () => {
    document.body.innerHTML = '<p>Text</p>';
    const p = document.querySelector('p') as Element;
    const map = new Map<Element, CSSStyleDeclaration>();
    map.set(p, fakeStyle({ fontFamily: '"Custom Face", serif' }));

    const data = collectFonts(document.body, styleReaderFrom(map));

    expect(data.fontsApiAvailable).toBe(false);
    expect(data.faces).toEqual([]);
    const sample = data.samples.find((s) => s.text === 'Text');
    expect(sample?.family).toBe('Custom Face');
  });

  it('межоригинные таблицы стилей не роняют сбор (URL деградирует)', () => {
    document.body.innerHTML = '<span class="only-cross">x</span>';
    installFonts(new Set(), [
      { family: 'Ghost', weight: '400', style: 'normal', status: 'loaded' },
    ]);
    // Только межоригинная таблица.
    Object.defineProperty(document, 'styleSheets', {
      configurable: true,
      value: [
        {
          get cssRules(): never {
            throw new DOMException('cross-origin', 'SecurityError');
          },
        },
      ],
    });

    const data = collectFonts(document.body);
    const ghost = data.faces.find((f) => f.family === 'Ghost');
    expect(ghost?.url).toBeNull();
    expect(ghost?.format).toBeNull();
  });
});
