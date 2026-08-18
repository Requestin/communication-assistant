# Этап 9.7. Стенд: Docker без llm, llama в tmux

Связь с архитектурой:

- [ARCHITECTURE.md §6](../../ARCHITECTURE.md#6-docker-compose-порты-железо) — сервисы, порты, модель на хосте
- [§3.1](../../ARCHITECTURE.md#31-сосуществование-с-mapvideo) — mapvideo не трогать
- [§15.1](../../ARCHITECTURE.md#151-запуск-целевой) — `./scripts/up.sh`
- [§13](../../ARCHITECTURE.md#13-секреты-и-envexample) — `LLM_BASE_URL=http://127.0.0.1:8088/v1`

Это **не** новые агенты и не смена UI. Фиксация живого стенда **сразу после** [09-6-ui-more-fixes.md](09-6-ui-more-fixes.md): сайт и воркер в Docker, модель отдельно на хосте.

**Статус:** этап 9.6 влит в `main` (PR #19). Хостовые `npm run dev` / `npm run worker` на стенде заменены контейнерами. Контейнер `commassist-llm` не стартует (profile `gpu-container`).

Ветка: `stage/09-7-docker-stand`  
База: `main` после этапа 9.6 и hotfix PR #20  
Зависимость: [09-6-ui-more-fixes.md](09-6-ui-more-fixes.md) влит в `main`  
PR: `[stage 09.7] Стенд: Docker без llm, llama в tmux, up/down`

Не трогать mapvideo, nginx, порты **3000 / 3001 / 3002 / 5432 / 5000**. Чужие tmux-сессии (`wan22_*` и т.п.) не убивать. Не коммитить `.env`.

## Скиллы

- Перед PR: `testing-reviewer` + `code-reviewer`
- Почта в воркере: `mail-privacy` (логи без паролей и полных тел)

## Цель простыми словами

Одна команда включает пилот, одна выключает. Postgres, сайт и воркер — наши контейнеры. Qwen крутится на хосте в tmux, закрытие Cursor модель не убивает.

**Готово когда:** `./scripts/up.sh` поднимает `commassist-db` / `commassist-web` / `commassist-worker` и `llama-server` в сессии `commassist-llm`; сайт отвечает на `http://127.0.0.1:3010`; контейнер `llm` не запущен; mapvideo жив.

## Что видел человек → что сделали

| Что просил | Что сделали |
| --- | --- |
| Всё кроме llm в Docker, llm как сейчас на хосте | `db` / `web` в сети `commassist`; `worker` с `network_mode: host`, чтобы ходить на `127.0.0.1:8088` |
| Скрипты up и down | `scripts/up.sh` / `scripts/down.sh`; `npm run up` / `npm run down` |
| Не бояться закрывать терминал и Cursor | `llama-server` в tmux `commassist-llm`; `scripts/llama-tmux.sh`; attach: `tmux attach -t commassist-llm` |
| Не гасить mapvideo | `compose stop` только `db web worker`; нет `docker compose down` всего сервера; порты 3010 / 5433 / 8088 |

## Правило (уже закрыто в архитектуре)

Сначала патч `ARCHITECTURE.md` §6.2 / §15.1, потом скрипты и compose.

- Модель bind **127.0.0.1:8088**, не `0.0.0.0`.
- Сервис compose `llm` спрятан в profile `gpu-container` и сам не стартует.
- `down.sh` останавливает только нашу tmux-сессию, не `tmux kill-server`.
- Хостовые `npm run dev` и `npm run worker` не держать вместе с контейнерами.

## Чеклист работ (всё сделано)

- [x] [docker-compose.yml](../../docker-compose.yml): worker `network_mode: host`, `LLM_BASE_URL=http://127.0.0.1:8088/v1`, БД через `127.0.0.1:5433`; llm за profile.
- [x] [deploy/llm/Dockerfile](../../deploy/llm/Dockerfile): запасной образ с `libgomp1`, без копирования GGUF.
- [x] [Dockerfile](../../Dockerfile): `mkdir -p public`, чтобы `COPY public` не падал.
- [x] [public/.gitkeep](../../public/.gitkeep).
- [x] [scripts/up.sh](../../scripts/up.sh): tmux-модель, опционально `--build` web/worker, `compose up -d db web worker`, ждать 3010.
- [x] [scripts/down.sh](../../scripts/down.sh): `compose stop db web worker` + стоп `commassist-llm`.
- [x] [scripts/llama-tmux.sh](../../scripts/llama-tmux.sh): `start` / `stop` / `attach`.
- [x] [package.json](../../package.json): `up`, `down`, `llm:attach`.
- [x] [.env.example](../../.env.example): `LLM_BASE_URL=http://127.0.0.1:8088/v1`.
- [x] [.gitignore](../../.gitignore): `/logs/`.
- [x] [src/lib/mail/imap.ts](../../src/lib/mail/imap.ts): `mailbox | false` сужается, `next build` в образе зелёный.
- [x] [src/lib/demo-bind.test.ts](../../src/lib/demo-bind.test.ts): порты, host-сеть, tmux, up не стартует `llm`.
- [x] README, AGENTS, ARCHITECTURE §6.2 / §13 / §15.1 / §14.
- [x] Этот файл и строка в [docs/stages/README.md](README.md).

## Целевые файлы

```text
docs/stages/09-7-docker-stand.md
docs/stages/README.md
ARCHITECTURE.md
README.md
AGENTS.md
.env.example
.gitignore
package.json
Dockerfile
docker-compose.yml
deploy/llm/Dockerfile
public/.gitkeep
scripts/up.sh
scripts/down.sh
scripts/llama-tmux.sh
src/lib/mail/imap.ts
src/lib/demo-bind.test.ts
```

Не трогать промпты агентов, копирайт UI, Prisma-схему, mapvideo.

## Автопроверки

```bash
npm run lint
npm test
```

Юниты: bind 127.0.0.1, `up.sh` без сервиса `llm`, tmux-сессия только `commassist-llm`. Живой Gmail и GPU в тестах не дергать.

## Ручная проверка (уже на стенде)

1. `./scripts/up.sh --build` — сайт `http://127.0.0.1:3010` и `https://assistant.gyhyry.com`.
2. `docker ps`: `commassist-web`, `commassist-worker`, `commassist-db`; `commassist-llm` не Up.
3. `tmux ls`: есть `commassist-llm`; сессии `wan22_*` на месте.
4. mapvideo на 3000 / 5432 жив.
5. Закрытие терминала Cursor модель не убивает (`tmux attach -t commassist-llm`).

## Что попросить человека

- Не запускать рядом `npm run dev` / `npm run worker`.
- Не просить человека писать код.

## Откат

- До merge: сброс своей ветки. Том Postgres не дропать.
- После merge: revert-PR. Не `git push --force` в `main`.
- `down.sh` не трогает mapvideo.

## Вне скоупа

- Контейнер llm по умолчанию.
- Bind модели на `0.0.0.0`.
- Правки копирайта («учебные данные», пустая лента) — этап 9.8.
- Правка mapvideo.

## Definition of done

- Этот файл, таблица этапов и §14 на месте.
- Lint и test зелёные.
- PR `[stage 09.7]` влит в `main`.
