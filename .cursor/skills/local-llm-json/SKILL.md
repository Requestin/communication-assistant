---
name: local-llm-json
description: Local Qwen JSON client for quality and travel agents. Use on stages 5–6 when calling llama-server, writing prompts, or parsing model output. No cloud LLM, no RAG.
---

# local-llm-json

Один локальный клиент (`src/lib/ai/llm.ts`), одна модель на диске. SQL пишет код, модель получает короткую выборку.

## Правила

- Только `LLM_BASE_URL` / llama-server на **8088**. Облачных LLM нет.
- Ответ модели — JSON. Кривой JSON → retry, затем fail job. API сайта не падает.
- Не RAG и не векторная база.
- **GPU (RTX 5090) целиком наш.** Mapvideo карту не использует. Процессы и порты mapvideo не убивать.
- Не поднимать второй тяжёлый стек (Ollama + ComfyUI) без нужды.
- В unit-тестах мок, живой GPU не обязателен.

Промпты лежат в `prompts/`. Оценки и подборы — служебные карточки в нашем UI, не письма клиенту.
