import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { getSessionFromCookies } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { InboxView } from "./inbox-view";

type InboxPageProps = {
  searchParams: Promise<{ manager?: string; conversation?: string }>;
};

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const pollSeconds = Number(process.env.INBOX_POLL_SECONDS ?? "5");
  const requestedCode = params.manager?.trim();
  let managerCode: string | undefined;
  let managerName: string | undefined;
  if (session.role === "chief" && requestedCode) {
    const manager = await prisma.user.findUnique({
      where: { code: requestedCode },
      select: { name: true, role: true, code: true },
    });
    if (manager?.role === "manager") {
      managerCode = manager.code;
      managerName = manager.name;
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader name={session.name} role={session.role} />
      <InboxView
        role={session.role}
        pollSeconds={Number.isFinite(pollSeconds) && pollSeconds > 0 ? pollSeconds : 5}
        managerCode={managerCode}
        managerName={managerName}
        initialConversationId={params.conversation}
      />
    </div>
  );
}
