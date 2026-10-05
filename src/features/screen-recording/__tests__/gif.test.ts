/**
 * Юнит-тесты чистого GIF-кодировщика (TASK-037). Корректность самого хрупкого места —
 * LZW и границ подблоков/ширины кода — доказывается round-trip'ом через НЕЗАВИСИМЫЙ
 * спец-декодер (ниже): кодируем → декодируем → сверяем. Спец-декодер написан по
 * спецификации GIF89a (как это делают браузеры), поэтому успешный round-trip = кадр
 * прочитается и реальным декодером. Плюс структурные проверки байтов заголовка/кадра.
 */
import { describe, expect, it } from 'vitest';
import {
  encodeGifFrame,
  gifHeader,
  GIF_TRAILER,
  lzwEncode,
  paletteBits,
  quantize,
} from '@/features/screen-recording/gif';

// ── Независимый спец-декодер (только для тестов) ─────────────────────────────────

/** Читает поток length-префиксных подблоков GIF, пока не встретит нулевой. */
function readSubBlocks(bytes: Uint8Array, start: number): { data: number[]; end: number } {
  const data: number[] = [];
  let i = start;
  for (;;) {
    const len = bytes[i++]!;
    if (len === 0) break;
    for (let j = 0; j < len; j++) data.push(bytes[i++]!);
  }
  return { data, end: i };
}

/** Декодирует LZW-данные GIF (уже без подблоков) в индексы палитры. */
function lzwDecodeData(data: number[], minCodeSize: number): number[] {
  let bitPos = 0;
  const readCode = (size: number): number => {
    let v = 0;
    for (let n = 0; n < size; n++) {
      const byte = data[bitPos >> 3] ?? 0;
      v |= ((byte >> (bitPos & 7)) & 1) << n;
      bitPos++;
    }
    return v;
  };

  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let dict: number[][] = [];
  const resetDict = (): void => {
    dict = [];
    for (let i = 0; i < clear; i++) dict.push([i]);
    dict.push([]); // clear placeholder
    dict.push([]); // eoi placeholder
    codeSize = minCodeSize + 1;
  };
  resetDict();

  const out: number[] = [];
  let prev: number | null = null;
  for (;;) {
    const code = readCode(codeSize);
    if (code === clear) {
      resetDict();
      prev = null;
      continue;
    }
    if (code === eoi) break;

    let entry: number[];
    if (prev === null) {
      entry = dict[code]!.slice();
      out.push(...entry);
      prev = code;
      continue;
    }
    if (code < dict.length) {
      entry = dict[code]!.slice();
    } else if (code === dict.length) {
      entry = [...dict[prev]!, dict[prev]![0]!];
    } else {
      throw new Error(`bad LZW code ${String(code)} (dict ${String(dict.length)})`);
    }
    out.push(...entry);
    dict.push([...dict[prev]!, entry[0]!]);
    prev = code;
    if (dict.length === 1 << codeSize && codeSize < 12) codeSize++;
  }
  return out;
}

interface ParsedFrame {
  width: number;
  height: number;
  delayCs: number;
  palette: number[] | null;
  indices: number[];
}

