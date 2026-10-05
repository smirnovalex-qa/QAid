/**
 * Чистый кодировщик GIF89a (TASK-037, ADR-0045) — без DOM и без `chrome.*`.
 *
 * Собирает анимированный GIF из RGBA-кадров: адаптивная палитра на кадр
 * (медианный срез, ≤256 цветов), сжатие индексов по варианту LZW из спецификации
 * GIF и сборка байтов (сигнатура, дескриптор экрана, зацикливание Netscape 2.0,
 * покадровые GCE + локальная палитра + данные изображения, трейлер).
 *
 * Почему свой кодировщик, а не зависимость: расширение целенаправленно
 * бездепное и локальное (см. ADR-0014/PRD §9) — сторонний GIF-энкодер добавил бы
 * рантайм-зависимость и supply-chain-поверхность ради узкой фичи. Логика чистая и
 * покрыта юнит-тестами, включая round-trip через независимый спец-декодер (тест),
 * который ловит ошибки ширины кода/границ подблоков — то, на чём обычно ломаются
 * самодельные GIF-энкодеры. DOM-часть (декод кадров WebM) живёт в `gif-export.ts`.
 *
 * Каждый кадр несёт СВОЮ локальную палитру (проще и качественнее общей, ценой
 * размера — для коротких QA-клипов приемлемо). Кадры непрозрачны (контент экрана),
 * поэтому прозрачный индекс не используется.
 *
 * `noUncheckedIndexedAccess` + запрет non-null (`!`) в проде: чтения из типизированных
 * массивов идут через `?? 0` (индексация всегда в границах — дефолт недостижим), а
 * обращения к боксам защищены явной проверкой `undefined`.
 */

/** Результат квантизации кадра: палитра (RGB подряд) и индексы пикселей в неё. */
export interface QuantizedFrame {
  /** Палитра: `colorCount * 3` байта (r,g,b подряд). */
  readonly palette: Uint8Array;
  /** По одному индексу палитры на пиксель (в порядке пикселей входа). */
  readonly indices: Uint8Array;
}

// Переиспользуемый буфер счётчиков для counting-sort среза (один поток — безопасно).
const sortCounts = new Uint32Array(256);

/**
 * Адаптивная квантизация RGBA-кадра до ≤`maxColors` цветов методом медианного среза.
 *
 * Боксы делятся по каналу наибольшего разброса в медиане (устойчивый counting-sort
 * среза по каналу — O(n) на срез, без компаратора), пока не наберётся `maxColors`
 * боксов или не останется делимых. Палитра — усреднённый цвет бокса; индекс пикселя —
 * номер его бокса (в исходном порядке пикселей). Прозрачность игнорируется (кадры
 * экрана непрозрачны). Чисто и детерминированно.
 */
