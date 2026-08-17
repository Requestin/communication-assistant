---
name: comm-ui
description: Visual system for the communication-assistant pilot. Use when editing tsx, CSS, login/inbox/admin, or any UI styling. Read DESIGN.md first and keep graphite plus amber, Golos Text, and Unbounded.
---

# comm-ui

Перед вёрсткой прочитать [DESIGN.md](../../../DESIGN.md). Не выдумывать новую палитру и шрифты.

## Обязательно

- Тема по умолчанию тёмная: тёплый графит, акцент янтарь.
- Текст UI — **Golos Text**. Заголовки и имена на входе — **Unbounded**.
- Интерфейс на русском. shadcn + Tailwind, без новой UI-библиотеки.
- Анимации только CSS / `tw-animate-css`, точечно. `prefers-reduced-motion: reduce` — без движения.
- Служебные карточки ИИ остаются янтарными и не уходят в SMTP.

## Нельзя

- Inter, Geist, Roboto, системный Arial как основной набор.
- Белый фон «из коробки», фиолетовый градиент, кислотный neon dark.
- Framer Motion, кастомный курсор, ReactBits.

Дальше можно открыть `frontend-design`, но токены и шрифты не менять.
