// Русские строки фичи «Формы: автозаполнение + аудит» (TASK-020).
const ru: Record<string, string> = {
  'feature.forms.title': 'Формы',
  'feature.forms.desc':
    'Заполняет формы активной вкладки правдоподобными тест-данными (с событиями фреймворков) и проводит аудит доступности/корректности. Клик по проблеме — переход к полю.',

  'forms.instructions':
    'Выберите профиль и «Заполнить»/«Очистить» активную вкладку. «Аудит» выводит проблемы доступности/корректности — клик по строке подсвечивает поле.',

  'forms.profile': 'Профиль',
  'forms.profile.valid': 'Корректные',
  'forms.profile.boundary': 'Максимальная длина',
  'forms.profile.empty': 'Пустые и пробелы',
  'forms.profile.injection': 'Инъекции',
  'forms.profile.injectionHint':
    'XSS/SQL тест-строки — тест-данные для проверки экранирования на собственных стендах, не средство атаки. Формы не отправляются автоматически.',

  // v3-редизайн — карточки типа данных, строка сайта, заполнение + проверка
  'forms.currentTab': '· текущая вкладка',
  'forms.dataType': 'Какими данными заполнить',
  'forms.profileHelp.valid': 'Реалистичные имена, почта, телефоны',
  'forms.profileHelp.boundary': 'Заполняет поля до предела',
  'forms.profileHelp.empty': 'Проверка ошибок обязательных полей',
  'forms.profileHelp.injection': 'Проверка экранирования. Только на своих стендах',
  'forms.fillOnPage': 'Заполнить формы на странице',
  'forms.filling': 'Заполняю…',
  'forms.noSubmit': 'Форма не отправляется — нажмите «Отправить» сами.',
  'forms.checkTitle': 'Проверить формы',
  'forms.check': 'Проверить',
  'forms.checkAgain': 'Ещё раз',
  'forms.show': 'Показать',
  'forms.auditHelp':
    'Найдёт поля без подписей, без «required», повторные id и неверные типы полей.',

  'forms.fill': 'Заполнить',
  'forms.clear': 'Очистить',
  'forms.audit': 'Аудит',
  'forms.cancel': 'Отмена',

  'forms.filled': 'Заполнено полей: {count}',
  'forms.cleared': 'Очищено полей: {count}',

  'forms.auditSummary': 'Полей {fields} · форм {forms} · проблем {issues}',
  'forms.auditCounts': 'Ошибок {error}, предупреждений {warning}',
  'forms.noIssues': 'Проблем не найдено.',
  'forms.issues': 'Проблемы аудита',
  'forms.highlightHint': 'Подсветить поле на странице',
  'forms.notFound': 'Поле уже отсутствует на странице.',

  'forms.audit.labelMissing': 'У поля нет доступного ярлыка',
  'forms.audit.requiredMissing': 'Похоже на обязательное, но без required/aria-required',
  'forms.audit.duplicateId': 'Дублирующийся id на странице',
  'forms.audit.typeMismatch': 'Тип input не совпадает с распознанным видом поля',

  'forms.severity.error': 'Ошибка',
  'forms.severity.warning': 'Предупреждение',
  'forms.severity.info': 'Инфо',

  'forms.export': 'Экспорт',
  'forms.export.plain': 'Текст',
  'forms.export.json': 'JSON',
  'forms.export.csv': 'CSV',

  'forms.error.permissionDenied':
    'Доступ к страницам отклонён. Выдайте его, чтобы заполнять/аудировать вкладки.',
  'forms.error.noTab': 'Не удалось определить активную вкладку.',
  'forms.error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',
};

export default ru;