export function quantize(rgba: Uint8ClampedArray, maxColors = 256): QuantizedFrame {
  const pixelCount = Math.floor(rgba.length / 4);
  const colorCap = Math.max(2, Math.min(256, Math.floor(maxColors)));
  const indices = new Uint8Array(pixelCount);
  if (pixelCount === 0) {
    return { palette: new Uint8Array([0, 0, 0]), indices };
  }

  // `order` — перестановка индексов пикселей; боксы владеют полуинтервалами [start,end).
  const order = new Uint32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) order[i] = i;
  const scratch = new Uint32Array(pixelCount);

  interface Box {
    start: number;
    end: number;
    rMin: number;
    rMax: number;
    gMin: number;
    gMax: number;
    bMin: number;
    bMax: number;
  }

  const statOf = (start: number, end: number): Box => {
    let rMin = 255;
    let rMax = 0;
    let gMin = 255;
    let gMax = 0;
    let bMin = 255;
    let bMax = 0;
    for (let p = start; p < end; p++) {
      const o = (order[p] ?? 0) * 4;
      const r = rgba[o] ?? 0;
      const g = rgba[o + 1] ?? 0;
      const b = rgba[o + 2] ?? 0;
      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
      if (g < gMin) gMin = g;
      if (g > gMax) gMax = g;
      if (b < bMin) bMin = b;
      if (b > bMax) bMax = b;
    }
    return { start, end, rMin, rMax, gMin, gMax, bMin, bMax };
  };

  // Устойчивая сортировка среза order[start..end) по каналу `channel` (0=r,1=g,2=b).
  const sortSlice = (start: number, end: number, channel: number): void => {
    sortCounts.fill(0);
    for (let p = start; p < end; p++) {
      const v = rgba[(order[p] ?? 0) * 4 + channel] ?? 0;
      sortCounts[v] = (sortCounts[v] ?? 0) + 1;
    }
    // Префиксные суммы → стартовые позиции корзин внутри среза.
    let acc = start;
    for (let v = 0; v < 256; v++) {
      const c = sortCounts[v] ?? 0;
      sortCounts[v] = acc;
      acc += c;
    }
    for (let p = start; p < end; p++) {
      const idx = order[p] ?? 0;
      const v = rgba[idx * 4 + channel] ?? 0;
      const pos = sortCounts[v] ?? 0;
      scratch[pos] = idx;
      sortCounts[v] = pos + 1;
    }
    for (let p = start; p < end; p++) order[p] = scratch[p] ?? 0;
  };

  const boxes: Box[] = [statOf(0, pixelCount)];

  while (boxes.length < colorCap) {
    // Выбираем делимый бокс (size>1) с наибольшим разбросом по одному из каналов.
    let target = -1;
    let bestRange = 0;
    let bestChannel = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b === undefined || b.end - b.start < 2) continue;
      const rr = b.rMax - b.rMin;
      const gr = b.gMax - b.gMin;
      const br = b.bMax - b.bMin;
      const m = rr >= gr && rr >= br ? rr : gr >= br ? gr : br;
      if (m > bestRange) {
        bestRange = m;
        target = i;
        bestChannel = rr >= gr && rr >= br ? 0 : gr >= br ? 1 : 2;
      }
    }
    if (target < 0 || bestRange === 0) break; // делить нечего (все боксы одноцветны)

    const b = boxes[target];
    if (b === undefined) break;
    sortSlice(b.start, b.end, bestChannel);
    const mid = (b.start + b.end) >> 1; // size≥2 ⇒ start<mid<end (обе части непусты)
    boxes[target] = statOf(b.start, mid);
    boxes.push(statOf(mid, b.end));
  }

  const palette = new Uint8Array(boxes.length * 3);
  for (let k = 0; k < boxes.length; k++) {
    const b = boxes[k];
    if (b === undefined) continue;
    const n = b.end - b.start;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    for (let p = b.start; p < b.end; p++) {
      const idx = order[p] ?? 0;
      const o = idx * 4;
      sr += rgba[o] ?? 0;
      sg += rgba[o + 1] ?? 0;
      sb += rgba[o + 2] ?? 0;
      indices[idx] = k;
    }
    palette[k * 3] = Math.round(sr / n);
    palette[k * 3 + 1] = Math.round(sg / n);
    palette[k * 3 + 2] = Math.round(sb / n);
  }

  return { palette, indices };
}

/**
 * Число бит на индекс палитры (размер локальной таблицы = `2^bits`): минимум 2 по
 * спецификации LZW, максимум 8 (256 цветов). Для `colorCount` цветов — минимальный
 * `bits`, вмещающий все.
 */
export function paletteBits(colorCount: number): number {
  let bits = 2;
  while (1 << bits < colorCount) bits++;
  return Math.min(8, bits);
}

/**
 * LZW-сжатие индексов в поток данных изображения GIF: ведущий подблок НЕ включает
 * (его пишет `encodeGifFrame`), но включает разбиение на подблоки ≤255 байт и
 * завершающий нулевой подблок. `minCodeSize` = число бит палитры (см. `paletteBits`).
 *
 * Тайминг роста ширины кода и сброса словаря — как в проверенных браузеро-совместимых
 * энкодерах (рост при `next >= 2^codeSize` перед присвоением; сброс `clear` при
 * заполнении до 4096). Корректность закреплена round-trip тестом со спец-декодером.
 */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  const raw: number[] = [];
  let cur = 0;
  let curBits = 0;
  let codeSize = minCodeSize + 1;

  const emit = (code: number): void => {
    cur |= code << curBits;
    curBits += codeSize;
    while (curBits >= 8) {
      raw.push(cur & 0xff);
      cur >>= 8;
      curBits -= 8;
    }
  };

  emit(clearCode);

  if (indices.length > 0) {
    const dict = new Map<number, number>();
    let next = clearCode + 2;
    let prefix = indices[0] ?? 0;

    for (let i = 1; i < indices.length; i++) {
      const k = indices[i] ?? 0;
      const key = (prefix << 8) | k;
      const existing = dict.get(key);
      if (existing !== undefined) {
        prefix = existing;
        continue;
      }
      emit(prefix);
      if (next === 4096) {
        // Словарь полон — сброс: перезапуск ширины и словаря (как ждёт декодер).
        emit(clearCode);
        dict.clear();
        codeSize = minCodeSize + 1;
        next = clearCode + 2;
      } else {
        if (next >= 1 << codeSize) codeSize++;
        dict.set(key, next++);
      }
      prefix = k;
    }

    emit(prefix);
    emit(eoiCode);
  } else {
    emit(eoiCode);
  }

  if (curBits > 0) raw.push(cur & 0xff);

  // Разбиение на подблоки: каждый ≤255 байт с префиксом длины; завершается нулём.
  const out: number[] = [];
  for (let i = 0; i < raw.length; i += 255) {
    const end = Math.min(i + 255, raw.length);
    out.push(end - i);
    for (let j = i; j < end; j++) out.push(raw[j] ?? 0);
  }
  out.push(0);
  return Uint8Array.from(out);
}

