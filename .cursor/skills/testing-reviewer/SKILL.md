---
name: testing-reviewer
description: Review test quality and identify missing, weak, or brittle test coverage for changed code.
---

# Testing Reviewer

Use this skill after code changes or before merge.

## What To Check

- Missing tests for new behavior.
- Missing negative/edge-case tests.
- Assertions too weak to catch regressions.
- Tests coupled to implementation details.
- Flaky tests (timing/order/shared state dependence).

## Test Expectations

- Verify behavior, not internals.
- Include happy path + failure path.
- Cover validation boundaries and auth/permission cases.
- Prefer deterministic setup and cleanup.
- Keep tests small and explicit.

## Output Format

Return:
1. Coverage gaps (ordered by impact).
2. Suggested test cases (concise, actionable).
3. Risk summary if tests stay as-is.

## Project Context

- Vitest, `fileParallelism: false`, `.env` через `vitest.setup.ts`. Живой Gmail и GPU в unit-тестах не вызывать.
- Покрывать: логин / `ca_session` / роли (`manager` vs `chief`), 401/403, инварианты справочника (MOW–LED), идемпотентность сидов.
- Route handlers можно вызывать напрямую (`POST(new Request(...))`), сервер Next в тестах не поднимать.
