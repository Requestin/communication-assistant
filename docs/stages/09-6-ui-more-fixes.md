# Этап 9.6. Правки UI после прокрутки

Связь с архитектурой:

- [ARCHITECTURE.md §14](../../ARCHITECTURE.md#14-пошаговый-план-реализации)
- [§3.1](../../ARCHITECTURE.md#31-сосуществование-с-mapvideo) — публичный nginx `assistant.gyhyry.com`, mapvideo не трогать
- [§10](../../ARCHITECTURE.md#10-экраны-и-почти-мгновенное-обновление) — шапка, почта, консоль
- [§10.2](../../ARCHITECTURE.md#102-inbox-менеджер-главный--с-query-manager) — фильтр менеджера, композер только у сотрудника
- [§17](../../ARCHITECTURE.md#17-контракты-http-минимум) — additive snapshot
- [DESIGN.md](../../DESIGN.md) — Onest + Golos Text; палитру не менять

Это **не** новый экран и не смена агентов. Фиксация живых правок на стенде **сразу после** [09-5-scrollbars.md](09-5-scrollbars.md). Скроллы сюда не копировать и не откатывать.

**Статус:** этап 9.5 влит в `main` (PR #18). Этот файл — чтобы следующий агент не повторял работу и не возвращал Unbounded / «Админку» / автопрыжок ленты.

Ветка: `stage/09-6-ui-more-fixes`  
База: `main` после этапа 9.5  
Зависимость: [09-5-scrollbars.md](09-5-scrollbars.md) (скроллы уже сделаны, человек смотрел)  
PR: `[stage 09.6] Правки UI после прокрутки`

Не трогать mapvideo. Не менять IMAP/SMTP, промпты агентов, формулы AVG, порты **3010 / 5433 / 8088**. Не править `mapvideo.gyhyry.com.conf`.

## Скиллы

- UI: `frontend-design` + `comm-ui` (сначала `DESIGN.md`; заголовки — **Onest**, не Unbounded)
- Смена `/api/inbox/snapshot`: `api-contract-checker` (только additive)
- Редиректы за nginx / cookie: `systematic-debugging`
- Перед PR: `testing-reviewer` + `code-reviewer`

## Цель простыми словами

После тёмных полос прокрутки человек правил то, что мешало на живом стенде: слова в шапке, шрифт заголовков, поле ответа, консоль, фильтр почты у главного и вход по https на домене.

**Готово когда (уже подтверждено человеком по кускам, подпись менеджера — «да, супер»):** в шапке «Консоль» / «Почта»; заголовки Onest; у главного нет поля ответа; фильтр менеджера не закрывает открытую ленту; сайт открывается как **https://assistant.gyhyry.com**.

## Что видел человек → что сделали

| Что просил / ломалось | Что сделали |
| --- | --- |
| Сайт наружу: `assistant.gyhyry.com`, SSL | Свой server-блок nginx → `127.0.0.1:3010`, сертификат Let's Encrypt. Чужой `mapvideo.gyhyry.com.conf` не трогали. |
| Редирект на `https://localhost:3010/login` и `ERR_SSL_PROTOCOL_ERROR` | Origin редиректов из `X-Forwarded-Host` / `X-Forwarded-Proto`; nginx `proxy_redirect` localhost→домен; cookie `Secure` только за HTTPS |
| Поле ответа слишком высокое, потом — пусть растёт | `textarea` min **64px**, max **224px**, высота по тексту, дальше внутренний скролл |
| У главного в почте блок ответа не нужен | Композер только при `role === "manager"` |
| `Runtime TypeError: Failed to fetch` на поллинге ленты | `fetchInboxSnapshot` ловит сеть, текст «Не удалось обновить ленту», без падения React |
| «Админка» / «Инбокс» | Везде в UI: **Консоль** / **Почта**. URL `/admin` и `/inbox` не менять |
| Заголовок «Помощник в коммуникации» мелкий | В шапке и `<title>`: **AI Помощник**, крупнее |
| Подзаголовок на консоли лишний | Остался один `h1` «Консоль» |
| Unbounded не нравится | Заголовки и имена: **Onest** (OFL, кириллица). Живого Unbounded нет |
| Имя в шапке | Плашка: `Имя · роль`, имя Onest |
| Шапка открытой ленты высокая | Компактная: имя+email в одну строку, тема второй, меньше padding |
| KPI «как таблица» | Цифры `text-3xl font-semibold`, без `tabular-nums` и без `font-heading` |
| Текст на переключателе масштаба мелкий, кнопки раздулись | Подписи `text-base`, высота кнопок как была (`h-[25px]`) |
| Графики низкие, разной высоты | Карточки `h-full`, плот графиков `min-h-52 flex-1` |
| У главного в почте все диалоги скопом | Select «Все» / менеджер слева от «Диалоги»; имя на карточке; полоску «Лента / Назад в консоль» убрали |
| Стрелка select системная | Своя шеврон-иконка (`.inbox-manager-select`) |
| «Диалоги» мелко | Заголовок списка `text-base` |
| Фильтр перескакивал на первый диалог другого менеджера | Главный сам кликает ленту; автовыбор первого — только у сотрудника |
| Не надо «Выберите диалог», открытое не закрывать | Список сужается, лента справа та же, даже чужого менеджера. В snapshot список и доступ к треду разделены |
| Имя в шапке ленты | По центру высоты блока, крупнее: **«Менеджер: Имя Фамилия»** |

## Правило (уже закрыто в архитектуре)

Сначала патч `ARCHITECTURE.md` / `DESIGN.md`, потом код. Повторно не переписывать §19.

- Слова **Консоль** / **Почта** — только подписи; пути прежние.
- Главный в почте **не** отвечает: блока textarea нет.
- Фильтр `?manager=` сужает **список**. Открытая лента живёт в `?conversation=`; snapshot отдаёт её письма, даже если её нет в отфильтрованном списке. Сотрудник по-прежнему не читает чужое (`accessManagerId`).
- Редиректы за nginx — на публичный origin, не на listen-хост `localhost:3010`.
- Заголовки — Onest. Unbounded не возвращать.

## Чеклист работ (всё сделано)

### Публичный адрес

- [x] [ARCHITECTURE.md §3.1](../../ARCHITECTURE.md#31-сосуществование-с-mapvideo): `https://assistant.gyhyry.com` → `127.0.0.1:3010`; не править конфиг mapvideo.
- [x] Шаблон [deploy/nginx/assistant.gyhyry.com.conf](../../deploy/nginx/assistant.gyhyry.com.conf); живая копия в `/etc/nginx/sites-available/`.
- [x] `publicOriginFromHeaders` + тесты. Middleware и login-редирект не уводят на `localhost`.
- [x] Cookie `Secure` по `X-Forwarded-Proto`. `allowedDevOrigins`: `assistant.gyhyry.com`.
- [x] `nginx -t` / reload только своего server-блока.

### Слова, шапка, шрифт

- [x] [DESIGN.md](../../DESIGN.md): Onest вместо Unbounded. `comm-ui` и `60-ui.mdc` тоже.
- [x] [src/app/layout.tsx](../../src/app/layout.tsx): `Onest`, title «AI Помощник».
- [x] Шапка: кнопки Консоль / Почта с текущей страницей; плашка пользователя; менеджер пункт «Консоль» не видит.
- [x] Консоль: `h1` без подзаголовка; KPI без `tabular-nums`.
- [x] Переключатель «Ответы / Часы / Дни»: крупный текст, прежний размер кнопок; графики выше и одной высоты.

### Почта

- [x] Композер: 64–224px по тексту; у chief блока нет.
- [x] Поллинг: сеть не роняет страницу, русская ошибка.
- [x] §10.2: фильтр менеджера; карточка с именем; шапка «Менеджер: …» по центру, `text-base`.
- [x] Additive DTO: `managerCode` / `managerName`, у chief `managers[]`, `openConversation` если тред не в списке.
- [x] `keepSelectedIfMissing` у chief; URL хранит `conversation` при смене фильтра.
- [x] Сотрудник с чужим `conversationId` — пустые `messages`, без `openConversation`.

### Документы этапа

- [x] Этот файл. Строка в [docs/stages/README.md](README.md). Пункт в §14.
- [x] Контракт snapshot в §17.

## Целевые файлы

```text
docs/stages/09-6-ui-more-fixes.md
docs/stages/README.md
ARCHITECTURE.md
DESIGN.md
README.md
.env.example
next.config.ts
deploy/nginx/assistant.gyhyry.com.conf
.cursor/rules/60-ui.mdc
.cursor/skills/comm-ui/SKILL.md
src/app/layout.tsx
src/app/globals.css
src/components/app-header.tsx
src/app/inbox/page.tsx
src/app/inbox/inbox-view.tsx
src/app/admin/page.tsx
src/app/admin/admin-charts.tsx
src/app/api/inbox/snapshot/route.ts
src/app/api/inbox/snapshot/snapshot.db.test.ts
src/app/api/auth/login/route.ts
src/app/api/auth/logout/route.ts
src/lib/inbox.ts
src/lib/inbox-fetch.ts
src/lib/inbox-fetch.test.ts
src/lib/inbox-selection.ts
src/lib/inbox-selection.test.ts
src/lib/public-origin.ts
src/lib/public-origin.test.ts
src/lib/auth.ts
src/lib/auth-http.ts
src/lib/auth.test.ts
src/middleware.ts
```

Полосы прокрутки (`::-webkit-scrollbar*` в `globals.css`, раздел «Прокрутка» в DESIGN.md) — этап **9.5**, не этот.

Не трогать `prompts/`, воркер, Prisma-схему, mapvideo.

## Автопроверки

```bash
npm run lint
npm test
```

GPU и живая почта не блокеры. Юниты: origin за nginx, cookie Secure, selection chief/manager, snapshot «список Анны + лента Дмитрия у chief», сотрудник не читает чужое.

## Ручная проверка (уже смотрели на стенде)

Сайт: `http://127.0.0.1:3010` или **https://assistant.gyhyry.com**.

1. Гость на домене попадает на `/login` **этого** хоста, не на `https://localhost:3010`.
2. Игорь: шапка «AI Помощник», кнопки Консоль / Почта, плашка «Игорь Белов · …».
3. Консоль: без подзаголовка; цифры крупные; графики одной высоты; текст на «Ответы/Часы/Дни» крупный, сами кнопки не раздуты.
4. Почта Игоря: фильтра «Все / Анна / …»; открыть Елену → фильтр «Дмитрий» — слева Дмитрий, справа Елена; «Выберите диалог» само не вылезает. Справа: «Менеджер: …» по центру шапки.
5. Анна: фильтра нет, композер есть, поле растёт от 64 до 224px.
6. Unbounded нигде в живом UI нет (Golos Text + Onest).

## Что попросить человека

- Не считать этап закрытым по коду без взгляда на Консоль и Почту Игоря (уже смотрел по ходу правок).
- Не просить человека писать код.

## Откат

- До merge: сброс своей ветки. Данные писем не трогать.
- После merge: revert-PR. Не `git push --force` в `main`.
- Nginx: откатить только `assistant.gyhyry.com.conf`, не конфиг mapvideo.

## Вне скоупа

- Новая UI-библиотека, кастомный курсор, смена палитры.
- Возврат Unbounded.
- Автовыбор первого диалога у главного.
- Поле ответа у главного.
- Правка mapvideo, портов 3000 / 5432.
- Новые агенты / промпты / миграции Prisma.

## Definition of done

- Этот файл, таблица этапов и §14 на месте.
- Lint и test зелёные.
- Человек подтвердил правки после скроллов (подпись менеджера — «да, супер»).
- PR `[stage 09.6]` влит в `main` (когда 9.5 уже в `main`; не мешать скроллы и эти правки в один заголовок).
