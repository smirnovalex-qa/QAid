/**
 * Типы фичи «Профили сессий» (session-profiles, TASK-047).
 *
 * Инструмент QA сохраняет именованные «профили сессии» в разрезе сайта и позволяет
 * горячо переключать состояние авторизации (cookies + localStorage + sessionStorage).
 * Local-first, zero-knowledge, без облака — всё живёт в локальном слое расширения.
 *
 * Этот модуль — только сериализуемые доменные типы (без zod: схемы живут в `logic.ts`,
 * чтобы `types.ts` оставался чисто декларативным). Снимок состояния домена
 * переиспользуется из TASK-017 (`@/shared/inspection/storage/types`) — мы НЕ дублируем
 * слой снимков, а строим профили поверх него.
 */
import type { CookieRecord, StorageSnapshot } from '@/shared/inspection/storage/types';
import type { EncryptedRecord } from '@/shared/crypto/vault';

/**
 * Область действия профиля — что именно он адресует.
 *
 * Web storage (local/session) привязан к origin (схема+хост+порт), т.к. браузер
 * изолирует хранилище по origin. Cookies же адресуются доменом (без учёта порта и,
 * как правило, схемы), поэтому храним отдельно `cookieDomain` — «голый» хост без
 * ведущей точки (`example.com`, не `.example.com`). Разделение важно: два origin на
 * одном хосте (http/https или разные порты) делят cookies, но не web storage.
 */
export interface SessionScope {
  /** Origin (`https://example.com:443` → `https://example.com`) — область web storage. */
  readonly origin: string;
  /** «Голый» хост без ведущей точки — область cookies. */
  readonly cookieDomain: string;
}

/**
 * Сохранённый профиль сессии: именованный снимок состояния авторизации для сайта.
 * `createdAt`/`updatedAt` — epoch ms, инжектятся снаружи (чистые билдеры не зовут
 * `Date.now()`). `snapshot` переиспользует форму TASK-017.
 */
export interface SessionProfile {
  readonly id: string;
  readonly name: string;
  readonly scope: SessionScope;
  readonly snapshot: StorageSnapshot;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Профиль с ЗАШИФРОВАННЫМ снимком (at-rest, TASK-050).
 *
 * Метаданные (`name`/`scope`/`createdAt`/`updatedAt`) остаются ОТКРЫТЫМИ — чтобы
 * список профилей рендерился и группировался по сайту даже в «залоченном» сейфе, а
 * расшифровка требовалась лишь для hot-swap/показа значений. Секрет (JSON снимка
 * `StorageSnapshot`) лежит в `enc` — конверт AES-GCM со своим IV под ключом сейфа.
 * Компрометация одной записи не роняет остальные (у каждой свой IV).
 */
export interface EncryptedProfile {
  readonly id: string;
  readonly name: string;
  readonly scope: SessionScope;
  /** Зашифрованный JSON `StorageSnapshot` (IV+ciphertext в конверте записи). */
  readonly enc: EncryptedRecord;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Персистентная форма профиля: ОТКРЫТЫЙ снимок (local-trust, дефолт) ЛИБО
 * зашифрованный конверт (сейф включён). Дискриминатор — наличие поля `snapshot`
 * против `enc` (см. `isEncryptedProfile` в `logic.ts`). Дефолт схемы — открытая
 * форма: уже сохранённые профили TASK-047 читаются без пароля (обратная совместимость).
 */
export type PersistedProfile = SessionProfile | EncryptedProfile;

/**
 * Состояние сейфа профилей:
 *  - `disabled` — шифрование выключено (local-trust, профили открыты);
 *  - `locked` — шифрование включено, ключа в памяти нет (нужен unlock);
 *  - `unlocked` — ключ в памяти, секреты доступны для hot-swap/показа.
 */
export type VaultStatus = 'disabled' | 'locked' | 'unlocked';

/**
 * Режим горячей замены состояния.
 *
 * - `replace` (по умолчанию) — вычищает «чужие» записи, которых нет в целевом
 *   профиле, прежде чем применить целевые. Защищает от смешанных сессий (остатки
 *   предыдущего пользователя не должны протекать в новую сессию).
 * - `apply` — только пишет записи целевого профиля, ничего не удаляя (аддитивно).
 */
export type SwapMode = 'replace' | 'apply';

/** Одна cookie к записи в ходе замены. */
export interface SwapCookieOp {
  readonly cookie: CookieRecord;
}

/** Адрес cookie к удалению (имя+домен+путь однозначно её адресуют). */
export interface SwapCookieRemoval {
  readonly name: string;
  readonly domain: string;
  readonly path: string;
}

/** Одна запись web storage к записи (пара строк). */
export interface SwapEntryOp {
  readonly key: string;
  readonly value: string;
}

/** План изменений одной области web storage: что записать и какие ключи удалить. */
export interface SwapAreaPlan {
  readonly sets: readonly SwapEntryOp[];
  /** Ключи к удалению (только в режиме `replace`). */
  readonly removes: readonly string[];
}

/**
 * Конкретный план операций для оркестратора (background/content его исполняют).
 * Чистая логика лишь ВЫЧИСЛЯЕТ план — сама ничего не пишет в браузер.
 */
export interface SwapPlan {
  /** Cookies к записи (всегда все cookies целевого профиля). */
  readonly cookieSets: readonly CookieRecord[];
  /** Cookies к удалению (только `replace`): есть сейчас, но нет в целевом. */
  readonly cookieRemoves: readonly SwapCookieRemoval[];
  readonly local: SwapAreaPlan;
  readonly session: SwapAreaPlan;
  /** Прогноз объёма операций для предпросмотра в UI. */
  readonly predicted: {
    readonly applied: number;
    readonly removed: number;
  };
}

/**
 * Персистентное состояние фичи (через слой настроек): какой профиль активен для
 * каждого origin. Ключ — origin, значение — id профиля.
 */
export interface SessionProfilesSettingsState {
  readonly activeByOrigin: Readonly<Record<string, string>>;
}

/** Дефолт: активных профилей нет. */
export const SESSION_PROFILES_SETTINGS_DEFAULTS: SessionProfilesSettingsState = {
  activeByOrigin: {},
};

/**
 * Совместимость области профиля с текущей областью вкладки. `reason` заполняется
 * только при `compatible === false` (см. `scopeCompatibility` о precedence).
 */
export interface ScopeCompatibility {
  readonly compatible: boolean;
  readonly reason?: 'origin-mismatch' | 'domain-mismatch';
}
