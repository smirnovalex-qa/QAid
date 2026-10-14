# QAid — тексты для Chrome Web Store (готовы к вставке)

Собранный пакет для загрузки: **`dist-zip/qaid-0.1.0.zip`** (≈555 КБ, `manifest.json` в корне, без source maps).

Ниже — все поля листинга с готовым текстом. Store-листинг даю на **английском** (основной,
т.к. README и аудитория международные) и **русском** (локаль `default_locale: ru`). В Dev
Console можно задать оба языка листинга — English и Russian — одинаковой структурой.

---

## 1. Store listing (вкладка «Store listing»)

### Item name (до 45 символов)
```
QAid — QA toolbox side panel
```

### Summary / short description (до 132 символов)

**EN**
```
20 QA & web-debugging tools in one Chrome side panel — bug reports, inspectors, mocking, generators, decoders. Local & private.
```

**RU**
```
20 QA-инструментов в боковой панели: баг-репорты, инспекторы, мок сети, генераторы, декодеры. Локально и приватно.
```

### Category
```
Developer Tools
```

### Language
```
English (primary) + Russian
```

### Detailed description — EN (поле Description, Markdown не поддерживается, обычный текст)

```
QAid puts 20 everyday QA and web-debugging tools into one searchable Chrome side panel — so you stop juggling a drawer of single-purpose extensions and random online JWT/UUID sites.

Built for QA engineers, testers and web developers.

WHAT'S INSIDE
• Capture & report — reproduce a bug and QAid collects steps, console errors, network and a screenshot into a local Markdown + JSON artifact you can hand straight to a developer. Screen recording (WebM/GIF) included.
• Inspect the page — element inspector, box model, fonts, color palette, contrast checker and a measuring ruler.
• Network & mocks — intercept and mock fetch/XHR, replay requests, throttle, and override response bodies and status codes.
• Browser data — view and edit localStorage, sessionStorage, IndexedDB and cookies (including HttpOnly) for the active domain; snapshot and diff state.
• Forms & environment — fill forms with valid, max-length, empty or injection test data; override user agent, language, geolocation and time zone per tab.
• Data & generators — decode JWT, Base64, URL and JSON; generate random strings, numbers, timestamps and hashes.
• Session profiles — capture a logged-in session and hot-swap between accounts, with optional master-password encryption.

PRIVATE BY DESIGN
QAid's core makes no network calls and sends no data anywhere. Bug states, tokens, cookies and page data stay on your computer. No account, no sign-up, no telemetry.

LEAST-PRIVILEGE PERMISSIONS
Only essential permissions are granted at install. Access to page content, scripting, cookies and screen capture is requested at runtime, under an explicit user gesture, and only for the tool you're using. Deny it and the rest of the extension keeps working.

OPEN SOURCE
Free and open source under Apache-2.0.

UI available in English and Russian. Works in Chromium-based browsers with Manifest V3 and the Side Panel API.
```

### Detailed description — RU

```
QAid собирает 20 повседневных QA- и web-debug-инструментов в одну боковую панель Chrome с поиском — чтобы не держать десяток однокнопочных расширений и не ходить на случайные онлайн-сайты для JWT/UUID.

Сделано для QA-инженеров, тестировщиков и веб-разработчиков.

ЧТО ВНУТРИ
• Съёмка и репорт — воспроизведите баг, а QAid соберёт шаги, ошибки консоли, сеть и скриншот в локальный артефакт Markdown + JSON, который можно сразу отдать разработчику. Есть запись экрана (WebM/GIF).
• Инспекция страницы — инспектор элементов, box model, шрифты, палитра цветов, проверка контраста и линейка.
• Сеть и моки — перехват и мок fetch/XHR, повтор запросов, троттлинг, подмена тел ответов и кодов статуса.
• Данные браузера — просмотр и правка localStorage, sessionStorage, IndexedDB и cookies (включая HttpOnly) активного домена; снимок состояния и сравнение.
• Формы и окружение — заполнение форм валидными, предельными, пустыми или инъекционными данными; подмена user agent, языка, геолокации и часового пояса на вкладку.
• Данные и генераторы — декодеры JWT, Base64, URL и JSON; генераторы строк, чисел, timestamp'ов и хешей.
• Профили сессий — захват залогиненной сессии и быстрый свитч между аккаунтами, с опциональным шифрованием мастер-паролем.

ПРИВАТНОСТЬ ПО УМОЛЧАНИЮ
Ядро QAid не делает сетевых вызовов и никуда не отправляет данные. Состояния багов, токены, cookies и данные страницы остаются на вашем компьютере. Без аккаунта, без регистрации, без телеметрии.

ПРАВА ПО ПРИНЦИПУ LEAST-PRIVILEGE
При установке выдаются только необходимые права. Доступ к содержимому страниц, scripting, cookies и захвату экрана запрашивается в рантайме — по явному жесту пользователя и только для того инструмента, которым вы пользуетесь. Откажете — остальное расширение продолжит работать.

ОТКРЫТЫЙ КОД
Бесплатно и open source под Apache-2.0.

Интерфейс на английском и русском. Работает в Chromium-браузерах с Manifest V3 и Side Panel API.
```

