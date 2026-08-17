import { describe, expect, it } from "vitest";
import { SEED_USERS } from "./seed-users";

describe("SEED_USERS", () => {
  it("contains exactly four demo users with expected codes and roles", () => {
    expect(SEED_USERS).toHaveLength(4);

    const byCode = Object.fromEntries(SEED_USERS.map((user) => [user.code, user]));

    expect(byCode.M36).toMatchObject({
      name: "Анна Соколова",
      role: "manager",
      email: "communicationassistant36@gmail.com",
    });
    expect(byCode.M52).toMatchObject({
      name: "Дмитрий Орлов",
      role: "manager",
      email: "communicationassistant52@gmail.com",
    });
    expect(byCode.M65).toMatchObject({
      name: "Елена Волкова",
      role: "manager",
      email: "communicationassistant65@gmail.com",
    });
    expect(byCode.CHIEF).toMatchObject({
      name: "Игорь Белов",
      role: "chief",
      email: null,
    });
  });
});
