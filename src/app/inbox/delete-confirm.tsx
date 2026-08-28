import { Button } from "@/components/ui/button";

export function ThreadDeleteButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span aria-hidden className="text-base leading-none">
        ×
      </span>
    </button>
  );
}

export function DeleteConfirmDialog({
  title,
  body,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4"
      role="presentation"
      onClick={() => {
        if (!busy) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="delete-confirm-title" className="font-heading text-base tracking-tight">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            Отмена
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy ? "Удаляю…" : "Удалить"}
          </Button>
        </div>
      </div>
    </div>
  );
}
