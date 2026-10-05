/**
 * Тесты общего навигатора по DOM-иерархии (TASK-052): breadcrumb, disabled-состояния
 * по canAscend/canDescend/границам соседей, `aria-current`, индикатор позиции, шаги.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { t } from '@/i18n';
import type { NavigationState, NodeDescriptor } from '@/shared/inspection/types';
import { HierarchyNav } from '../index';

function desc(
  partial: Partial<NodeDescriptor> & { tagName: string; depth: number },
): NodeDescriptor {
  return {
    id: null,
    classNames: [],
    selector: partial.selector ?? partial.tagName,
    rect: { x: 0, y: 0, width: 0, height: 0 },
    childElementCount: partial.childElementCount ?? 0,
    siblingIndex: partial.siblingIndex ?? 0,
    siblingCount: partial.siblingCount ?? 1,
    ...partial,
  };
}

const state: NavigationState = {
  node: desc({
    tagName: 'span',
    selector: 'span#b',
    id: 'b',
    classNames: ['label', 'label--strong'],
    rect: { x: 0, y: 0, width: 320, height: 48 },
    depth: 3,
    childElementCount: 0,
    siblingIndex: 1,
    siblingCount: 3,
  }),
  path: [
    desc({ tagName: 'html', selector: 'html', depth: 0 }),
    desc({ tagName: 'body', selector: 'body', depth: 1 }),
    desc({ tagName: 'div', selector: 'div#p', id: 'p', depth: 2 }),
    desc({
      tagName: 'span',
      selector: 'span#b',
      id: 'b',
      depth: 3,
      siblingIndex: 1,
      siblingCount: 3,
    }),
  ],
  canAscend: true,
  canDescend: false,
};

describe('HierarchyNav', () => {
  it('рисует breadcrumb с aria-current на текущем узле', () => {
    render(<HierarchyNav state={state} onStep={() => undefined} />);
    const crumbs = screen.getAllByTestId('hierarchy-crumb');
    expect(crumbs).toHaveLength(4);
    // Последний — текущий, помечен aria-current и disabled.
    const current = crumbs[crumbs.length - 1]!;
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(current).toBeDisabled();
  });

  it('клик по предку в breadcrumb шлёт ancestorAtDepth с его глубиной', () => {
    const onStep = vi.fn();
    render(<HierarchyNav state={state} onStep={onStep} />);
    // Кликаем по #p (depth 2).
    fireEvent.click(
      screen.getByRole('button', { name: t('inspection.nav.goTo', { selector: 'div#p' }) }),
    );
    expect(onStep).toHaveBeenCalledWith('ancestorAtDepth', 2);
  });

  it('disabled-состояния соответствуют canAscend/canDescend и границам соседей', () => {
    render(<HierarchyNav state={state} onStep={() => undefined} />);
    expect(screen.getByTestId('hierarchy-parent')).not.toBeDisabled(); // canAscend
    expect(screen.getByTestId('hierarchy-child')).toBeDisabled(); // !canDescend (лист)
    // siblingIndex 1 из 3 → есть и предыдущий, и следующий.
    expect(screen.getByTestId('hierarchy-prev')).not.toBeDisabled();
    expect(screen.getByTestId('hierarchy-next')).not.toBeDisabled();
  });

  it('показывает индикатор позиции среди соседей', () => {
    render(<HierarchyNav state={state} onStep={() => undefined} />);
    expect(screen.getByTestId('hierarchy-position')).toHaveTextContent(
      t('inspection.nav.position', { index: 2, count: 3 }),
    );
  });

  it('шаговые контролы поднимают шаг наверх', () => {
    const onStep = vi.fn();
    render(<HierarchyNav state={state} onStep={onStep} />);
    fireEvent.click(screen.getByTestId('hierarchy-parent'));
    expect(onStep).toHaveBeenCalledWith('parent');
    fireEvent.click(screen.getByTestId('hierarchy-next'));
    expect(onStep).toHaveBeenCalledWith('nextSibling');
  });

  it('шапка показывает идентичность узла и размеры', () => {
    render(<HierarchyNav state={state} onStep={() => undefined} />);
    const identity = screen.getByTestId('hierarchy-identity');
    expect(identity).toHaveTextContent('span');
    expect(identity).toHaveTextContent('#b');
    expect(identity).toHaveTextContent('.label');
    expect(screen.getByTestId('hierarchy-dimensions')).toHaveTextContent(
      t('inspection.node.size', { width: 320, height: 48 }),
    );
  });

  it('кнопка «копировать селектор» появляется по onCopySelector и шлёт селектор', () => {
    const onCopySelector = vi.fn();
    render(<HierarchyNav state={state} onStep={() => undefined} onCopySelector={onCopySelector} />);
    fireEvent.click(screen.getByRole('button', { name: t('inspection.node.copySelector') }));
    expect(onCopySelector).toHaveBeenCalledWith('span#b');
  });

  it('наведение на крошку зовёт onHoverTarget с её селектором (обратная подсветка)', () => {
    const onHoverTarget = vi.fn();
    render(<HierarchyNav state={state} onStep={() => undefined} onHoverTarget={onHoverTarget} />);
    fireEvent.mouseEnter(
      screen.getByRole('button', { name: t('inspection.nav.goTo', { selector: 'div#p' }) }),
    );
    expect(onHoverTarget).toHaveBeenCalledWith('div#p');
  });

  it('фокус на крошке (a11y) тоже зовёт onHoverTarget с её селектором', () => {
    const onHoverTarget = vi.fn();
    render(<HierarchyNav state={state} onStep={() => undefined} onHoverTarget={onHoverTarget} />);
    // Нативный `.focus()` (как при табуляции с клавиатуры) — самый близкий к реальности
    // способ проверить `onFocus`: в этой сборке (react-compat) он слушает `focusin`.
    const crumb = screen.getByRole('button', {
      name: t('inspection.nav.goTo', { selector: 'div#p' }),
    });
    crumb.focus();
    expect(onHoverTarget).toHaveBeenCalledWith('div#p');
  });

  it('busy блокирует все контролы', () => {
    render(<HierarchyNav state={state} busy onStep={() => undefined} />);
    expect(screen.getByTestId('hierarchy-parent')).toBeDisabled();
    expect(screen.getByTestId('hierarchy-prev')).toBeDisabled();
    for (const crumb of screen.getAllByTestId('hierarchy-crumb')) {
      expect(crumb).toBeDisabled();
    }
  });
});