/** Минимальный парсер GIF89a: возвращает размеры экрана и кадры с их палитрой/индексами. */
function parseGif(bytes: Uint8Array): { width: number; height: number; frames: ParsedFrame[] } {
  const sig = String.fromCharCode(...bytes.slice(0, 6));
  expect(sig).toBe('GIF89a');
  const width = bytes[6]! | (bytes[7]! << 8);
  const height = bytes[8]! | (bytes[9]! << 8);
  let p = 13; // за LSD (глобальной палитры не эмитим)

  const frames: ParsedFrame[] = [];
  let delayCs = 0;
  for (;;) {
    const b = bytes[p]!;
    if (b === 0x3b) break; // trailer
    if (b === 0x21) {
      const label = bytes[p + 1]!;
      if (label === 0xf9) {
        delayCs = bytes[p + 4]! | (bytes[p + 5]! << 8);
        p += 8;
      } else {
        p += 2;
        for (;;) {
          const len = bytes[p++]!;
          if (len === 0) break;
          p += len;
        }
      }
      continue;
    }
    if (b === 0x2c) {
      const iw = bytes[p + 5]! | (bytes[p + 6]! << 8);
      const ih = bytes[p + 7]! | (bytes[p + 8]! << 8);
      const ipacked = bytes[p + 9]!;
      p += 10;
      let palette: number[] | null = null;
      if ((ipacked & 0x80) !== 0) {
        const size = 1 << ((ipacked & 0x07) + 1);
        palette = [];
        for (let i = 0; i < size * 3; i++) palette.push(bytes[p++]!);
      }
      const minCodeSize = bytes[p++]!;
      const { data, end } = readSubBlocks(bytes, p);
      p = end;
      frames.push({
        width: iw,
        height: ih,
        delayCs,
        palette,
        indices: lzwDecodeData(data, minCodeSize),
      });
      continue;
    }
    throw new Error(`unexpected block 0x${b.toString(16)} at ${p.toString()}`);
  }
  return { width, height, frames };
}

/** Детерминированный PRNG (для воспроизводимых «случайных» индексов). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── paletteBits ──────────────────────────────────────────────────────────────────

describe('paletteBits', () => {
  it('минимум 2 бита даже для 1–4 цветов', () => {
    expect(paletteBits(1)).toBe(2);
    expect(paletteBits(2)).toBe(2);
    expect(paletteBits(4)).toBe(2);
  });

  it('растёт до вмещающего минимума', () => {
    expect(paletteBits(5)).toBe(3);
    expect(paletteBits(8)).toBe(3);
    expect(paletteBits(9)).toBe(4);
    expect(paletteBits(256)).toBe(8);
  });

  it('ограничен 8 битами (256 цветов максимум)', () => {
    expect(paletteBits(257)).toBe(8);
    expect(paletteBits(1000)).toBe(8);
  });
});

// ── quantize ───────────────────────────────────────────────────────────────────

/** Собирает RGBA-буфер из списка [r,g,b] пикселей (alpha=255). */
function rgbaOf(pixels: readonly (readonly [number, number, number])[]): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = 255;
  });
  return buf;
}

describe('quantize', () => {
  it('пустой кадр → палитра из одного цвета, нет индексов', () => {
    const { palette, indices } = quantize(new Uint8ClampedArray(0), 256);
    expect(indices.length).toBe(0);
    expect(palette.length).toBe(3);
  });

  it('одноцветный кадр → одна запись палитры, все индексы 0', () => {
    const { palette, indices } = quantize(
      rgbaOf(Array.from({ length: 16 }, () => [10, 20, 30])),
      256,
    );
    expect(palette.length).toBe(3);
    expect([...indices]).toEqual(Array.from({ length: 16 }, () => 0));
    expect([palette[0], palette[1], palette[2]]).toEqual([10, 20, 30]);
  });

  it('различных цветов ≤ maxColors → каждый цвет попадает в палитру точно', () => {
    const colors: [number, number, number][] = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
    ];
    const { palette, indices } = quantize(rgbaOf(colors), 256);
    expect(palette.length).toBe(colors.length * 3);
    // Каждый пиксель отображается в свой точный цвет.
    colors.forEach(([r, g, b], i) => {
      const k = indices[i]!;
      expect([palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2]]).toEqual([r, g, b]);
    });
  });

  it('различных цветов > maxColors → палитра усечена до maxColors, индексы валидны', () => {
    // 64 оттенка серого, но просим 4 цвета.
    const grays: [number, number, number][] = Array.from({ length: 64 }, (_, i) => {
      const v = i * 4;
      return [v, v, v];
    });
    const { palette, indices } = quantize(rgbaOf(grays), 4);
    expect(palette.length).toBe(4 * 3);
    expect(indices.length).toBe(64);
    for (const idx of indices) expect(idx).toBeLessThan(4);
  });

  it('зажимает maxColors в [2,256]', () => {
    const px = rgbaOf([
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
    ]);
    expect(quantize(px, 1).palette.length).toBeGreaterThanOrEqual(3); // ≥1 цвет
    expect(quantize(px, 9999).palette.length / 3).toBeLessThanOrEqual(256);
  });
});