### Графика (подготовить отдельно — файлами PNG/JPEG)
| Ассет | Размер | Обязательность | Что использовать |
|---|---|---|---|
| Store icon | 128×128 PNG | обязательно | `src/assets/icons/icon-128.png` |
| Screenshot(s) | 1280×800 или 640×400 PNG/JPEG | минимум 1, лучше 4–5 | кадры из `docs/assets/*.png` (overview, bug-report, forms, decode, device) — пересохранить в точный размер |
| Small promo tile | 440×280 PNG/JPEG | опционально | можно собрать из `docs/assets/hero.png` |
| Marquee promo | 1400×560 | опционально | не обязательно для публикации |

> Скриншоты в `docs/assets/` нужно привести к точному размеру холста (1280×800), иначе Dev Console их отклонит. Это единственный ручной шаг графики.

---

## 2. Privacy practices (вкладка «Privacy») — обоснования прав

В Dev Console на каждое право нужно текстовое обоснование. Готовые формулировки (EN — стор принимает англ.):

### Single purpose (единое назначение)
```
QAid is a single side-panel toolbox of QA and web-debugging utilities (bug capture, page inspection, network mocking, browser-data editing, locale emulation, and encoders/decoders) that run locally in the browser.
```

### Обоснования разрешений

**storage**
```
Stores the user's tool presets, settings and local snapshots via chrome.storage. No data leaves the device.
```

**sidePanel**
```
The entire toolbox UI runs in the Chrome side panel so inspectors stay open while the user works on the page.
```

**declarativeNetRequestWithHostAccess**
```
Used by the environment-emulation tool to rewrite request headers (User-Agent, Accept-Language) via session rules scoped to the current tab. Rules apply only to origins the user has already granted host access to; the grant alone exposes nothing. It is declared at install because Chrome forbids declarativeNetRequest permissions in optional_permissions.
```

**debugger**
```
Optional CDP capture mode of the network-mocking tool (chrome.debugger + Fetch domain) to intercept requests that bypass page-level wrappers (workers, sendBeacon, strict CSP). It attaches only when the user explicitly enables CDP mode by a gesture; the default mode never uses it. Declared at install because Chrome forbids the debugger permission in optional_permissions.
```

**offscreen**
```
Hosts MediaRecorder for the screen-recording tool (MediaRecorder is unavailable in the service worker). An offscreen document is created on demand when recording starts and closed when it stops. Video is captured only through the native getDisplayMedia picker (explicit user choice).
```

**scripting (optional)**
```
Injects the inspection content host into the active tab on demand when the user starts the element inspector or network mock. Requested at runtime under a user gesture, not at install.
```

**cookies (optional)**
```
Lets the storage editor read, edit and delete cookies for the active domain, including HttpOnly cookies that are invisible to page JavaScript. Requested at runtime when the user opens the cookies tab.
```

**Host permissions — `*://*/*` and `<all_urls>` (optional)**
```
Host access to http/https pages is required for the inspector, cookie editor, environment emulation and network mocking to read and operate on the page the user is testing. The <all_urls> token is additionally required by chrome.tabs.captureVisibleTab for screenshots (Chrome accepts only that literal token). Both are optional and requested at runtime under a user gesture; the extension never requests them at install.
```

### Data usage disclosures (чекбоксы «What user data do you collect?»)
```
НЕ отмечать ни одной категории сбора данных.
Отметить подтверждения:
✓ I do not sell or transfer user data to third parties, outside of the approved use cases
✓ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
✓ I do not use or transfer user data to determine creditworthiness or for lending purposes
```

### Remote code
```
Ответ: No, I am not using remote code. Весь код расширения — в пакете; удалённого/eval-кода нет.
```

### Privacy policy URL — ОБЯЗАТЕЛЬНО
Chrome требует ссылку на политику приватности, т.к. запрашиваются host-доступ, cookies и
захват экрана. Нужен публичный URL (GitHub Pages / сайт). Готовый текст политики — в
`docs/PRIVACY_POLICY.md` (создан рядом). Опубликуйте его и вставьте URL в это поле.

---

## 3. Distribution (вкладка «Distribution»)

| Поле | Значение |
|---|---|
| Visibility | Public (или Unlisted, если сначала хотите протестировать по ссылке) |
| Regions | All regions |
| Pricing | Free |
| Mature content | No |

---

## 4. Порядок действий в Dev Console
1. **New Item** → загрузить `dist-zip/qaid-0.1.0.zip`.
2. **Store listing** — вставить name / summary / description, залить иконку 128×128 и 1–5 скриншотов 1280×800.
3. **Privacy practices** — вставить single purpose и обоснования прав выше, отметить data-usage чекбоксы, ответить про remote code, вставить Privacy policy URL.
4. **Distribution** — Public, All regions, Free.
5. **Submit for review**.

> Что осталось сделать руками (их нельзя сгенерировать из кода): завести аккаунт
> разработчика ($5), привести скриншоты к точному размеру, опубликовать Privacy Policy
> и получить её URL, затем Submit.
