---
name: mail-privacy
description: Mail safety for IMAP/SMTP stages. Use when reading or sending Gmail, writing the worker, logging mail, or building reply UI. Never log passwords or full bodies.
---

# mail-privacy

Этапы 3–4. Письма настоящие, секреты только в `.env`.

## Правила

- Пароли приложений Gmail не писать в md, код, логи, PR, скриншоты.
- В логах воркера тела писем обрезать. Паролей в логах нет.
- Исходящие с сайта помечаются `X-CommAssist: 1`. Такие и письма от себя не читать как входящие.
- `AiNote` и оценки качества в SMTP клиенту не отправлять.
- Антидубль по `(managerEmail, gmailUid)`. HTML → текст, вложения игнорировать.
- Контейнеры и порты mapvideo не трогать. Наши порты: 3010 / 5433.

Живой Gmail в unit-тестах не дергать — фикстуры и моки.