// ── lzwEncode ↔ спец-декодер (round-trip) ────────────────────────────────────────

describe('lzwEncode round-trip через спец-декодер', () => {
  const roundTrip = (indices: number[], minCodeSize: number): number[] => {
    const encoded = lzwEncode(Uint8Array.from(indices), minCodeSize);
    const { data } = readSubBlocks(encoded, 0);
    return lzwDecodeData(data, minCodeSize);
  };

  it('пустой вход', () => {
    expect(roundTrip([], 2)).toEqual([]);
  });

  it('один символ', () => {
    expect(roundTrip([3], 2)).toEqual([3]);
  });

  it('повторяющийся паттерн (сжимаемый)', () => {
    const input = Array.from({ length: 100 }, (_, i) => i % 4);
    expect(roundTrip(input, 2)).toEqual(input);
  });

  it('все одинаковые (максимум сжатия)', () => {
    const input = Array.from({ length: 500 }, () => 2);
    expect(roundTrip(input, 2)).toEqual(input);
  });

  it('минимальный размер кода 8 (256 цветов)', () => {
    const rnd = mulberry32(1);
    const input = Array.from({ length: 3000 }, () => Math.floor(rnd() * 256));
    expect(roundTrip(input, 8)).toEqual(input);
  });

  it('длинный случайный поток триггерит рост ширины кода и сброс словаря', () => {
    const rnd = mulberry32(42);
    // >4096 уникальных пар быстро заполняют словарь → ветка `next === 4096` (сброс).
    const input = Array.from({ length: 30_000 }, () => Math.floor(rnd() * 256));
    expect(roundTrip(input, 8)).toEqual(input);
  });

  it('разные minCodeSize (2..8) на псевдослучайных данных', () => {
    for (let min = 2; min <= 8; min++) {
      const colors = 1 << min;
      const rnd = mulberry32(min * 7 + 1);
      const input = Array.from({ length: 2000 }, () => Math.floor(rnd() * colors));
      expect(roundTrip(input, min)).toEqual(input);
    }
  });
});

// ── gifHeader / GIF_TRAILER ──────────────────────────────────────────────────────

describe('gifHeader', () => {
  it('сигнатура GIF89a и размеры экрана little-endian', () => {
    const h = gifHeader(320, 240);
    expect(String.fromCharCode(...h.slice(0, 6))).toBe('GIF89a');
    expect(h[6]! | (h[7]! << 8)).toBe(320);
    expect(h[8]! | (h[9]! << 8)).toBe(240);
    expect(h[10]).toBe(0x00); // без глобальной палитры
  });

  it('содержит расширение зацикливания NETSCAPE2.0', () => {
    const h = gifHeader(2, 2);
    const asStr = String.fromCharCode(...h);
    expect(asStr).toContain('NETSCAPE2.0');
  });
});

describe('GIF_TRAILER', () => {
  it('единственный байт 0x3B', () => {
    expect([...GIF_TRAILER]).toEqual([0x3b]);
  });
});

// ── encodeGifFrame: полный кадр в составе валидного GIF ───────────────────────────

/** Собирает односкадровый GIF и парсит его обратно. */
function encodeSingleFrameGif(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  delayCs: number,
  maxColors = 256,
): ReturnType<typeof parseGif> {
  const frame = encodeGifFrame(rgba, w, h, delayCs, maxColors);
  const header = gifHeader(w, h);
  const bytes = new Uint8Array(header.length + frame.length + GIF_TRAILER.length);
  bytes.set(header, 0);
  bytes.set(frame, header.length);
  bytes.set(GIF_TRAILER, header.length + frame.length);
  return parseGif(bytes);
}

