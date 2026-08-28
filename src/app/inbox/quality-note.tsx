import type { InboxNoteDto } from "@/lib/inbox";
import { ThreadDeleteButton } from "./delete-confirm";

function formatScore(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function ScorePill({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="rounded-md border border-primary/35 bg-background/30 px-2 py-0.5 text-xs text-foreground">
      {label} {formatScore(value)}
    </span>
  );
}

export function QualityNoteCard({
  note,
  canDelete,
  onDelete,
}: {
  note: InboxNoteDto;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  return (
    <article className="w-full rounded-xl border border-primary/45 bg-primary/12 px-4 py-3 shadow-[inset_0_1px_0_oklch(0.78_0.12_75_/_0.12)]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-sm">{note.title}</h3>
        <span className="rounded-full border border-primary/50 bg-background/40 px-2 py-0.5 text-[11px] tracking-wide text-primary">
          Только для сотрудников
        </span>
        {canDelete ? (
          <span className="ml-auto">
            <ThreadDeleteButton label="Удалить подсказку" onClick={() => onDelete?.()} />
          </span>
        ) : null}
      </div>
      {note.body ? <p className="whitespace-pre-wrap text-sm">{note.body}</p> : null}
      {note.issues.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {note.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <ScorePill label="Грамотность" value={note.literacy} />
        <ScorePill label="Орфография" value={note.spelling} />
        <ScorePill label="Пунктуация" value={note.punctuation} />
        <ScorePill label="Стиль" value={note.businessStyle} />
        <ScorePill label="Итого" value={note.overall} />
      </div>
    </article>
  );
}
