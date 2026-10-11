/**
 * e2e опционального at-rest-шифрования профилей сессий (TASK-050) поверх собранного
 * MV3-расширения.
 *
 * Почему этот поток безопасно гонять в headless CI (в отличие от hot-swap):
 * сейф — чисто ЛОКАЛЬНАЯ трансформация хранилища (`chrome.storage.local` + WebCrypto).
 * Он НЕ требует грантов host/cookies/scripting и не поднимает нативных модальных
 * диалогов, поэтому весь жизненный цикл (включить → заблокировать → неверный пароль →
 * верный пароль) проверяется без единого гранта и без страницы-фикстуры.
 *
 * Что проверяется:
 *  1. Тумблер «Защитить мастер-паролем» с паролем+подтверждением включает шифрование
 *     → статус становится «разблокировано».
 *  2. «Заблокировать» убирает ключ из памяти → появляется экран разблокировки.
 *  3. Неверный пароль отклоняется (verifier-canary) и сейф остаётся заблокированным.
 *  4. Верный пароль снова разблокирует сейф.
 */
import { test, expect, openTool } from './fixtures/extension';

const PW = 'correct horse battery staple';

test('жизненный цикл сейфа: включить → lock → неверный → верный пароль', async ({
  openSidePanel,
}) => {
  const panel = await openSidePanel();
  // Активируем фичу кликом по кнопке рельса (aria-label = заголовок фичи).
  await openTool(panel, 'session-profiles');

  // 1. Включаем защиту мастер-паролем (тумблер «Защитить паролем» открывает форму).
  await panel.getByRole('switch', { name: /Защитить паролем|Protect with a password/ }).click();
  await panel
    .getByTestId('sp-vault-enable-form')
    .getByLabel(/Мастер-пароль|Master password/)
    .fill(PW);
  await panel.getByLabel(/Подтверждение пароля|Confirm password/).fill(PW);
  // Включение необратимо (zero-recovery) — подтверждаем понимание, иначе кнопка заблокирована.
  await panel.getByTestId('sp-vault-understand').check();
  await panel.getByTestId('sp-vault-enable-submit').click();

  // Сейф разблокирован (ключ в памяти): доступна кнопка «Заблокировать».
  await expect(panel.getByTestId('sp-vault-lock')).toBeVisible({ timeout: 15000 });

  // 2. Блокируем — ключ из памяти уходит, появляется экран разблокировки.
  await panel.getByTestId('sp-vault-lock').click();
  await expect(panel.getByTestId('sp-unlock-form')).toBeVisible();

  // 3. Неверный пароль → ошибка, сейф остаётся заблокированным.
  await panel.getByTestId('sp-unlock-input').fill('definitely-wrong');
  await panel.getByTestId('sp-unlock-submit').click();
  await expect(panel.getByTestId('sp-unlock-error')).toHaveText(/Неверный пароль|Wrong password/);
  await expect(panel.getByTestId('sp-unlock-form')).toBeVisible();

  // 4. Верный пароль → снова разблокировано (кнопка «Заблокировать» вернулась).
  await panel.getByTestId('sp-unlock-input').fill(PW);
  await panel.getByTestId('sp-unlock-submit').click();
  await expect(panel.getByTestId('sp-vault-lock')).toBeVisible({ timeout: 15000 });
});
