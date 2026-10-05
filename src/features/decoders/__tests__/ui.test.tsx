import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { mergeCatalog, t } from '@/i18n';
import ru from '@/features/decoders/i18n/ru';
import { ToastProvider } from '@/ui/components';
import { DecodersPanel } from '@/features/decoders/ui';

// Панель импортируется напрямую (без index) — домешиваем каталог вручную.
mergeCatalog('ru', ru);

function renderPanel(): void {
  render(
    <ToastProvider>
      <DecodersPanel />
    </ToastProvider>,
  );
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

function openTab(key: 'jwt' | 'base64' | 'url' | 'json'): void {
  fireEvent.click(screen.getByRole('tab', { name: t(`dec.tab.${key}`) }));
}

function type(value: string): void {
  fireEvent.input(screen.getByTestId('dec-input'), { target: { value } });
}

const b64u = (o: unknown): string =>
  btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DecodersPanel', () => {
  it('starts on the JWT tab', async () => {
    renderPanel();
    await settle();
    expect(screen.getByRole('tab', { name: t('dec.tab.jwt') })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('decodes a JWT with status badge, warning and payload', async () => {
    renderPanel();
    await settle();

    const future = Math.floor(Date.now() / 1000) + 3600;
    const token = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: 'u1', exp: future })}.sig`;
    type(token);

    await waitFor(() => {
      expect(screen.getByTestId('dec-jwt')).toBeInTheDocument();
    });
    expect(screen.getByText(t('dec.jwt.valid'))).toBeInTheDocument();
    expect(screen.getByText(t('dec.jwt.noSig'))).toBeInTheDocument();
    expect(screen.getByTestId('dec-jwt-payload')).toHaveTextContent('"sub": "u1"');
  });

  it('shows the "Not a JWT" alert for a malformed token', async () => {
    renderPanel();
    await settle();

    type('abc');
    const err = await screen.findByTestId('dec-error');
    expect(err.closest('[role="alert"]')).toHaveTextContent(t('dec.err.notJwt.title'));
    expect(screen.getByTestId('dec-input')).toHaveAttribute('aria-invalid', 'true');
  });

  it('decodes base64 and swaps result into input via "Use as input"', async () => {
    renderPanel();
    await settle();
    openTab('base64');

    type('Zm9vYmFy');
    await waitFor(() => {
      expect(screen.getByTestId('dec-output')).toHaveTextContent('foobar');
    });

    fireEvent.click(screen.getByRole('button', { name: t('dec.useAsInput') }));
    expect(screen.getByTestId<HTMLTextAreaElement>('dec-input').value).toBe('foobar');
    // Режим переключился на «Кодировать»: результат — снова исходный base64.
    await waitFor(() => {
      expect(screen.getByTestId('dec-output')).toHaveTextContent('Zm9vYmFy');
    });
  });

  it('shows JSON error with line, column and offset', async () => {
    renderPanel();
    await settle();
    openTab('json');

    type('[1,2,]');
    const err = await screen.findByTestId('dec-error');
    expect(err.closest('[role="alert"]')).toHaveTextContent(t('dec.err.json.title'));
    expect(err).toHaveTextContent('столбец 6');
    expect(err).toHaveTextContent('offset 5');
  });

  it('reports a broken URL escape position', async () => {
    renderPanel();
    await settle();
    openTab('url');

    type('a%zz');
    const err = await screen.findByTestId('dec-error');
    expect(err.closest('[role="alert"]')).toHaveTextContent(t('dec.err.url.title'));
    expect(err).toHaveTextContent('2');
  });

  it('copies the output and shows a success toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderPanel();
    await settle();
    openTab('base64');

    type('Zm9vYmFy');
    await waitFor(() => {
      expect(screen.getByTestId('dec-output')).toHaveTextContent('foobar');
    });

    fireEvent.click(screen.getByRole('button', { name: t('dec.copy') }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('foobar');
    });
    expect(await screen.findByText(t('toast.copied'))).toBeInTheDocument();
  });
});
