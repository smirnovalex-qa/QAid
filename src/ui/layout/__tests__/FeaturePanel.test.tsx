import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { FeaturePanel } from '@/ui/layout/FeaturePanel';

describe('FeaturePanel', () => {
  it('рендерит секцию с доступным именем = title', () => {
    render(
      <FeaturePanel title="Генератор">
        <p>тело</p>
      </FeaturePanel>,
    );
    expect(screen.getByRole('region', { name: 'Генератор' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Генератор' })).toBeInTheDocument();
  });

  it('рендерит описание, тело, вывод и действия', () => {
    render(
      <FeaturePanel
        title="T"
        description="Описание"
        output={<div data-testid="out">вывод</div>}
        actions={<button type="button">Сгенерировать</button>}
      >
        <p data-testid="body">тело</p>
      </FeaturePanel>,
    );
    expect(screen.getByText('Описание')).toBeInTheDocument();
    expect(screen.getByTestId('body')).toBeInTheDocument();
    expect(screen.getByTestId('out')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сгенерировать' })).toBeInTheDocument();
  });

  it('не рендерит описание/вывод/футер, когда не переданы', () => {
    render(
      <FeaturePanel title="T">
        <p>тело</p>
      </FeaturePanel>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // Только заголовок, без параграфа-описания.
    expect(screen.queryByText('Описание')).not.toBeInTheDocument();
  });
});
