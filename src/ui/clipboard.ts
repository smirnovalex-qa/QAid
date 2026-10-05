/**
 * Копирование в буфер обмена с фолбэком. Возвращает `true` при успехе.
 * Общий UX-паттерн (PRD §10): результат копируется в один клик, показывается
 * тост «Скопировано» (см. useToast / DevGallery).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    // Если Clipboard API недоступен/запрещён — вызов бросит, ловим и падаем в legacy.
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text);
  }
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
