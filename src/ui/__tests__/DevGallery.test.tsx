import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/preact';
import { axe } from 'vitest-axe';
import { DevGallery } from '@/ui/DevGallery';
import { ToastProvider } from '@/ui/components';

describe('DevGallery', () => {
  it('renders the full component showcase inside a ToastProvider', () => {
    const { getByRole, getAllByRole } = render(
      <ToastProvider>
        <DevGallery />
      </ToastProvider>,
    );
    expect(getByRole('tablist')).toBeInTheDocument();
    // Много кнопок из всех вариантов + переключатель темы.
    expect(getAllByRole('button').length).toBeGreaterThan(5);
  });

  it('has no critical/serious a11y violations (vitest-axe)', async () => {
    const { container } = render(
      <ToastProvider>
        <DevGallery />
      </ToastProvider>,
    );
    const results = await axe(container);
    const severe = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(severe).toEqual([]);
  });
});
