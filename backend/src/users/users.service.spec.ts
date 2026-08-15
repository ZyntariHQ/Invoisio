import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "./users.service";

describe("UsersService notification preferences", () => {
  const preferences = new Map<string, boolean>([
    ["merchant-a-user", true],
    ["merchant-b-user", true],
  ]);

  const prisma = {
    user: {
      update: jest.fn(async ({ where, data }) => {
        if (!preferences.has(where.id)) throw new Error("Record not found");
        preferences.set(where.id, data.pushNotificationsEnabled);
        return { id: where.id, ...data };
      }),
      findUnique: jest.fn(async ({ where }) => {
        const value = preferences.get(where.id);
        return value === undefined ? null : { pushNotificationsEnabled: value };
      }),
    },
  };

  const service = new UsersService(prisma as unknown as PrismaService);

  beforeEach(() => {
    preferences.set("merchant-a-user", true);
    preferences.set("merchant-b-user", true);
    jest.clearAllMocks();
  });

  it("reads the persisted value after an update", async () => {
    await service.updatePreferences("merchant-a-user", false);

    await expect(service.getPreferences("merchant-a-user")).resolves.toEqual({
      pushNotificationsEnabled: false,
    });
  });

  it("scopes reads and updates to the authenticated merchant user", async () => {
    await service.updatePreferences("merchant-a-user", false);

    await expect(service.getPreferences("merchant-b-user")).resolves.toEqual({
      pushNotificationsEnabled: true,
    });
    expect(prisma.user.findUnique).toHaveBeenLastCalledWith({
      where: { id: "merchant-b-user" },
      select: { pushNotificationsEnabled: true },
    });
  });

  it("rejects preference reads for a missing user", async () => {
    await expect(service.getPreferences("missing-user")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
