import OpenAI, { APIConnectionError, APIConnectionTimeoutError, APIError } from "openai";
import { clipBody } from "@/lib/mail/parse";

const TIMEOUT_MS = 120_000;
const JSON_RETRY_HINT = "Верни только JSON.";

export class LlmJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmJsonError";
  }
}

export type LlmRawCompleteInput = {
  system: string;
  user: string;
  attempt: 1 | 2;
};

export type LlmRawCompleteFn = (input: LlmRawCompleteInput) => Promise<string>;
export type LlmCompleteJsonFn = (
  system: string,
  user: string,
  schemaName: string,
) => Promise<unknown>;

let rawOverride: LlmRawCompleteFn | null = null;
let jsonOverride: LlmCompleteJsonFn | null = null;
let jsonFormatSupported = true;

export function setLlmRawCompleteForTests(fn: LlmRawCompleteFn | null): void {
  rawOverride = fn;
}

export function setLlmCompleteForTests(fn: LlmCompleteJsonFn | null): void {
  jsonOverride = fn;
}

export function resetLlmClientStateForTests(): void {
  rawOverride = null;
  jsonOverride = null;
  jsonFormatSupported = true;
}

export function extractJsonObject(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(cleaned);
  if (fence?.[1]) {
    cleaned = fence[1].trim();
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new LlmJsonError("no JSON object in model output");
  }
  return cleaned.slice(start, end + 1);
}

export function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(extractJsonObject(text));
  } catch (error) {
    if (error instanceof LlmJsonError) {
      throw error;
    }
    throw new LlmJsonError("model output is not valid JSON");
  }
}

export function isTransientLlmError(error: unknown): boolean {
  if (error instanceof LlmJsonError) {
    return false;
  }
  if (error instanceof APIConnectionTimeoutError || error instanceof APIConnectionError) {
    return true;
  }
  if (error instanceof Error && /timeout|ECONNREFUSED|fetch failed|network/i.test(error.message)) {
    return true;
  }
  return false;
}

function llmClient(): OpenAI {
  return new OpenAI({
    baseURL: process.env.LLM_BASE_URL ?? "http://127.0.0.1:8088/v1",
    apiKey: process.env.LLM_API_KEY ?? "local",
    timeout: TIMEOUT_MS,
  });
}

function isUnsupportedResponseFormat(error: unknown): boolean {
  if (!(error instanceof APIError)) {
    return false;
  }
  return /response_format|json_object/i.test(error.message);
}

async function createCompletion(
  system: string,
  user: string,
  withJsonFormat: boolean,
): Promise<string> {
  const model = process.env.LLM_MODEL_NAME ?? "qwen36";
  const completion = await llmClient().chat.completions.create({
    model,
    temperature: 0.1,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ...(withJsonFormat ? { response_format: { type: "json_object" } } : {}),
  });
  return completion.choices[0]?.message?.content ?? "";
}

async function completeRaw(input: LlmRawCompleteInput): Promise<string> {
  if (rawOverride) {
    return rawOverride(input);
  }
  if (jsonFormatSupported) {
    try {
      return await createCompletion(input.system, input.user, true);
    } catch (error) {
      if (isUnsupportedResponseFormat(error)) {
        jsonFormatSupported = false;
      } else {
        throw error;
      }
    }
  }
  return createCompletion(input.system, input.user, false);
}

export async function completeJson<T>(
  system: string,
  user: string,
  schemaName: string,
): Promise<T> {
  if (jsonOverride) {
    return (await jsonOverride(system, user, schemaName)) as T;
  }

  const started = Date.now();
  const promptChars = system.length + user.length;
  let lastError: unknown = new LlmJsonError("model failed to return JSON");

  for (const attempt of [1, 2] as const) {
    const userPrompt = attempt === 2 ? `${user}\n\n${JSON_RETRY_HINT}` : user;
    try {
      const text = await completeRaw({ system, user: userPrompt, attempt });
      const parsed = parseJsonObject(text);
      console.info(
        `[llm] schema=${schemaName} promptChars=${promptChars} ms=${Date.now() - started} ok=true attempt=${attempt} preview=${clipBody(text)}`,
      );
      return parsed as T;
    } catch (error) {
      lastError = error;
      console.info(
        `[llm] schema=${schemaName} promptChars=${promptChars} ms=${Date.now() - started} ok=false attempt=${attempt}`,
      );
      if (attempt === 1 && error instanceof LlmJsonError) {
        continue;
      }
      if (attempt === 1 && isTransientLlmError(error)) {
        continue;
      }
      break;
    }
  }

  throw lastError instanceof Error ? lastError : new LlmJsonError("model failed to return JSON");
}