/** Пишет 16-битное little-endian значение в массив байт. */
function pushU16(out: number[], value: number): void {
  out.push(value & 0xff, (value >> 8) & 0xff);
}

/**
 * Заголовок GIF89a: сигнатура + дескриптор логического экрана (без глобальной
 * палитры — используем локальные на кадр) + расширение зацикливания Netscape 2.0
 * (бесконечный цикл). Возвращает готовые байты «шапки» файла.
 */
export function gifHeader(width: number, height: number): Uint8Array {
  const out: number[] = [];
  // "GIF89a"
  out.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
  // Logical Screen Descriptor.
  pushU16(out, width);
  pushU16(out, height);
  out.push(0x00); // packed: без глобальной палитры
  out.push(0x00); // индекс фона
  out.push(0x00); // соотношение пикселей
  // Netscape 2.0 Application Extension — зацикливание.
  out.push(0x21, 0xff, 0x0b);
  for (const ch of 'NETSCAPE2.0') out.push(ch.charCodeAt(0));
  out.push(0x03, 0x01);
  pushU16(out, 0); // 0 = бесконечный цикл
  out.push(0x00); // терминатор подблоков
  return Uint8Array.from(out);
}

/** Трейлер GIF (конец файла). */
export const GIF_TRAILER: Uint8Array = new Uint8Array([0x3b]);

/**
 * Кодирует один кадр GIF из RGBA: Graphic Control Extension (задержка, метод
 * утилизации «оставить»), Image Descriptor с флагом локальной палитры, сама локальная
 * палитра (дополненная до `2^bits`) и LZW-данные. `delayCs` — задержка в сотых долях
 * секунды. Возвращает байты кадра (конкатенируются между `gifHeader` и `GIF_TRAILER`).
 */
export function encodeGifFrame(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  delayCs: number,
  maxColors = 256,
): Uint8Array {
  const { palette, indices } = quantize(rgba, maxColors);
  const colorCount = palette.length / 3;
  const bits = paletteBits(colorCount);
  const tableSize = 1 << bits;

  const out: number[] = [];

  // Graphic Control Extension: packed 0x04 = метод утилизации 1 («не утилизировать»),
  // без прозрачности; задержка в сотых секунды.
  out.push(0x21, 0xf9, 0x04, 0x04);
  pushU16(out, Math.max(0, Math.min(65_535, Math.round(delayCs))));
  out.push(0x00); // индекс прозрачного цвета (не используется)
  out.push(0x00); // терминатор

  // Image Descriptor.
  out.push(0x2c);
  pushU16(out, 0); // left
  pushU16(out, 0); // top
  pushU16(out, width);
  pushU16(out, height);
  out.push(0x80 | (bits - 1)); // локальная палитра + её размер (bits-1)

  // Локальная палитра, дополненная нулями до 2^bits записей.
  for (let i = 0; i < tableSize; i++) {
    const o = i * 3;
    if (o + 2 < palette.length) {
      out.push(palette[o] ?? 0, palette[o + 1] ?? 0, palette[o + 2] ?? 0);
    } else {
      out.push(0, 0, 0);
    }
  }

  // Данные изображения: ведущий байт минимальной ширины кода + LZW-подблоки.
  out.push(bits);
  const header = Uint8Array.from(out);
  const lzw = lzwEncode(indices, bits);

  const frame = new Uint8Array(header.length + lzw.length);
  frame.set(header, 0);
  frame.set(lzw, header.length);
  return frame;
}
