export function nextInboxSelection(input: {
  selectedId: string | null;
  conversationIds: string[];
  autoSelectFirst: boolean;
  keepSelectedIfMissing?: boolean;
}): string | null {
  if (input.selectedId && input.conversationIds.includes(input.selectedId)) {
    return input.selectedId;
  }
  if (input.selectedId && input.keepSelectedIfMissing) {
    return input.selectedId;
  }
  if (input.autoSelectFirst) {
    return input.conversationIds[0] ?? null;
  }
  return null;
}
