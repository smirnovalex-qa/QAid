/**
 * DEV-ONLY. Виртуальное DOM-дерево + резолвер шагов навигации для превью инспекторов
 * в обычной вкладке (без реального content-скрипта). Отвечает на инспекционные RPC
 * (`inspection/pick|navigate|collect|teardown|highlight|ping`) сериализуемыми снимками —
 * ровно тех форм, что валидирует шина, — чтобы редизайн шапки узла и диаграммы box-model
 * был виден и КЛИКАБЕЛЕН. НЕ часть сборки расширения (импортируется только `chrome-shim`).
 */

type Sides = readonly [top: number, right: number, bottom: number, left: number];

interface VNode {
  tag: string;
  id?: string;
  cls?: string[];
  w: number;
  h: number;
  pad?: Sides;
  border?: number;
  mar?: Sides;
  color?: string;
  bg?: string;
  fontSize?: number;
  fontWeight?: number;
  children?: VNode[];
  // Проставляется в prepare():
  parent?: VNode | undefined;
  depth?: number;
}

const S0: Sides = [0, 0, 0, 0];

/** Демо-страница «маркетинговый лендинг» — достаточно ветвления для соседей/глубины. */
const TREE: VNode = {
  tag: 'html',
  w: 1280,
  h: 2200,
  children: [
    {
      tag: 'body',
      w: 1280,
      h: 2200,
      children: [
        {
          tag: 'header',
          cls: ['site-header'],
          id: 'top',
          w: 1280,
          h: 64,
          pad: [0, 32, 0, 32],
          bg: '#4f46e5',
          color: '#ffffff',
          children: [
            { tag: 'a', cls: ['brand'], w: 132, h: 28, color: '#ffffff', fontWeight: 600 },
            {
              tag: 'nav',
              cls: ['main-nav'],
              w: 420,
              h: 40,
              children: [
                {
                  tag: 'ul',
                  cls: ['nav-list'],
                  w: 420,
                  h: 40,
                  children: [
                    { tag: 'li', cls: ['nav-item'], w: 96, h: 40 },
                    { tag: 'li', cls: ['nav-item'], w: 96, h: 40 },
                    { tag: 'li', cls: ['nav-item'], w: 96, h: 40 },
                  ],
                },
              ],
            },
          ],
        },
        {
          tag: 'main',
          id: 'content',
          w: 1280,
          h: 2000,
          children: [
            {
              tag: 'section',
              cls: ['hero'],
              w: 1200,
              h: 520,
              pad: [48, 64, 48, 64],
              bg: '#f6f6f7',
              children: [
                {
                  tag: 'h1',
                  cls: ['hero__title'],
                  w: 900,
                  h: 96,
                  color: '#18181b',
                  fontSize: 44,
                  fontWeight: 700,
                },
                {
                  tag: 'p',
                  cls: ['hero__lead'],
                  w: 720,
                  h: 56,
                  color: '#52525b',
                  fontSize: 18,
                  fontWeight: 400,
                },
                {
                  tag: 'a',
                  cls: ['btn', 'btn--primary'],
                  w: 184,
                  h: 48,
                  pad: [12, 24, 12, 24],
                  border: 0,
                  mar: [24, 0, 0, 0],
                  bg: '#4f46e5',
                  color: '#ffffff',
                  fontSize: 16,
                  fontWeight: 600,
                },
              ],
            },
            {
              tag: 'section',
              cls: ['features'],
              w: 1200,
              h: 640,
              children: [
                {
                  tag: 'article',
                  cls: ['card'],
                  w: 360,
                  h: 320,
                  pad: [24, 24, 24, 24],
                  border: 1,
                  mar: [0, 24, 0, 0],
                  bg: '#ffffff',
                  children: [
                    {
                      tag: 'h3',
                      cls: ['card__title'],
                      w: 300,
                      h: 32,
                      fontSize: 20,
                      fontWeight: 600,
                    },
                    {
                      tag: 'p',
                      cls: ['card__text'],
                      w: 300,
                      h: 120,
                      color: '#52525b',
                      fontSize: 14,
                    },
                  ],
                },
                {
                  tag: 'article',
                  cls: ['card'],
                  w: 360,
                  h: 320,
                  pad: [24, 24, 24, 24],
                  border: 1,
                  mar: [0, 24, 0, 0],
                  bg: '#ffffff',
                  children: [
                    {
                      tag: 'h3',
                      cls: ['card__title'],
                      w: 300,
                      h: 32,
                      fontSize: 20,
                      fontWeight: 600,
                    },
                    {
                      tag: 'p',
                      cls: ['card__text'],
                      w: 300,
                      h: 120,
                      color: '#52525b',
                      fontSize: 14,
                    },
                  ],
                },
                {
                  tag: 'article',
                  cls: ['card'],
                  w: 360,
                  h: 320,
                  pad: [24, 24, 24, 24],
                  border: 1,
                  mar: [0, 0, 0, 0],
                  bg: '#ffffff',
                  children: [
                    {
                      tag: 'h3',
                      cls: ['card__title'],
                      w: 300,
                      h: 32,
                      fontSize: 20,
                      fontWeight: 600,
                    },
                    {
                      tag: 'p',
                      cls: ['card__text'],
                      w: 300,
                      h: 120,
                      color: '#52525b',
                      fontSize: 14,
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          tag: 'footer',
          cls: ['site-footer'],
          w: 1280,
          h: 120,
          pad: [24, 32, 24, 32],
          bg: '#18181b',
          color: '#a1a1aa',
        },
      ],
    },
  ],
};

/** Проставляет parent/depth по дереву. */
function prepare(node: VNode, parent: VNode | undefined, depth: number): void {
  node.parent = parent;
  node.depth = depth;
  for (const child of node.children ?? []) prepare(child, node, depth + 1);
}
prepare(TREE, undefined, 0);

/** Узел, выбираемый по умолчанию при `pick` — первичная кнопка (есть box + контраст). */
function defaultAnchor(): VNode {
  const main = TREE.children![0]!.children![1]!; // body > main
  const hero = main.children![0]!;
  return hero.children![2]!; // a.btn.btn--primary
}

let anchor: VNode = defaultAnchor();

/**
 * Curated-путь «проваливания кликом» для живого режима (TASK-056): каждый `pickLive`
 * отдаёт следующий, более глубокий узел, эмулируя клик курсором вглубь; по достижении
 * конца — `null` (выход из live с сохранением последнего узла). Заканчивается на кнопке
 * (есть контраст) — итоговый профиль богатый.
 */
function liveSequence(): VNode[] {
  const body = TREE.children![0]!;
  const main = body.children![1]!; // main#content
  const hero = main.children![0]!; // section.hero
  const h1 = hero.children![0]!; // h1.hero__title
  const cta = hero.children![2]!; // a.btn.btn--primary
  return [main, hero, h1, cta];
}
let liveStep = 0;

function selectorOf(node: VNode): string {
  let s = node.tag;
  if (node.id !== undefined) s += `#${node.id}`;
  for (const c of node.cls ?? []) s += `.${c}`;
  return s;
}

function siblings(node: VNode): VNode[] {
  return node.parent?.children ?? [node];
}

function descriptor(node: VNode): Record<string, unknown> {
  const sibs = siblings(node);
  return {
    tagName: node.tag,
    id: node.id ?? null,
    classNames: node.cls ?? [],
    selector: selectorOf(node),
    rect: { x: 0, y: 0, width: node.w, height: node.h },
    childElementCount: (node.children ?? []).length,
    siblingIndex: sibs.indexOf(node),
    siblingCount: sibs.length,
    depth: node.depth ?? 0,
  };
}

function pathTo(node: VNode): Record<string, unknown>[] {
  const chain: VNode[] = [];
  let cur: VNode | undefined = node;
  while (cur !== undefined) {
    chain.unshift(cur);
    cur = cur.parent;
  }
  return chain.map(descriptor);
}

function navState(node: VNode): Record<string, unknown> {
  return {
    node: descriptor(node),
    path: pathTo(node),
    canAscend: node.parent !== undefined,
    canDescend: (node.children ?? []).length > 0,
  };
}

function resolve(step: string, depth: number | undefined): VNode {
  const sibs = siblings(anchor);
  const idx = sibs.indexOf(anchor);
  switch (step) {
    case 'parent':
      return anchor.parent ?? anchor;
    case 'firstChild':
      return anchor.children?.[0] ?? anchor;
    case 'nextSibling':
      return sibs[idx + 1] ?? anchor;
    case 'previousSibling':
      return sibs[idx - 1] ?? anchor;
    case 'ancestorAtDepth': {
      if (depth === undefined) return anchor;
      let cur: VNode | undefined = anchor;
      while (cur !== undefined && (cur.depth ?? 0) > depth) cur = cur.parent;
      return cur ?? anchor;
    }
    default:
      return anchor;
  }
}

const px = (n: number): string => `${String(n)}px`;

/**
 * Демо matched CSS rules / каскада (TASK-055): несколько совпавших правил с разной
 * specificity, одно inline, одно `!important`, перекрытия (зачёркивание) и одна
 * нечитаемая cross-origin таблица — чтобы секцию каскада можно было проверить
 * визуально в preview.html.
 */
function demoRules(node: VNode): Record<string, unknown> {
  const color = node.color ?? 'rgb(24, 24, 27)';
  const bg = node.bg ?? 'rgb(255, 255, 255)';
  const cls = node.cls ?? [];
  const hasInline = node.tag === 'a' || cls.includes('btn');
  const primarySel = cls.length > 0 ? `.${cls.join('.')}` : node.tag;
  const primarySpec: [number, number, number] = [0, Math.max(1, cls.length), 0];
  const baseSel = cls.length > 1 ? `.${cls[0]}` : null;
  const lineHeight = px(Math.round((node.fontSize ?? 16) * 1.4));

  const rules: Record<string, unknown>[] = [];

  if (hasInline) {
    rules.push({
      selectorText: 'element.style',
      specificity: [0, 0, 0],
      origin: 'inline',
      source: '<inline>',
      media: null,
      layer: null,
      declarations: [{ property: 'color', value: color, important: false, winning: true }],
    });
  }

  rules.push({
    selectorText: primarySel,
    specificity: primarySpec,
    origin: 'author',
    source: 'app.css',
    media: null,
    layer: 'components',
    declarations: [
      { property: 'background-color', value: bg, important: false, winning: true },
      { property: 'color', value: color, important: false, winning: !hasInline },
    ],
  });

  if (baseSel !== null) {
    rules.push({
      selectorText: baseSel,
      specificity: [0, 1, 0],
      origin: 'author',
      source: 'app.css',
      media: null,
      layer: 'components',
      // color перекрыт более специфичным правилом выше → зачёркнут.
      declarations: [
        { property: 'color', value: 'rgb(82, 82, 91)', important: false, winning: false },
        {
          property: 'font-weight',
          value: String(node.fontWeight ?? 400),
          important: false,
          winning: true,
        },
      ],
    });
  }

  rules.push({
    selectorText: node.tag,
    specificity: [0, 0, 1],
    origin: 'author',
    source: 'reset.css',
    media: '@media (min-width: 768px)',
    layer: null,
    declarations: [{ property: 'line-height', value: lineHeight, important: true, winning: true }],
  });

  const colorSource = hasInline
    ? {
        selectorText: 'element.style',
        specificity: [0, 0, 0],
        important: false,
        origin: 'inline',
        source: '<inline>',
      }
    : {
        selectorText: primarySel,
        specificity: primarySpec,
        important: false,
        origin: 'author',
        source: 'app.css',
      };

  return {
    rules,
    propertySources: {
      color: colorSource,
      'background-color': {
        selectorText: primarySel,
        specificity: primarySpec,
        important: false,
        origin: 'author',
        source: 'app.css',
      },
      'font-weight':
        baseSel !== null
          ? {
              selectorText: baseSel,
              specificity: [0, 1, 0],
              important: false,
              origin: 'author',
              source: 'app.css',
            }
          : {
              selectorText: primarySel,
              specificity: primarySpec,
              important: false,
              origin: 'author',
              source: 'app.css',
            },
      'line-height': {
        selectorText: node.tag,
        specificity: [0, 0, 1],
        important: true,
        origin: 'author',
        source: 'reset.css',
      },
    },
    unreadableSheets: 1,
    truncated: false,
  };
}

/** ElementProps для «Инспектора элемента» (probe). */
function probeData(node: VNode): Record<string, unknown> {
  const pad = node.pad ?? S0;
  const mar = node.mar ?? S0;
  const b = node.border ?? 0;
  const groups: { id: string; entries: { property: string; value: string; kind: string }[] }[] = [
    {
      id: 'typography',
      entries: [
        { property: 'font-family', value: 'IBM Plex Sans, system-ui, sans-serif', kind: 'text' },
        { property: 'font-size', value: px(node.fontSize ?? 16), kind: 'length' },
        { property: 'font-weight', value: String(node.fontWeight ?? 400), kind: 'text' },
        {
          property: 'line-height',
          value: px(Math.round((node.fontSize ?? 16) * 1.4)),
          kind: 'length',
        },
      ],
    },
    {
      id: 'color',
      entries: [
        { property: 'color', value: node.color ?? 'rgb(24, 24, 27)', kind: 'color' },
        { property: 'background-color', value: node.bg ?? 'rgba(0, 0, 0, 0)', kind: 'color' },
      ],
    },
    {
      id: 'boxModel',
      entries: [
        { property: 'width', value: px(node.w - pad[1] - pad[3] - 2 * b), kind: 'length' },
        { property: 'height', value: px(node.h - pad[0] - pad[2] - 2 * b), kind: 'length' },
        { property: 'padding-top', value: px(pad[0]), kind: 'length' },
        { property: 'padding-right', value: px(pad[1]), kind: 'length' },
        { property: 'padding-bottom', value: px(pad[2]), kind: 'length' },
        { property: 'padding-left', value: px(pad[3]), kind: 'length' },
        { property: 'margin-top', value: px(mar[0]), kind: 'length' },
        { property: 'margin-right', value: px(mar[1]), kind: 'length' },
        { property: 'margin-bottom', value: px(mar[2]), kind: 'length' },
        { property: 'margin-left', value: px(mar[3]), kind: 'length' },
        { property: 'border-top-width', value: px(b), kind: 'length' },
        { property: 'border-right-width', value: px(b), kind: 'length' },
        { property: 'border-bottom-width', value: px(b), kind: 'length' },
        { property: 'border-left-width', value: px(b), kind: 'length' },
      ],
    },
    {
      id: 'layout',
      entries: [
        {
          property: 'display',
          value: node.tag === 'span' || node.tag === 'a' ? 'inline-block' : 'block',
          kind: 'text',
        },
        { property: 'position', value: 'static', kind: 'text' },
      ],
    },
  ];
  const contrast =
    node.color !== undefined && node.bg !== undefined
      ? {
          foreground: node.color,
          background: node.bg,
          ratio: 4.83,
          large: (node.fontSize ?? 16) >= 24,
          approximate: false,
        }
      : null;
  return {
    identity: {
      tagName: node.tag,
      id: node.id ?? null,
      classNames: node.cls ?? [],
      selector: selectorOf(node),
    },
    attributes: node.id !== undefined ? { id: node.id } : {},
    geometry: { x: 0, y: 0, width: node.w, height: node.h },
    contrast,
    groups,
    rules: demoRules(node),
  };
}

/** BoxModel для «Линейки» (режим box). */
function rulerData(node: VNode): Record<string, unknown> {
  const pad = node.pad ?? S0;
  const mar = node.mar ?? S0;
  const b = node.border ?? 0;
  const sides = (s: Sides): Record<string, number> => ({
    top: s[0],
    right: s[1],
    bottom: s[2],
    left: s[3],
  });
  return {
    rect: { x: 0, y: 0, width: node.w, height: node.h },
    content: { width: node.w - pad[1] - pad[3] - 2 * b, height: node.h - pad[0] - pad[2] - 2 * b },
    padding: sides(pad),
    border: { top: b, right: b, bottom: b, left: b },
    margin: sides(mar),
  };
}

/**
 * Отвечает на инспекционный RPC демо-данными или `undefined`, если тип не наш
 * (тогда `chrome-shim` идёт в свою общую заглушку).
 */
export function inspectionDemo(type: string, payload: Record<string, unknown>): unknown {
  switch (type) {
    case 'inspection/ping':
      return { ready: true };
    case 'inspection/pick':
      anchor = defaultAnchor();
      liveStep = 0;
      return { ...descriptor(anchor), navigation: navState(anchor) };
    case 'inspection/pickLive': {
      // Эмулируем «проваливание кликом»: каждый вызов — следующий, более глубокий узел;
      // по достижении конца пути — null (выход из живого режима, узел сохраняется).
      const seq = liveSequence();
      if (liveStep >= seq.length) {
        liveStep = 0;
        return null;
      }
      anchor = seq[liveStep]!;
      liveStep += 1;
      return { ...descriptor(anchor), navigation: navState(anchor) };
    }
    case 'inspection/pickLiveStop':
      liveStep = 0;
      return { ok: true };
    case 'inspection/navigate':
      anchor = resolve(String(payload.step), payload.depth as number | undefined);
      return navState(anchor);
    case 'inspection/collect': {
      const id = String(payload.inspectorId);
      if (id === 'probe') return { inspectorId: id, data: probeData(anchor) };
      if (id === 'ruler') return { inspectorId: id, data: rulerData(anchor) };
      return { inspectorId: id, data: null };
    }
    case 'inspection/highlight':
      return { found: true };
    case 'inspection/teardown':
    case 'inspection/measureStop':
      liveStep = 0;
      return { ok: true };
    default:
      return undefined;
  }
}
