import { PrismaClient } from "@prisma/client";
import { hashPasswordForStorage } from "../lib/password-storage";

/** Reset only the explicitly named, local disposable database used by browser tests. */
const seedUiCheck = async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/partnership_ui_check"
  ) {
    throw new Error(
      "Browser fixtures require a local database named partnership_ui_check.",
    );
  }
  const prisma = new PrismaClient();
  try {
    await prisma.user.deleteMany();
    await prisma.area.deleteMany();
    const password = await hashPasswordForStorage("UiCheckPassword123!");
    for (const [id, name, role] of [
      ["ui-admin", "UI Admin", "super_admin"],
      ["ui-user", "UI User", "user"],
      ["ui-other", "Other User", "user"],
    ]) {
      await prisma.user.create({
        data: {
          id,
          name,
          role,
          username: id,
          email: `${id}@example.test`,
          emailVerified: true,
          accounts: {
            create: {
              id: `${id}-account`,
              providerId: "credential",
              accountId: id,
              password,
            },
          },
        },
      });
    }
    for (let index = 1; index <= 12; index += 1) {
      const suffix = String(index).padStart(2, "0");
      await prisma.user.create({
        data: {
          id: `ui-list-${suffix}`,
          name: `Directory User ${suffix}`,
          username: `ui-list-${suffix}`,
          email: `ui-list-${suffix}@example.test`,
        },
      });
    }
    for (const areaName of [
      "DTAQ 1",
      "DTAQ 2",
      "Street Witnessing",
      "ZOOM Meetings",
    ]) {
      await prisma.area.create({
        data: {
          areaName,
          description: "Isolated UI test fixture",
          territories: {
            create: [
              {
                territoryName: "A",
                locations: "Stadium Metro Station",
                noOfPartners: 1,
              },
              {
                territoryName: "B",
                locations: "Al Nahda",
                noOfPartners: 2,
                withCars: true,
              },
            ],
          },
        },
      });
    }
    console.log("Disposable browser-test fixtures reset.");
  } finally {
    await prisma.$disconnect();
  }
};

void seedUiCheck();
