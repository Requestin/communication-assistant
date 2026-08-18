# Этап 9.8. Убрать оговорки из UI и ответов

Связь с архитектурой:

- [ARCHITECTURE.md §12.4](../../ARCHITECTURE.md#124-генерация-рейсов) — цены выдуманные, оговорку в UI не пишем
- [§10](../../ARCHITECTURE.md#10-экраны-и-почти-мгновенное-обновление) — почта, вход
- [§11.3](../../ARCHITECTURE.md#113-агент-подбора-командировки-travel-agent) — текст подбора

Это **не** новые экраны и не смена стенда. Фиксация копирайта **сразу после** [09-7-docker-stand.md](09-7-docker-stand.md). Docker/tmux сюда не копировать.

**Статус:** этап 9.7 влит в `main`. Человек попросил убрать повторяющиеся «учебные» подписи с живого стенда.

Ветка: `stage/09-8-copy-cleanup`  
База: `main` после этапа 9.7  
Зависимость: [09-7-docker-stand.md](09-7-docker-stand.md) влит в `main`  
PR: `[stage 09.8] Убрать учебные оговорки и лишние подписи`

Не трогать mapvideo, IMAP/SMTP-логику, формулы AVG, порты, `up.sh` / tmux.

## Скиллы

- UI: `frontend-design` + `comm-ui`
- Перед PR: `testing-reviewer` + `code-reviewer`

## Цель простыми словами

В интерфейсе и во вставке клиенту больше нет «учебные данные», «не оферта» и поясняющих подписей, которые мешали на каждом экране.

**Готово когда:** на входе, в композере, на карточке подбора и на пустой ленте этих фраз нет; «Вставить в ответ» их тоже не добавляет.

## Что видел человек → что сделали

| Что просил | Что сделали |
| --- | --- |
| Убрать отовсюду «учебные данные» и «не оферта» | Константа disclaimer удалена; карточка и тело `AiNote` без этой строки; промпт pack больше не просит её молчать |
| «ответ уйдёт на почту клиента» | Подпись убрана; без выбранного диалога остаётся «выберите клиента» |
| «Слева диалоги по темам писем. Одна тема — одна лента.» | Убрана. Заголовок «Выберите диалог» остаётся. Пустой ящик: «Ждём первое письмо» и текст про Gmail |
| «учебный стенд» на входе | Осталось «Выберите себя. Пароля нет.» |
| Отказ по городу | «В справочнике нет города …», без слова «учебном» |

## Правило

Сначала патч `ARCHITECTURE.md` §12.4, потом код. Не возвращать disclaimer в payload/insert.

## Чеклист работ (всё сделано)

- [x] [src/lib/travel/offer-text.ts](../../src/lib/travel/offer-text.ts) — нет `TRAVEL_DISCLAIMER`.
- [x] [src/lib/ai/travel.ts](../../src/lib/ai/travel.ts) — тело заметки без оговорки; отказ без «учебном».
- [x] [src/app/inbox/travel-offer.tsx](../../src/app/inbox/travel-offer.tsx) — бейдж disclaimer не рисуется (и у старых карточек).
- [x] [src/app/inbox/inbox-view.tsx](../../src/app/inbox/inbox-view.tsx) — композер и пустая лента.
- [x] [src/app/login/page.tsx](../../src/app/login/page.tsx).
- [x] [prompts/travel-pack-system.md](../../prompts/travel-pack-system.md).
- [x] Тесты travel / stats.
- [x] ARCHITECTURE §12.4, пункт этапа 6, §14; этот файл; строка в [docs/stages/README.md](README.md).

## Целевые файлы

```text
docs/stages/09-8-copy-cleanup.md
docs/stages/README.md
ARCHITECTURE.md
prompts/travel-pack-system.md
src/lib/travel/offer-text.ts
src/lib/ai/travel.ts
src/lib/ai/travel.test.ts
src/lib/ai/travel.db.test.ts
src/lib/admin/stats.db.test.ts
src/app/inbox/travel-offer.tsx
src/app/inbox/inbox-view.tsx
src/app/login/page.tsx
```

Не трогать `scripts/`, compose, imap, mapvideo.

## Автопроверки

```bash
npm run lint
npm test
```

Юниты: insert-текст и body подбора не содержат «учебн» / «оферт». GPU и Gmail не дергать.

## Ручная проверка

Сайт: `http://127.0.0.1:3010` или https://assistant.gyhyry.com (жёсткое обновление).

1. Вход: нет «учебный стенд».
2. Почта, диалоги есть, лента не выбрана: «Выберите диалог» без второго абзаца.
3. Композер менеджера: нет «ответ уйдёт на почту клиента».
4. Карточка подбора и «Вставить в ответ»: нет «учебные данные, не оферта».

## Откат

- До merge: сброс ветки.
- После merge: revert-PR. Не `git push --force` в `main`.

## Вне скоупа

- Стенд Docker / tmux (этап 9.7).
- Смена палитры, новые агенты, mapvideo.

## Definition of done

- Этот файл, таблица этапов и §14 на месте.
- Lint и test зелёные.
- PR `[stage 09.8]` влит в `main`.
