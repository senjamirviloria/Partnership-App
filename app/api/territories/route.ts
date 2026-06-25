import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptTerritoryPayloadForUser } from "@/lib/territory-transport";

function sortZoomTerritoriesNaturally<
  T extends {
    areaName: string;
    territories: { territoryName: string }[];
  },
>(areas: T[]) {
  return areas.map((area) => {
    if (area.areaName !== "ZOOM Meetings") {
      return area;
    }

    return {
      ...area,
      territories: [...area.territories].sort((left, right) =>
        left.territoryName.localeCompare(right.territoryName, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    };
  });
}

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const areas = await prisma.area.findMany({
    orderBy: {
      areaName: "asc",
    },
    include: {
      territories: {
        orderBy: {
          territoryName: "asc",
        },
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
  const sortedAreas = sortZoomTerritoriesNaturally(areas);

  const encryptedPayload = encryptTerritoryPayloadForUser(session.user.id, { areas: sortedAreas });

  return NextResponse.json(
    {
      payload: encryptedPayload,
      encryptionUserId: session.user.id,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    },
  );
}
