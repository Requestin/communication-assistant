const THREAD_PREFIX =
  /^(re|fw|fwd|aw|sv|отв|ответ|пересл)(\[\d+\])?\s*:\s*/i;

export function conversationThreadKey(subject: string): string {
  let text = subject.trim().toLowerCase().replace(/ё/g, "е");
  for (let i = 0; i < 8; i += 1) {
    const next = text.replace(THREAD_PREFIX, "").trim();
    if (next === text) {
      break;
    }
    text = next;
  }
  text = text.replace(/\s+/g, " ").trim();
  return text || "(без темы)";
}
