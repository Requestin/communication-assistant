# Этап 0. Каркас

Связь с архитектурой:

- [ARCHITECTURE.md §14](../../ARCHITECTURE.md#14-пошаговый-план-реализации) — этот этап
- [§4](../../ARCHITECTURE.md#4-стек-и-почему-так-а-не-иначе) — стек
- [§6](../../ARCHITECTURE.md#6-docker-compose-порты-железо) — Docker и порты
- [§7](../../ARCHITECTURE.md#7-модель-данных) — схема Prisma, включая `MailCursor` из §8.6
- [§13](../../ARCHITECTURE.md#13-секреты-и-envexample) — `.env.example`

Ветка: `stage/00-skeleton`  
База: актуальный `main`  
Зависимость: нет (первый кодовый этап)  
PR: `[stage 00] Каркас Next.js, Prisma и Postgres`

## Цель простыми словами

Появляется пустой, но настоящий каркас: сайт на Next.js, база Postgres в Docker, таблицы как в архитектуре, четыре тестовых пользователя. Экранов входа и почты ещё нет.

**Готово когда:** `docker compose up db`, миграции применены, в таблице `users` ровно четыре строки (три менеджера и главный).

## Чеклист работ

- [ ] `create-next-app`: App Router, TypeScript, Tailwind, ESLint. Порт приложения **3010**, не 3000.
- [ ] Инициализировать shadcn/ui и поставить базовые компоненты, которые понадобятся дальше (Button, Card, Input — без сборки экранов).
- [ ] `docker-compose.yml`: сервисы `db` (Postgres 16, хост **5433**) и заглушка `web`. Сервисов `worker` и `llm` на этом этапе нет.
- [ ] `Dockerfile` для `web` (можно простой dev/prod; главное — собирается).
- [ ] Prisma-схема по §7.2–7.9 плюс `MailCursor` (§8.6).
- [ ] Первая миграция.
- [ ] `prisma/seed.ts`: upsert четырёх пользователей из §2.1 (`M36`, `M52`, `M65`, `CHIEF`).
- [ ] Локальный `.env` из [`.env.example`](../../.env.example) — **не коммитить**. Если `.env` нет, попросить человека скопировать example и задать `SESSION_SECRET` и `POSTGRES_PASSWORD`.
- [ ] Скрипты в `package.json`: `lint`, `test`, `db:migrate`, `db:seed`.
- [ ] Минимальный автотест: после seed в `users` четыре записи с нужными `code` и ролями.
- [ ] Дописать в [AGENTS.md](../../AGENTS.md) реальные команды `npm` / `docker compose` вместо заглушки «появятся на этапе 0».

## Целевые файлы

```text
package.json
docker-compose.yml
Dockerfile
prisma/schema.prisma
prisma/migrations/
prisma/seed.ts
src/  или app/   # каркас Next.js
.env.example     # уже есть, не класть секреты
AGENTS.md        # обновить блок команд
```

## Автопроверки

Запустить и не коммитить, пока красное:

```bash
npm run lint
npm test
docker compose up -d db
npx prisma migrate deploy   # или migrate dev в dev
npx prisma db seed
```

Проверить запросом (или тестом), что:

- есть пользователи `M36`, `M52`, `M65` с `role=manager` и email из архитектуры;
- есть `CHIEF` с `role=chief` и `email=null`;
- порты в compose: Postgres `5433:5432`, web `3010` (если web уже проброшен).

## Ручная проверка

На этом этапе **экран смотреть не просим**. Достаточно автопроверок и четырёх строк в `users`.

Если человек хочет убедиться сам:

1. В каталоге проекта: `docker compose ps` — `db` healthy.
2. `docker compose exec db psql -U commassist -d commassist -c "SELECT code, name, role, email FROM users ORDER BY code;"`
3. Должны быть четыре строки, паролей в выводе нет.

## Что попросить человека

- Если нет `.env`: «Скопируйте `.env.example` в `.env` и придумайте `SESSION_SECRET` и `POSTGRES_PASSWORD`. Пароли Gmail на этапе 0 не обязательны.»
- Если папка ещё не git-репозиторий или нет `origin`: доступ к GitHub и `git remote`, иначе PR создать нельзя.
- Порт 5433 или 3010 занят чем-то кроме оговорённого — напишите, чем занят.

## Откат

- До merge: на ветке `git reset --hard origin/main` (или удалить ветку) и чинить заново. Не пушить сломанное в `main`.
- После merge: revert-PR в `main`, не `push --force` в `main`.
- Том Postgres можно снести только если на нём ещё нет нужных писем: `docker compose down` и удаление тома `pgdata` — осторожно, спросить человека, если том уже живой.

## Definition of done

- Чеклист выше выполнен.
- Lint и тесты зелёные.
- В `users` 4 ожидаемые строки.
- Команды в `AGENTS.md` обновлены.
- PR влит в `main`.
