import type { PrismaClient, UserRole } from "@prisma/client";

export type SeedUser = {
  code: string;
  name: string;
  role: UserRole;
  email: string | null;
};

export const SEED_USERS: SeedUser[] = [
  {
    code: "M36",
    name: "Анна Соколова",
    role: "manager",
    email: "communicationassistant36@gmail.com",
  },
  {
    code: "M52",
    name: "Дмитрий Орлов",
    role: "manager",
    email: "communicationassistant52@gmail.com",
  },
  {
    code: "M65",
    name: "Елена Волкова",
    role: "manager",
    email: "communicationassistant65@gmail.com",
  },
  {
    code: "CHIEF",
    name: "Игорь Белов",
    role: "chief",
    email: null,
  },
];

export async function seedUsers(prisma: PrismaClient): Promise<void> {
  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { code: user.code },
      create: user,
      update: {
        name: user.name,
        role: user.role,
        email: user.email,
      },
    });
  }
}