describe('encodeGifFrame', () => {
  it('малоцветный кадр восстанавливается пиксель-в-пиксель (round-trip)', () => {
    // 2×2: красный, зелёный, синий, жёлтый.
    const pixels: [number, number, number][] = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
    ];
    const parsed = encodeSingleFrameGif(rgbaOf(pixels), 2, 2, 10);
    expect(parsed.frames.length).toBe(1);
    const f = parsed.frames[0]!;
    expect(f.width).toBe(2);
    expect(f.height).toBe(2);
    expect(f.delayCs).toBe(10);
    expect(f.indices.length).toBe(4);
    expect(f.palette).not.toBeNull();
    // Каждый пиксель → его исходный цвет.
    pixels.forEach(([r, g, b], i) => {
      const k = f.indices[i]!;
      const pal = f.palette!;
      expect([pal[k * 3], pal[k * 3 + 1], pal[k * 3 + 2]]).toEqual([r, g, b]);
    });
  });

  it('градиент с усечением палитры кодируется/декодируется без сбоев', () => {
    // 8×8 псевдослучайный кадр, ограничим 16 цветами.
    const rnd = mulberry32(7);
    const pixels: [number, number, number][] = Array.from({ length: 64 }, () => [
      Math.floor(rnd() * 256),
      Math.floor(rnd() * 256),
      Math.floor(rnd() * 256),
    ]);
    const parsed = encodeSingleFrameGif(rgbaOf(pixels), 8, 8, 5, 16);
    const f = parsed.frames[0]!;
    expect(f.indices.length).toBe(64);
    // Все индексы в пределах палитры.
    const paletteColors = f.palette!.length / 3;
    for (const idx of f.indices) expect(idx).toBeLessThan(paletteColors);
  });

  it('дополняет локальную палитру нулями до степени двойки (3 цвета → таблица на 4)', () => {
    // 3 различных цвета → bits=2 → таблица 4 записи → одна запись-паддинг.
    const parsed = encodeSingleFrameGif(
      rgbaOf([
        [10, 20, 30],
        [40, 50, 60],
        [70, 80, 90],
      ]),
      3,
      1,
      10,
    );
    const f = parsed.frames[0]!;
    expect(f.palette!.length).toBe(4 * 3); // дополнено до 4 цветов
    for (const idx of f.indices) expect(idx).toBeLessThan(4);
  });

  it('задержка кадра пишется в GCE (сотые секунды, LE)', () => {
    const parsed = encodeSingleFrameGif(rgbaOf([[0, 0, 0]]), 1, 1, 300);
    expect(parsed.frames[0]!.delayCs).toBe(300);
  });

  it('несколько кадров с общим заголовком складываются в один цикл', () => {
    const w = 2;
    const h = 2;
    const frameA = encodeGifFrame(
      rgbaOf([
        [255, 0, 0],
        [255, 0, 0],
        [255, 0, 0],
        [255, 0, 0],
      ]),
      w,
      h,
      10,
    );
    const frameB = encodeGifFrame(
      rgbaOf([
        [0, 0, 255],
        [0, 0, 255],
        [0, 0, 255],
        [0, 0, 255],
      ]),
      w,
      h,
      10,
    );
    const header = gifHeader(w, h);
    const bytes = new Uint8Array(header.length + frameA.length + frameB.length + 1);
    let o = 0;
    bytes.set(header, o);
    o += header.length;
    bytes.set(frameA, o);
    o += frameA.length;
    bytes.set(frameB, o);
    o += frameB.length;
    bytes.set(GIF_TRAILER, o);
    const parsed = parseGif(bytes);
    expect(parsed.frames.length).toBe(2);
  });
});
