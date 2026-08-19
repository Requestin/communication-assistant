# Запуск пилота на новом сервере

Пошаговая инструкция, как поднять сервис. 

Описание проекта — в [README.md](README.md). Техническое описание — в [ARCHITECTURE.md](ARCHITECTURE.md).

```mermaid
flowchart TD
  clone[Клон репозитория]
  gpu[Драйвер NVIDIA и llama.cpp]
  gguf[Файл GGUF на диск]
  envFile["Файл .env"]
  up["scripts/up.sh --build"]
  seed[Сид справочника рейсов]
  site["Сайт 127.0.0.1:3010"]
  clone --> envFile
  gpu --> up
  gguf --> envFile
  envFile --> up
  up --> seed
  seed --> site
```





## 1. Что получится

После шагов ниже:

- сайт слушает **только** `127.0.0.1:3010` (снаружи его выпускает nginx, если настроите);
- Postgres пилота — `127.0.0.1:5433`;
- модель — `llama-server` в tmux-сессии `commassist-llm`, **только** `127.0.0.1:8088`;
- контейнеры `commassist-db`, `commassist-web`, `commassist-worker`. Контейнер `llm` **не** запускается.

Включение: `./scripts/up.sh`  
Выключение: `./scripts/down.sh` (письма в томе Postgres остаются)

Порты **3010 / 5433 / 8088** зашиты в compose и скриптах. Даже на пустом сервере **не** переносите сайт на 3000 и базу на 5432.

## 2. Что нужно от сервера


| Требование | Ориентир                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| ОС         | Ubuntu 22.04 / 24.04 или близкий Debian                                                                              |
| Доступ     | SSH, команды ниже рассчитаны на **root**                                                                             |
| GPU        | NVIDIA, VRAM с запасом под файл ~22 ГБ и контекст 8192 (карта класса 24–32 ГБ). Запуск только на CPU не предусмотрен |
| Диск       | свободно **не меньше 80 ГБ**                                                                                         |
| Сеть       | исходящий HTTPS (GitHub, Hugging Face, Docker Hub, Gmail)                                                            |
| Почта      | три Gmail почты и их пароли приложений (не обычный пароль ящика)                                                     |


Проверка GPU до всего остального:

```bash
nvidia-smi
```

Должны быть имя карты, драйвер и объём памяти. Если команды нет или таблица пустая — сначала поставьте драйвер NVIDIA и перезагрузитесь. Без этого модель не встанет.

Нужные пакеты (имена на Ubuntu):

```bash
apt-get update
apt-get install -y git curl tmux build-essential cmake python3-pip
```

Плюс:

