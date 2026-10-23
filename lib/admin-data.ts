import { requireAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const loadAdminAreas = async () => {
  await requireAdmin();
  return prisma.area.findMany({
    orderBy: { areaName: "asc" },
    select: {
      id: true,
      areaName: true,
      description: true,
      territories: {
        orderBy: { territoryName: "asc" },
        select: {
          id: true,
          territoryName: true,
          locations: true,
          noOfPartners: true,
          withCars: true,
        },
      },
    },
  });
};

export type AdminArea = Awaited<ReturnType<typeof loadAdminAreas>>[number];
export type AdminTerritory = AdminArea["territories"][number];
export type AdminUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
};

export type AdminMode = "users" | "areas" | "territories";
export type TerritoryRow = AdminTerritory & { areaName: string };
export type AdminEditor =
  | { kind: "create" }
  | { kind: "user"; user: AdminUser }
  | { kind: "territory"; territory: TerritoryRow };
