import type { InboxSnapshotDto } from "./inbox";

const LOAD_ERROR = "Не удалось обновить ленту";

export function inboxSnapshotQuery(input: {
  selectedId?: string | null;
  managerCode?: string;
}): string {
  const params = new URLSearchParams();
  if (input.selectedId) {
    params.set("conversationId", input.selectedId);
  }
  if (input.managerCode) {
    params.set("manager", input.managerCode);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fetchInboxSnapshot(
  fetchFn: typeof fetch,
  query: string,
): Promise<{ ok: true; snapshot: InboxSnapshotDto } | { ok: false; error: string }> {
  try {
    const response = await fetchFn(`/api/inbox/snapshot${query}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error ?? LOAD_ERROR };
    }
    return { ok: true, snapshot: (await response.json()) as InboxSnapshotDto };
  } catch {
    return { ok: false, error: LOAD_ERROR };
  }
}