- **Docker Engine и Compose v2** — по [документации Docker для Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Проверка: `docker compose version`.
- **CUDA toolkit** со своим `nvcc`, совместимый с драйвером — чтобы собрать `llama-server` с GPU. Проверка: `nvcc --version`.
- `nvidia-container-toolkit` **не** обязателен: штатный путь — модель на хосте, не GPU-контейнер.



## 3. Клон репозитория

```bash
git clone https://github.com/Requestin/communication-assistant.git
cd communication-assistant
git checkout main
```

Каталог клона может быть любым. Бинарь модели — нет: скрипт запуска ищет его строго в `/root/local_llm/...`.

## 4. Сборка llama.cpp

[scripts/llama-tmux.sh](scripts/llama-tmux.sh) запускает только этот файл:

```text
/root/local_llm/llama.cpp/build/bin/llama-server
```

Соберите его туда (нужен свежий llama.cpp, сборка порядка b9206 и новее):

```bash
mkdir -p /root/local_llm
git clone https://github.com/ggml-org/llama.cpp.git /root/local_llm/llama.cpp
cd /root/local_llm/llama.cpp
cmake -B build -DGGML_CUDA=ON
cmake --build build --config Release -j"$(nproc)" --target llama-server
```

Проверка:

```bash
test -x /root/local_llm/llama.cpp/build/bin/llama-server
ldd /root/local_llm/llama.cpp/build/bin/llama-server | grep -i cuda
```

`ldd` должен показать библиотеки CUDA. Если `nvcc` не найден или линковки нет — не запускайте `up.sh`, сначала почините toolkit.

## 5. Файл модели (GGUF)

Нужен один файл, не весь репозиторий весов:

- имя: `Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf` (~22,4 ГБ)
- источник: [unsloth/Qwen3.6-35B-A3B-GGUF](https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF)
- путь по умолчанию (как в `.env.example`):

```text
/var/lib/ollama/qwen-source/Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf
```

Каталог создаёте сами. Ставить Ollama не нужно — так исторически назван путь.

```bash
mkdir -p /var/lib/ollama/qwen-source
pip install -U "huggingface_hub[cli]"
hf download unsloth/Qwen3.6-35B-A3B-GGUF \
  Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf \
  --local-dir /var/lib/ollama/qwen-source
```

Проверка размера (ожидается порядка 22 ГБ):

```bash
ls -lh /var/lib/ollama/qwen-source/Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf
```

Другой путь допустим, если тот же файл пропишете в `LLM_GGUF_PATH` внутри `.env`.

## 6. Файл `.env`

Из каталога репозитория:

```bash
cp .env.example .env
```

Файл **не** коммитить и не вставлять в чаты, тикеты, скриншоты.

### 6.1. Сессия и база

```bash
# вставьте значения в .env
SESSION_SECRET="$(openssl rand -hex 32)"
POSTGRES_PASSWORD="$(openssl rand -base64 24)"
```

В `.env` должны совпасть:

- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`
- `DATABASE_URL=postgresql://USER:PASSWORD@db:5432/DB` — для контейнеров; хост `db`, порт **5432 внутри сети Docker**
- `POSTGRES_PORT=5433` — порт на **хосте**

Пароль в `DATABASE_URL` — тот же, что `POSTGRES_PASSWORD`. Спецсимволы в пароле лучше не использовать, чтобы не ломать URL.

Строка с `127.0.0.1:5433` в example — только для команд **с хоста** (сид справочника, отладка). В самом `.env`, который читает Compose, оставьте `@db:5432`.

### 6.2. Модель

Оставьте:

```text
LLM_BASE_URL=http://127.0.0.1:8088/v1
LLM_API_KEY=local
LLM_MODEL_NAME=qwen36
LLM_GGUF_PATH=/var/lib/ollama/qwen-source/Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf
```

`LLM_GGUF_PATH` должен указывать на реально существующий файл.

### 6.3. Почта Gmail

Для живой почты у каждого менеджера:

1. В аккаунте Google включите двухэтапную проверку.
2. Создайте **пароль приложения** (не пароль входа в Gmail).
3. В Gmail включите IMAP.
4. В `.env` вставьте 16 символов **без пробелов** в:
  - `GMAIL_M36_APP_PASSWORD`
  - `GMAIL_M52_APP_PASSWORD`
  - `GMAIL_M65_APP_PASSWORD`

Адреса ящиков уже заданы в example (`communicationassistant36@gmail.com` и соседние). Если на новом стенде другие ящики — поменяйте и адреса, и пароли приложений согласованно с пользователями в базе (коды `M36` / `M52` / `M65`).

Без паролей приложений сайт всё равно откроется, но новые письма не придут и ответ с сайта не уйдёт.

## 7. Первый запуск

Снова в каталоге репозитория, где лежит `.env`:

```bash
chmod +x scripts/*.sh
./scripts/up.sh --build
```

Первый раз долго: сборка образов сайта и воркера, загрузка ~22 ГБ в GPU. Скрипт ждёт модель до ~6 минут и сайт до ~3 минут.

Что происходит внутри:

1. Если нет `.env` — скрипт сразу выходит.
2. `llama-server` стартует в tmux `commassist-llm`: `--host 127.0.0.1 --port 8088 --ctx-size 8192 -ngl 99 --alias qwen36 --reasoning off`.
3. Собираются образы `web` и `worker` (сервис compose `llm` с profile `gpu-container` **не** собирается и не стартует).
4. `docker compose up -d db web worker`.
5. Контейнер сайта при старте делает `prisma migrate deploy` и сид **четырёх пользователей** (Анна, Дмитрий, Елена, Игорь). Справочник рейсов на этом шаге **не** заливается.

Логи модели: `tmux attach -t commassist-llm` (отцепиться: `Ctrl-b`, затем `d`). Файл: `logs/llama-server.log`.

## 8. Справочник рейсов и отелей

Без этого шага кнопка «Подобрать решение» не соберёт пакет по живым городам.

Дождитесь, пока база здорова: `docker compose ps` — у `commassist-db` состояние healthy.

**Вариант A.** На хосте установлен Node.js 22:

```bash
npm ci
DATABASE_URL="postgresql://commassist:ПАРОЛЬ_ИЗ_ENV@127.0.0.1:5433/commassist" \
  npm run db:seed-travel
```

Подставьте пароль из `POSTGRES_PASSWORD`. Не публикуйте эту командную строку.

**Вариант B.** Без Node на хосте, база уже запущена (в образе `web` каталога `scripts/` нет — его монтируем):

```bash
docker compose run --rm --no-deps --entrypoint "" \
  -v "$PWD/scripts:/app/scripts:ro" \
  web npx tsx scripts/seed-travel.ts
```

Контейнер `web` уже знает `DATABASE_URL` на хост `db`. Повторный запуск без `--force` пишет `уже залито` и не затирает справочник.

## 9. Проверки, что стенд живой

```bash
docker compose ps
# commassist-db, commassist-web, commassist-worker — Up
# commassist-llm среди контейнеров быть не должно

curl -sf -o /dev/null "http://127.0.0.1:3010/" && echo "сайт отвечает"
curl -sf "http://127.0.0.1:8088/v1/models"
ss -tlnH | grep -E '127.0.0.1:(3010|5433|8088)'
```

Откройте в браузере `http://127.0.0.1:3010` (через SSH-туннель, если смотрите со своего компьютера). Вход **без пароля**: выберите **Анну Соколову**.

Модель и Postgres наружу не должны слушаться на `0.0.0.0`. Сайт — тоже только localhost, пока не повесите nginx.

## 10. По желанию: домен и HTTPS

Шаблон: [deploy/nginx/assistant.gyhyry.com.conf](deploy/nginx/assistant.gyhyry.com.conf).

Смысл:

- nginx слушает 80/443;
- `proxy_pass http://127.0.0.1:3010`;
- заголовки `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`;
- `proxy_redirect` с `localhost:3010` / `127.0.0.1:3010` на ваш `https://домен/` — иначе браузер уезжает на `https://localhost:3010`.

Подставьте свой `server_name` и пути сертификата. Выпустите сертификат Certbot. Порт **3010 в firewall не открывайте**.

`APP_URL` в `.env` можно оставить `http://127.0.0.1:3010`: наружный домен задаёт nginx.

После смены конфига:

```bash
nginx -t && nginx -s reload
```

Не копируйте этот server-блок в чужие сайты на той же машине.

## 11. Повседневная работа


| Действие                      | Команда                             |
| ----------------------------- | ----------------------------------- |
| Включить (модель уже собрана) | `./scripts/up.sh`                   |
| Пересобрать сайт и воркер     | `./scripts/up.sh --build`           |
| Выключить пилот               | `./scripts/down.sh`                 |
| Логи модели                   | `tmux attach -t commassist-llm`     |
| Логи сайта / воркера          | `docker compose logs -f web worker` |


После **ребута сервера** Docker сам поднимет `db` / `web` / `worker` (`restart: unless-stopped`). Сессия tmux с моделью **не** переживает ребут — снова выполните `./scripts/up.sh`.

Не делайте:

- `docker compose down` в чужом каталоге и `docker system prune`, если на хосте есть другие контейнеры;
- снос тома `pgdata`, если в базе уже есть живые письма;
- `git push --force` в `main`.

Обновление кода с GitHub:

```bash
git pull
./scripts/up.sh --build
```

Сид справочника после обновления обычно не нужен. Пользователи при старте `web` сидятся повторно безопасно (upsert).

## 12. Типичные сбои


| Симптом                                       | Что проверить                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Нет .env`                                    | `cp .env.example .env` и заполнить секреты                                            |
| `Не найден файл модели LLM_GGUF_PATH`         | путь в `.env`, размер файла ~22 ГБ                                                    |
| Скрипт не находит `llama-server`              | бинарь именно `/root/local_llm/llama.cpp/build/bin/llama-server`                      |
| `Не найден tmux`                              | `apt-get install -y tmux`                                                             |
| Модель не ответила за 6 минут                 | `tmux attach -t commassist-llm`, `nvidia-smi`, хватает ли VRAM под `-ngl 99`          |
| Порт 8088 занят                               | другой `llama-server` / чужой сервис; `ss -tlnp | grep 8088`                          |
| Сайт не поднялся                              | `docker compose logs web`; Postgres healthy; конфликт 3010                            |
| Письма не приходят                            | IMAP, пароль **приложения**, 2FA; в логах воркера не должно быть паролей и полных тел |
| «Подобрать решение» пустое / отказ без Томска | не выполнен §8, сид справочника                                                       |
| Редирект на `https://localhost:3010`          | nginx: `X-Forwarded-*` и `proxy_redirect`                                             |
| После ребута нет ИИ                           | tmux не автостарт, нужен `./scripts/up.sh`                                            |


Откат пилота без удаления писем: `./scripts/down.sh`. Полный снос тома базы — только если вы сознательно хотите пустую БД.

## 13. Короткий чеклист с нуля

1. `nvidia-smi` зелёный, Docker и `nvcc` на месте.
2. Клон `main`.
3. Собрать `llama-server` в `/root/local_llm/llama.cpp/build/bin/`.
4. Скачать GGUF в `LLM_GGUF_PATH`.
5. `.env` с секретами и паролями приложений Gmail.
6. `./scripts/up.sh --build`.
7. Сид справочника (§8).
8. `curl` на 3010 и `/v1/models`, вход как Анна.

