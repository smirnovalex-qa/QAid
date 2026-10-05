/**
 * Тесты общей диаграммы box-model (редизайн UI/UX): слои margin/border/padding с
 * числами сторон и центральный размер контента, с учётом форматтера единиц.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { BoxModelDiagram } from '../index';

const props = {
  margin: { top: 24, right: 0, bottom: 0, left: 0 },
  border: { top: 1, right: 1, bottom: 1, left: 1 },
  padding: { top: 5, right: 10, bottom: 5, left: 10 },
  content: { width: 136, height: 24 },
};

describe('BoxModelDiagram', () => {
  it('рисует три слоя и центр контента', () => {
    render(<BoxModelDiagram {...props} format={(px) => `${String(px)}px`} />);
    expect(screen.getByTestId('boxmodel-diagram')).toBeInTheDocument();
    expect(screen.getByTestId('boxmodel-margin')).toBeInTheDocument();
    expect(screen.getByTestId('boxmodel-border')).toBeInTheDocument();
    expect(screen.getByTestId('boxmodel-padding')).toBeInTheDocument();
    expect(screen.getByTestId('boxmodel-content')).toHaveTextContent('136px × 24px');
  });

  it('форматирует значения сторон переданным форматтером', () => {
    render(<BoxModelDiagram {...props} format={(px) => `${String(px)}px`} />);
    const padding = screen.getByTestId('boxmodel-padding');
    expect(padding).toHaveTextContent('5px'); // top/bottom
    expect(padding).toHaveTextContent('10px'); // right/left
    expect(screen.getByTestId('boxmodel-margin')).toHaveTextContent('24px'); // top
  });

  it('единицы применяются форматтером (напр. rem)', () => {
    render(<BoxModelDiagram {...props} format={(px) => `${String(px / 16)}rem`} />);
    expect(screen.getByTestId('boxmodel-content')).toHaveTextContent('8.5rem × 1.5rem');
  });
});
