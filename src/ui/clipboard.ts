/**
 * Копирование в буфер обмена с фолбэком. Возвращает `true` при успехе.
 * Общий UX-паттерн (PRD §10): результат копируется в один клик, показывается
 * тост «Скопировано» (см. useToast / DevGallery).
 */
export async function copyText(text: string): Promise<boolean> {
  // Пробуем Async Clipboard API только если Permissions Policy документа его
  // разрешает (см. `asyncClipboardAllowed`). Иначе — сразу legacy: вызов в
  // запрещённом контексте не только бросает, но и печатает в консоль
  // permissions-policy violation, который try/catch НЕ гасит.
  if (asyncClipboardAllowed()) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Политика разрешает, но вызов всё равно упал (нет жеста, insecure context,
      // временная ошибка) — тихо уходим в legacy ниже.
    }
  }
  return legacyCopy(text);
}

/** Интроспектор Permissions Policy документа (`allowsFeature`). */
interface PolicyIntrospector {
  allowsFeature(feature: string): boolean;
}

/**
 * Разрешает ли Permissions Policy текущего документа `clipboard-write`. Главный
 * случай запрета — cross-origin iframe без `allow="clipboard-write"` (напр. тело
 * плавающей панели, `chrome-extension://` внутри страницы) или страница с жёстким
 * заголовком `Permissions-Policy`. В таком контексте Async Clipboard API не просто
 * бросает — браузер печатает violation в консоль на месте вызова, и try/catch его
 * не подавляет. Поэтому проверяем политику заранее и при запрете не трогаем API.
 *
 * Стандартный `document.permissionsPolicy` ещё не в стабильном Chrome — рабочий
 * интроспектор это (нестандартный, но поддерживаемый Chrome) `document.featurePolicy`.
 * Если интроспекция недоступна — оптимистично разрешаем: страховкой служит try/catch
 * в `copyText`, а на поддерживаемых поверхностях (side panel/popup) политика разрешает.
 */
function asyncClipboardAllowed(): boolean {
  const doc = document as {
    permissionsPolicy?: PolicyIntrospector;
    featurePolicy?: PolicyIntrospector;
  };
  const policy = doc.permissionsPolicy ?? doc.featurePolicy;
  return policy?.allowsFeature('clipboard-write') ?? true;
}

function legacyCopy(text: string): boolean {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    // Легаси-фолбэк для сред без Async Clipboard API; deprecated, но всё ещё нужен.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const okFlag = document.execCommand('copy');
    document.body.removeChild(area);
    return okFlag;
  } catch {
    return false;
  }
}
