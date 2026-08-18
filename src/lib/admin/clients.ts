import type { PrismaClient } from "@prisma/client";

export type AdminConversationDto = {
  id: string;
  subject: string;
  lastMessageAt: string;
};

export type AdminClientRow = {
  id: string;
  displayName: string;
  email: string;
  conversations: AdminConversationDto[];
};

export type AdminManagerClientsPayload = {
  manager: { id: string; name: string; code: string };
  clients: AdminClientRow[];
};

export async function listManagerClients(
  prisma: PrismaClient,
  managerId: string,
): Promise<AdminManagerClientsPayload | null> {
  const manager = await prisma.user.findUnique({
    where: { id: managerId },
    select: { id: true, name: true, code: true, role: true },
  });
  if (!manager || manager.role !== "manager") {
    return null;
  }

  const clients = await prisma.client.findMany({
    where: { managerId },
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      displayName: true,
      email: true,
      conversations: {
        orderBy: { lastMessageAt: "desc" },
        select: { id: true, subject: true, lastMessageAt: true },
      },
    },
  });

  return {
    manager: { id: manager.id, name: manager.name, code: manager.code },
    clients: clients.map((client) => ({
      id: client.id,
      displayName: client.displayName,
      email: client.email,
      conversations: client.conversations.map((item) => ({
        id: item.id,
        subject: item.subject,
        lastMessageAt: item.lastMessageAt.toISOString(),
      })),
    })),
  };
}
