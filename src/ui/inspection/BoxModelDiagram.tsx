/**
 * Общая диаграмма box-model (TASK-052 · редизайн UI/UX) — переиспользуемая
 * визуализация вложенных слоёв `margin → border → padding → content` в стиле
 * DevTools: у каждого слоя подпись и четыре числовых значения сторон, в центре —
 * размер контента `W × H`.
 *
 * Чистое представление: принимает уже сериализованные числа (px) и форматтер единиц;
 * ни `chrome.*`, ни DOM-узлов. Потребители — «Инспектор элемента» (`inspector-probe`,
 * значения разбираются из группы `boxModel`) и «Линейка» в режиме box (`inspector-ruler`,
 * структурный `BoxModel`).
 *
 * a11y: `<figure>` с `aria-label`; числа сторон помечены `title` (сторона), сам слой —
 * его именем. Значения не интерактивны — диаграмма только показывает.
 */
import type { JSX } from 'preact';
import { t } from '@/i18n';
import { cn } from '@/ui/cn';
import styles from './BoxModelDiagram.module.css';

/** Четыре стороны слоя в пикселях (сериализуемый снимок). */
export interface BoxSidesInput {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface BoxModelDiagramProps {
  readonly margin: BoxSidesInput;
  readonly border: BoxSidesInput;
  readonly padding: BoxSidesInput;
  readonly content: { readonly width: number; readonly height: number };
  /** Форматтер значения в выбранных единицах (px/rem). */
  readonly format: (px: number) => string;
}

/** Один слой диаграммы: рамка-полоса, подпись в углу и 4 значения по центрам сторон. */
function Layer(props: {
  name: 'margin' | 'border' | 'padding';
  sides: BoxSidesInput;
  format: (px: number) => string;
  children: JSX.Element;
}): JSX.Element {
  const { name, sides, format, children } = props;
  const fmt = (px: number): string => format(px);
  return (
    <div class={cn(styles.layer, styles[name])} data-testid={`boxmodel-${name}`}>
      <span class={styles.layerLabel}>{t(`inspection.box.${name}`)}</span>
      <span class={cn(styles.side, styles.sideTop)} title={`${name}-top`}>
        {fmt(sides.top)}
      </span>
      <span class={cn(styles.side, styles.sideRight)} title={`${name}-right`}>
        {fmt(sides.right)}
      </span>
      <span class={cn(styles.side, styles.sideBottom)} title={`${name}-bottom`}>
        {fmt(sides.bottom)}
      </span>
      <span class={cn(styles.side, styles.sideLeft)} title={`${name}-left`}>
        {fmt(sides.left)}
      </span>
      {children}
    </div>
  );
}

export function BoxModelDiagram(props: BoxModelDiagramProps): JSX.Element {
  const { margin, border, padding, content, format } = props;
  return (
    <figure
      class={styles.diagram}
      aria-label={t('inspection.box.title')}
      data-testid="boxmodel-diagram"
    >
      <Layer name="margin" sides={margin} format={format}>
        <Layer name="border" sides={border} format={format}>
          <Layer name="padding" sides={padding} format={format}>
            <div class={styles.content} data-testid="boxmodel-content">
              <span class={styles.contentLabel}>{t('inspection.box.content')}</span>
              <span class={styles.contentSize}>
                {format(content.width)} × {format(content.height)}
              </span>
            </div>
          </Layer>
        </Layer>
      </Layer>
    </figure>
  );
}
