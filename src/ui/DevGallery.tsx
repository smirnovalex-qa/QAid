/**
 * Демо-витрина компонентов (dev-only, маршрут `#/__components`). Рендерит все
 * компоненты во всех вариантах для визуальной проверки контраста в обеих темах
 * и как основа a11y-проверки (vitest-axe). НЕ выставляется пользователю как фича.
 */
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  Button,
  Card,
  Field,
  IconButton,
  Input,
  SegmentedControl,
  Select,
  Tabs,
  useToast,
} from '@/ui/components';
import type { ToastSeverity } from '@/ui/components';
import { setThemeMode } from '@/ui/theme';
import { copyText } from '@/ui/clipboard';
import { t } from '@/i18n';
import styles from './DevGallery.module.css';

const VARIANTS = ['primary', 'secondary', 'ghost', 'danger'] as const;
const GALLERY_TABS = [
  { id: 'one', label: 'Первая' },
  { id: 'two', label: 'Вторая' },
  { id: 'three', label: 'Третья' },
];

export function DevGallery(): JSX.Element {
  const { show } = useToast();
  const [tab, setTab] = useState('one');
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(true);
  const [seg, setSeg] = useState('decode');

  const toast = (severity: ToastSeverity): void => {
    show(`Toast: ${severity}`, { severity });
  };

  return (
    <div class={styles.gallery}>
      <header class={styles.head}>
        <h1>DevGallery</h1>
        <div class={styles.themeSwitch}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setThemeMode('light');
            }}
          >
            {t('theme.light')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setThemeMode('dark');
            }}
          >
            {t('theme.dark')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setThemeMode('system');
            }}
          >
            {t('theme.system')}
          </Button>
        </div>
      </header>

      <Card title="Buttons">
        <div class={styles.row}>
          {VARIANTS.map((v) => (
            <Button key={v} variant={v}>
              {v}
            </Button>
          ))}
        </div>
        <div class={styles.row}>
          {VARIANTS.map((v) => (
            <Button key={`sm-${v}`} variant={v} size="sm">
              {v} sm
            </Button>
          ))}
        </div>
        <div class={styles.row}>
          <Button loading>loading</Button>
          <Button disabled>disabled</Button>
          <IconButton label="Действие">★</IconButton>
        </div>
      </Card>

      <Card title="Form controls">
        <Field label="Текстовое поле" hint="Подсказка под полем">
          {(control) => (
            <Input
              {...control}
              value={text}
              placeholder="Введите значение"
              onInput={(e) => {
                setText(e.currentTarget.value);
              }}
            />
          )}
        </Field>
        <Field label="Поле с ошибкой" error={invalid ? 'Обязательное поле' : ''}>
          {(control) => (
            <Input
              {...control}
              value=""
              onInput={() => {
                setInvalid(false);
              }}
            />
          )}
        </Field>
        <Field label="Выбор">
          {(control) => (
            <Select
              {...control}
              options={[
                { value: 'a', label: 'Вариант A' },
                { value: 'b', label: 'Вариант B' },
              ]}
            />
          )}
        </Field>
      </Card>

      <Card title="Segmented control">
        <div class={styles.row}>
          <SegmentedControl
            label="Режим"
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'decode', label: 'Decode' },
              { value: 'encode', label: 'Encode' },
            ]}
          />
        </div>
      </Card>

      <Card title="Tabs">
        <Tabs tabs={GALLERY_TABS} activeId={tab} onChange={setTab}>
          <p>Активная панель: {tab}</p>
        </Tabs>
      </Card>

      <Card title="Toast / copy">
        <div class={styles.row}>
          <Button
            onClick={() => {
              void copyText('пример').then((okFlag) => {
                show(okFlag ? t('toast.copied') : 'Ошибка копирования', {
                  severity: okFlag ? 'success' : 'danger',
                });
              });
            }}
          >
            {t('action.copy')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              toast('info');
            }}
          >
            info
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              toast('danger');
            }}
          >
            danger
          </Button>
        </div>
      </Card>
    </div>
  );
}
