import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { getSessionFromCookies } from "@/lib/auth-server";
import { InboxView } from "./inbox-view";

export default async function InboxPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }

  const pollSeconds = Number(process.env.INBOX_POLL_SECONDS ?? "5");

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader name={session.name} role={session.role} />
      <InboxView
        role={session.role}
        pollSeconds={Number.isFinite(pollSeconds) && pollSeconds > 0 ? pollSeconds : 5}
      />
    </div>
  );
}
