import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SuperAdminPanel } from "@/components/super-admin-panel";
import { TerritoryAssignmentBoard } from "@/components/territory-assignment-board";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  const isSuperAdmin = currentUser?.role === "super_admin";
  const [adminAreas, adminUsers] = isSuperAdmin
    ? await Promise.all([
        prisma.area.findMany({
          orderBy: { areaName: "asc" },
          select: {
            id: true,
            areaName: true,
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
        }),
        prisma.user.findMany({
          orderBy: [{ role: "asc" }, { name: "asc" }],
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            role: true,
          },
        }),
      ])
    : [[], []];

  return (
    <>
      {isSuperAdmin && <SuperAdminPanel areas={adminAreas} users={adminUsers} />}
      <TerritoryAssignmentBoard
        currentUserId={session.user.id}
        currentUserName={session.user.name ?? session.user.email}
      />
    </>
  );
}
