export function normalizeMessageId(raw: string): string {
  return raw.trim().replace(/^<|>$/g, "").toLowerCase();
}

export function messageIdVariants(raw: string): string[] {
  const normalized = normalizeMessageId(raw);
  if (!normalized) {
    return [];
  }
  const bracketed = `<${normalized}>`;
  return Array.from(new Set([raw.trim(), normalized, bracketed]));
}
