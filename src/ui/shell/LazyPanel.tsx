/**
 * Обёртка ленивого тела фичи (F1 TASK-046, ADR-0047).
 *
 * Метаданные фич регистрируются жадно (реестр), а тело (`ui.tsx` + его логика и
 * зависимости) грузится динамическим `import()` через `feature.load` при первой
 * активации в оболочке. Здесь — контролируемые загрузочные состояния (тех. требование
 * §5 задачи):
 *  - короткий fallback-спиннер без сдвига layout, пока чанк грузится;
 *  - мягкая деградация при сбое динамического импорта (сообщение + «Повторить»), а не
 *    белый экран;
 *  - модуль-кэш резолвленных тел: повторное открытие фичи — мгновенное, без повторного
 *    сетевого/дискового чтения чанка.
 *
 * Кэш живёт на уровне модуля (в рамках одного документа popup/sidepanel), т.к. тело
 * фичи иммутабельно после загрузки. Ключ — `featureId`.
 */
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { FeatureComponent, FeatureLoader } from '@/features/registry';
import { logger } from '@/shared/logger';
import { t } from '@/i18n';
import { Button } from '@/ui/components';
import styles from './surface.module.css';

/** Кэш резолвленных тел фич по `featureId` (иммутабельны после загрузки). */
const bodyCache = new Map<string, FeatureComponent>();

export interface LazyPanelProps {
  /** id фичи — ключ кэша и признак смены активной фичи. */
  featureId: string;
  /** Ленивый загрузчик тела (`feature.load`). */
  load: FeatureLoader;
  /** Под-вкладка мультивкладочной фичи (проксируется в тело). */
  subtab?: string | undefined;
}

export function LazyPanel(props: LazyPanelProps): JSX.Element {
  const { featureId, load, subtab } = props;
  // Ленивый инициализатор: если тело уже в кэше — показываем без «мигания» спиннера.
  const [Comp, setComp] = useState<FeatureComponent | undefined>(() => bodyCache.get(featureId));
  const [failed, setFailed] = useState(false);
  // Инкремент для ручного повтора после сбоя импорта.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const cached = bodyCache.get(featureId);
    if (cached) {
      // setState(fn) трактует функцию как updater — тело само функция, поэтому кладём
      // его через `() => cached` (иначе Preact вызвал бы компонент как updater).
      setComp(() => cached);
      setFailed(false);
      return;
    }
    let alive = true;
    setComp(undefined);
    setFailed(false);
    load()
      .then((Loaded) => {
        bodyCache.set(featureId, Loaded);
        if (alive) setComp(() => Loaded);
      })
      .catch((error: unknown) => {
        logger.error('lazy feature load failed', featureId, error);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [featureId, attempt, load]);

  if (failed) {
    return (
      <div class={styles.lazyError} role="alert">
        <p class={styles.fallbackText}>{t('shell.loadError')}</p>
        <Button
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          {t('shell.retry')}
        </Button>
      </div>
    );
  }

  if (!Comp) {
    return (
      <div class={styles.lazyLoading} role="status" aria-live="polite" aria-busy="true">
        <span class={styles.lazySpinner} aria-hidden="true" />
        <span class={styles.srOnly}>{t('shell.loading')}</span>
      </div>
    );
  }

  return <Comp subtab={subtab} />;
}
