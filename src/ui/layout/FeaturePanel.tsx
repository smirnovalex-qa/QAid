/**
 * Каркас панели фичи: семантическая секция с заголовком, описанием, телом,
 * областью вывода и футером действий. Даёт единую структуру и доступное имя
 * (`section aria-labelledby`) всем инструментам без дублирования разметки.
 */
import type { ComponentChildren, JSX } from 'preact';
import { useId } from 'preact/hooks';
import styles from './featurePanel.module.css';

export interface FeaturePanelProps {
  /** Заголовок панели. Опционален: в оболочке редизайна шапку рисует shell. */
  readonly title?: string;
  readonly description?: string;
  /** Тело панели (форма, контролы). */
  readonly children: ComponentChildren;
  /** Кнопки-действия в футере. */
  readonly actions?: ComponentChildren;
  /** Область вывода (обычно `<OutputPanel/>`). */
  readonly output?: ComponentChildren;
  /**
   * Без карточной обёртки (рамки/паддинга) — только раскладка. Используется,
   * когда фича встроена в оболочку, которая уже даёт контейнер и шапку.
   */
  readonly bare?: boolean;
}

export function FeaturePanel(props: FeaturePanelProps): JSX.Element {
  const headingId = useId();
  const rootClass = props.bare ? styles.bareRoot : styles.root;

  const inner = (
    <>
      {props.title !== undefined && (
        <h2 id={headingId} class={styles.title}>
          {props.title}
        </h2>
      )}
      {props.description !== undefined && <p class={styles.description}>{props.description}</p>}
      <div class={styles.body}>{props.children}</div>
      {props.output !== undefined && <div class={styles.output}>{props.output}</div>}
      {props.actions !== undefined && <footer class={styles.actions}>{props.actions}</footer>}
    </>
  );

  // С заголовком — размеченный регион (aria-labelledby); без — простой контейнер.
  return props.title !== undefined ? (
    <section class={rootClass} aria-labelledby={headingId}>
      {inner}
    </section>
  ) : (
    <div class={rootClass}>{inner}</div>
  );
}
