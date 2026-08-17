---
name: code-reviewer
description: Review code changes for correctness, regressions, security risks, maintainability, and missing tests.
---

# Code Reviewer

Use this skill when reviewing implemented changes, pull requests, or local diffs.

## Review Goals

- Find functional bugs and regressions first.
- Identify security and data-handling risks.
- Check architecture and maintainability issues.
- Validate test coverage for changed behavior.

## Review Process

1. Understand intent from `ARCHITECTURE.md`, the current file in `docs/stages/`, and changed files.
2. Inspect full diff context (not only latest hunk).
3. List findings by severity:
   - `high`: data loss, auth/security, broken behavior
   - `medium`: logic edge cases, missing validation, risky assumptions
   - `low`: readability, naming, minor cleanups
4. For each finding include:
   - affected file/symbol
   - why this is a problem
   - concrete fix direction
5. If no findings, state "no critical issues found" and note residual risks.

## Project-Specific Constraints

- Один этап за раз. Не подключать IMAP/SMTP/LLM раньше своего этапа.
- Порты только **3010 / 5433 / 8088**. Контейнеры и порты mapvideo не трогать.
- `.env` и пароли почты не коммитить. В логах не писать тела писем.
- Сессия — cookie `ca_session`. Фиктивный вход без пароля — сознательно.
- GPU (RTX 5090) целиком наш; mapvideo карту не использует. Процессы mapvideo не убивать.
