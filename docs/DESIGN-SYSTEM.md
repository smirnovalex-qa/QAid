# Дизайн-система — QAnvil

Токены, темы и базовые компоненты UI. Реализовано в TASK-004. Цель — консистентный, доступный UX с нулевой обязательной настройкой (PRD §6, §10).

---

## 1. Принципы

- **Только семантические токены в компонентах.** Компоненты ссылаются на роли (`--bg`, `--fg`, `--accent`, …), а не на примитивы (`--c-blue-600`). Смена темы = переопределение семантического слоя, компоненты не трогаются.
- **Доступность не опциональна.** Видимый `:focus-visible`, ARIA-роли, клавиатурная навигация, `prefers-reduced-motion`, контраст ≥ WCAG AA.
- **Малый бандл.** Preact + CSS Modules, без runtime-CSS-in-JS. Токены — нативные CSS custom properties.
- **Тема по умолчанию `system`.** Ручной выбор персистится; ноль обязательной настройки.

---

## 2. Токены (`src/ui/tokens.css`)

Двухслойная система на `:root`.

**Примитивы** — сырые значения: палитра (`--c-blue-600`, `--c-slate-900`, …), шкала отступов 4pt (`--space-1..8`), радиусы (`--radius-sm/md/lg`), типографика (`--font-sans/mono`, `--fs-1..5`, `--lh-*`), тени (`--shadow-1/2`), z-index (`--z-toast/modal`), движение (`--dur-fast/base`, `--ease`).

**Семантические роли** — то, чем пользуются компоненты:

| Токен | Роль |
|---|---|
| `--bg` / `--bg-subtle` | фон основной / приглушённый (карточки, поля) |
| `--fg` / `--fg-muted` | текст основной / вторичный |
| `--accent` / `--accent-fg` / `--accent-hover` | акцент (кнопки, индикаторы) и текст на нём |
| `--border` | границы |
| `--focus-ring` | фокус-кольцо |
| `--danger` / `--danger-fg` | ошибки/деструктив |
| `--success` | успех |
| `--overlay` | подложка модалок |

Тёмная тема (`:root[data-theme='dark']`) переопределяет **только семантический слой**. `prefers-reduced-motion: reduce` глобально гасит анимации/переходы.

Контраст ключевых пар (`--fg`/`--bg`, `--accent-fg`/`--accent`, `--fg-muted`/`--bg`) выверен под AA в обеих темах — это же требование к продукту (инспектор WCAG, PRD §7.2).

---

## 3. Темы (`src/ui/theme.ts`)

- `themeMode` — сигнал (`@preact/signals`) со значениями `'light' | 'dark' | 'system'`.
- `resolvedTheme()` — эффективная тема: для `system` читает `matchMedia('(prefers-color-scheme: dark)')`.
- `initTheme()` — восстанавливает режим из хранилища, применяет `<html data-theme>`, персистит при изменении, реагирует на смену системной темы на лету (в режиме `system`).
- `setThemeMode(mode)` / `cycleThemeMode()` — установка и циклическое переключение (кнопка в хедере).

Персист сейчас — тонкий `storageLocal` (адаптер платформы над `chrome.storage.local`); TASK-005 переведёт на версионируемый storage-слой без изменения API темы.

`src/ui/global.css` импортирует `tokens.css` и задаёт базу (box-sizing, шрифт body, глобальный `:focus-visible`, `.qatb-visually-hidden`). Импортируется **один раз** в entry (popup/sidepanel), не в каждом модуле.

---

## 4. Компоненты (`src/ui/components/*`)

Каждый компонент — `Component.tsx` + `Component.module.css`; классы camelCase, склейка через `cn()` (`src/ui/cn.ts`). Импорт — через барель `src/ui/components/index.ts`.

| Компонент | Назначение | A11y-контракт |
|---|---|---|
| `Button` | варианты `primary/secondary/ghost/danger`, размеры `sm/md`, `loading` | при `loading` — `aria-busy` и `disabled`; фокус видимый |
| `IconButton` | иконочная кнопка | обязательный `label` → `aria-label`; область ≥ 32px |
| `Input` | текстовое поле | принимает/прокидывает `aria-invalid`, `aria-describedby` |
| `Select` | нативный `<select>` в стилизованной обёртке | доступность из коробки |
| `Field` | label + control + hint/error | генерирует `id`, связывает `<label for>`, прокидывает `aria-invalid`/`aria-describedby` в control (render-prop) |
| `Tabs` | вкладки-категории | `role=tablist/tab/tabpanel`, `aria-selected`, roving `tabindex`, стрелки `←/→` с зацикливанием |
| `Card` | контейнер | при `title` — регион (`<section aria-label>` + заголовок) |
| `Toast` + `ToastProvider` | уведомления | `role="status"`, `aria-live="polite"` (для ошибок — `assertive`); автоскрытие, стек; хук `useToast()` |

**Копирование** — `src/ui/clipboard.ts` `copyText()` (Async Clipboard API + legacy-фолбэк), показывает Toast «Скопировано» — общий UX-паттерн (PRD §10).

### Гайд по использованию

```tsx
import { Button, Field, Input, Tabs, useToast } from '@/ui/components';

// Поле с валидацией:
<Field label="Токен" error={err}>
  {(control) => <Input {...control} value={v} onInput={onInput} />}
</Field>

// Кнопка с копированием:
const { show } = useToast();
<Button onClick={() => { void copyText(result).then(() => { show('Скопировано'); }); }}>
  Копировать
</Button>
```

---

## 5. Оболочка и витрина

- **`src/popup/AppShell.tsx`** — хедер (логотип + переключатель темы) и вкладки по `FeatureCategory`; наполнение из `getFeatures('popup')` (feature-registry, TASK-003). Пустая категория → заглушка. Фичи регистрируются сами (барель `@/features`).
- **`src/ui/DevGallery.tsx`** — витрина всех компонентов во всех вариантах с переключателем light/dark; **только для dev**, доступна по `#/__components` в popup. Основа визуальной и a11y-проверки.

---

## 6. i18n (`src/i18n`)

Лёгкий рантайм-каталог RU/EN с реактивной сменой языка (`locale` сигнал, `t(key, vars)`), фичи домешивают фрагменты через `mergeCatalog` (дескриптор `FeatureModule.i18n`, ADR-0011). `_locales/*` остаётся для манифеста (`default_locale`).

---

## 7. Тестирование a11y

`@testing-library/preact` + `@testing-library/jest-dom` (setup в `vitest.setup.ts`, там же моки `matchMedia` и `chrome.storage`). Юнит-тесты проверяют контракты доступности: связывание label/control в `Field`, стрелочную навигацию и `aria-selected` в `Tabs`, `aria-live` в `Toast`, `aria-busy` в `Button`. Витрина проверяется `vitest-axe` на отсутствие критических нарушений.
