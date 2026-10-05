// Select: кастомный listbox-комбобокс (не нативный <select>). Всплывающий список
// рендерится порталом в <body> с `position: fixed` по замеру триггера — поэтому
// он не обрезается overflow-контейнерами и не страдает от бага нативного попапа
// в side panel (нативный список позиционируется некорректно до первого reflow).
// Стилизуется целиком под дизайн-систему. Паттерн ARIA: select-only combobox с
// `aria-activedescendant` (фокус остаётся на кнопке-триггере).
import type { JSX } from 'preact';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { cn } from '@/ui/cn';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

/** Минимальное событие изменения: колбэки читают только `currentTarget.value`. */
export interface SelectChangeEvent {
  currentTarget: { value: string };
}

export interface SelectProps {
  id?: string;
  value?: string;
  disabled?: boolean;
  options: SelectOption[];
  class?: string | undefined;
  onChange?: (event: SelectChangeEvent) => void;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

interface PopupPos {
  left: number;
  width: number;
  maxHeight: number;
  // Ровно одно из top/bottom задано (вниз/вверх от триггера).
  top?: number;
  bottom?: number;
}

const GAP = 4; // зазор между триггером и списком
const MARGIN = 8; // отступ от края вьюпорта
const MIN_LIST = 120; // минимальная высота списка при нехватке места

export function Select(props: SelectProps): JSX.Element {
  const { options } = props;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopupPos | null>(null);

  const selectedIndex = options.findIndex((o) => o.value === props.value);
  const displayIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const selected = options[displayIndex];
  const [activeIndex, setActiveIndex] = useState(displayIndex);

  const place = useCallback((): void => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const spaceBelow = vh - r.bottom;
    const spaceAbove = r.top;
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(MIN_LIST, (openUp ? spaceAbove : spaceBelow) - GAP - MARGIN);
    setPos(
      openUp
        ? { left: r.left, width: r.width, bottom: vh - r.top + GAP, maxHeight }
        : { left: r.left, width: r.width, top: r.bottom + GAP, maxHeight },
    );
  }, []);

  const openMenu = useCallback((): void => {
    if (props.disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    place();
    setOpen(true);
  }, [props.disabled, selectedIndex, place]);

  const closeMenu = useCallback((): void => {
    setOpen(false);
  }, []);

  const commit = useCallback(
    (index: number): void => {
      const opt = options[index];
      setOpen(false);
      if (opt && opt.value !== props.value)
        props.onChange?.({ currentTarget: { value: opt.value } });
    },
    [options, props],
  );

  // Пока открыт: следим за скроллом/ресайзом (capture ловит и вложенные скроллы),
  // закрываемся по клику вне триггера и списка.
  useEffect(() => {
    if (!open) return;
    const onScrollResize = (): void => {
      place();
    };
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node | null;
      if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, place]);

  // Проскроллить активную опцию в зону видимости.
  useLayoutEffect(() => {
    if (!open) return;
    const el = popupRef.current?.querySelector<HTMLElement>(
      `[data-index="${String(activeIndex)}"]`,
    );
    // scrollIntoView есть не во всех средах (jsdom его не реализует).
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const onTriggerKeyDown = (e: KeyboardEvent): void => {
    if (props.disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const activeOptionId = open ? `${listId}-opt-${String(activeIndex)}` : undefined;

  return (
    <div class={cn(styles.wrap, props.class)} data-open={open ? 'true' : undefined}>
      <button
        ref={triggerRef}
        type="button"
        class={styles.trigger}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        {...(props.id !== undefined ? { id: props.id } : {})}
        {...(props.disabled !== undefined ? { disabled: props.disabled } : {})}
        {...(props['aria-invalid'] !== undefined ? { 'aria-invalid': props['aria-invalid'] } : {})}
        {...(activeOptionId !== undefined ? { 'aria-activedescendant': activeOptionId } : {})}
        {...(props['aria-describedby'] !== undefined
          ? { 'aria-describedby': props['aria-describedby'] }
          : {})}
        onClick={() => {
          if (open) closeMenu();
          else openMenu();
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span class={styles.value}>{selected?.label ?? ''}</span>
      </button>

      {open && pos
        ? createPortal(
            <div
              ref={popupRef}
              id={listId}
              role="listbox"
              class={styles.popup}
              style={{
                left: `${String(pos.left)}px`,
                width: `${String(pos.width)}px`,
                maxHeight: `${String(pos.maxHeight)}px`,
                ...(pos.top !== undefined ? { top: `${String(pos.top)}px` } : {}),
                ...(pos.bottom !== undefined ? { bottom: `${String(pos.bottom)}px` } : {}),
              }}
            >
              {options.map((opt, index) => (
                <div
                  key={opt.value}
                  id={`${listId}-opt-${String(index)}`}
                  role="option"
                  data-index={index}
                  data-value={opt.value}
                  aria-selected={index === displayIndex}
                  class={cn(
                    styles.option,
                    index === activeIndex && styles.optionActive,
                    index === displayIndex && styles.optionSelected,
                  )}
                  onPointerEnter={() => {
                    setActiveIndex(index);
                  }}
                  onClick={() => {
                    commit(index);
                  }}
                >
                  <span class={styles.optionLabel}>{opt.label}</span>
                  {index === displayIndex ? (
                    <span class={styles.check} aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
