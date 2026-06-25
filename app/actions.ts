"use server";

import { AssigneeGender } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SubmittedAssignments = Record<number, string[]>;
type BoardSlotAssignments = Record<number, string[][]>;

type SubmittedAssignee = {
  id: string;
  name: string;
  gender: "male" | "female";
};

type SaveBoardStateInput = {
  selectedTerritories: number[];
  slotAssignmentsByTerritory: BoardSlotAssignments;
  assignees: SubmittedAssignee[];
};

function normalizeGender(value: unknown): AssigneeGender {
  return value === "female" ? AssigneeGender.female : AssigneeGender.male;
}

function normalizeAssignees(assignees: SubmittedAssignee[]) {
  const byId = new Map<string, SubmittedAssignee>();

  for (const assignee of assignees) {
    if (!assignee || typeof assignee.id !== "string" || typeof assignee.name !== "string") {
      continue;
    }

    const id = assignee.id.trim();
    const name = assignee.name.trim();
    if (!id || !name) {
      continue;
    }

    byId.set(id, {
      id,
      name,
      gender: assignee.gender === "female" ? "female" : "male",
    });
  }

  return Array.from(byId.values());
}

function normalizeTerritoryIds(territoryIds: number[]) {
  return [...new Set(territoryIds)].filter((id) => Number.isInteger(id) && id > 0);
}

async function getCurrentUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user?.id ?? null;
}

export async function loadBoardState() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false as const, message: "You must be logged in to load assignments." };
  }

  const [assignees, selectedTerritories, slotAssignments] = await Promise.all([
    prisma.assignee.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        gender: true,
      },
    }),
    prisma.selectedTerritory.findMany({
      where: { userId },
      orderBy: { territoryId: "asc" },
      select: {
        territoryId: true,
      },
    }),
    prisma.slotAssignment.findMany({
      where: { userId },
      orderBy: [{ territoryId: "asc" }, { slotNumber: "asc" }, { position: "asc" }],
      select: {
        territoryId: true,
        slotNumber: true,
        assigneeId: true,
      },
    }),
  ]);

  const slotAssignmentsByTerritory: BoardSlotAssignments = {};
  for (const assignment of slotAssignments) {
    const slotIndex = assignment.slotNumber - 1;
    if (slotIndex < 0) {
      continue;
    }

    slotAssignmentsByTerritory[assignment.territoryId] ??= [];
    slotAssignmentsByTerritory[assignment.territoryId][slotIndex] ??= [];
    slotAssignmentsByTerritory[assignment.territoryId][slotIndex].push(assignment.assigneeId);
  }

  return {
    ok: true as const,
    state: {
      selectedTerritories: selectedTerritories.map((item) => item.territoryId),
      slotAssignmentsByTerritory,
      assignees: assignees.map((assignee) => ({
        ...assignee,
        gender: assignee.gender === AssigneeGender.female ? "female" : "male",
      })),
    },
  };
}

export async function saveBoardState(input: SaveBoardStateInput) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, message: "You must be logged in to save assignments." };
  }

  const assignees = normalizeAssignees(input.assignees ?? []);
  const assigneeIds = assignees.map((assignee) => assignee.id);
  const assigneeIdSet = new Set(assigneeIds);
  const selectedTerritoryIds = normalizeTerritoryIds(input.selectedTerritories ?? []);
  const selectedTerritoryIdSet = new Set(selectedTerritoryIds);
  const submittedTerritoryIds = normalizeTerritoryIds([
    ...selectedTerritoryIds,
    ...Object.keys(input.slotAssignmentsByTerritory ?? {}).map(Number),
  ]);

  const territories = await prisma.territory.findMany({
    where: {
      id: {
        in: submittedTerritoryIds,
      },
    },
    select: {
      id: true,
      noOfPartners: true,
    },
  });
  const territoryMap = new Map(territories.map((territory) => [territory.id, territory]));
  const validSelectedTerritoryIds = selectedTerritoryIds.filter((territoryId) => territoryMap.has(territoryId));

  const slotRows: Array<{
    territoryId: number;
    slotNumber: number;
    position: number;
    assigneeId: string;
  }> = [];
  const assignedAssigneeIds = new Set<string>();

  for (const [territoryIdText, submittedSlots] of Object.entries(input.slotAssignmentsByTerritory ?? {})) {
    const territoryId = Number(territoryIdText);
    const territory = territoryMap.get(territoryId);
    if (!territory || !selectedTerritoryIdSet.has(territoryId) || !Array.isArray(submittedSlots)) {
      continue;
    }

    const maxSlots = Math.max(territory.noOfPartners ?? 0, 0);
    for (let slotIndex = 0; slotIndex < maxSlots; slotIndex += 1) {
      const submittedAssigneeIds = submittedSlots[slotIndex];
      if (!Array.isArray(submittedAssigneeIds)) {
        continue;
      }

      let position = 0;
      for (const assigneeId of submittedAssigneeIds) {
        if (
          typeof assigneeId !== "string" ||
          !assigneeIdSet.has(assigneeId) ||
          assignedAssigneeIds.has(assigneeId)
        ) {
          continue;
        }

        assignedAssigneeIds.add(assigneeId);
        slotRows.push({
          territoryId,
          slotNumber: slotIndex + 1,
          position,
          assigneeId,
        });
        position += 1;
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.slotAssignment.deleteMany({
      where: { userId },
    });

    await tx.selectedTerritory.deleteMany({
      where: { userId },
    });

    await tx.assignee.deleteMany({
      where: {
        userId,
        id: {
          notIn: assigneeIds.length > 0 ? assigneeIds : [""],
        },
      },
    });

    const ownedAssignees = await tx.assignee.findMany({
      where: {
        userId,
        id: {
          in: assigneeIds,
        },
      },
      select: {
        id: true,
      },
    });
    const ownedAssigneeIds = new Set(ownedAssignees.map((assignee) => assignee.id));

    for (const assignee of assignees) {
      const data = {
        name: assignee.name,
        gender: normalizeGender(assignee.gender),
      };

      if (ownedAssigneeIds.has(assignee.id)) {
        await tx.assignee.update({
          where: { id: assignee.id },
          data,
        });
      } else {
        await tx.assignee.create({
          data: {
            id: assignee.id,
            userId,
            ...data,
          },
        });
      }
    }

    for (const territoryId of validSelectedTerritoryIds) {
      await tx.selectedTerritory.create({
        data: {
          userId,
          territoryId,
        },
      });
    }

    for (const row of slotRows) {
      await tx.slotAssignment.create({
        data: {
          userId,
          ...row,
        },
      });
    }
  });

  revalidatePath("/");
  return { ok: true, message: "Saved to database." };
}

export async function savePartnerAssignments(
  selectedTerritoryIds: number[],
  assignmentsByTerritory: SubmittedAssignments,
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return { ok: false, message: "You must be logged in to save assignments." };
  }

  const uniqueTerritoryIds = [...new Set(selectedTerritoryIds)].filter((id) => Number.isInteger(id) && id > 0);

  const territories = await prisma.territory.findMany({
    where: {
      id: {
        in: uniqueTerritoryIds,
      },
    },
    select: {
      id: true,
      noOfPartners: true,
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.partnerAssignment.deleteMany({
      where: {
        assignedById: session.user.id,
        territoryId: {
          notIn: uniqueTerritoryIds.length > 0 ? uniqueTerritoryIds : [0],
        },
      },
    });

    for (const territory of territories) {
      const maxSlots = Math.max(territory.noOfPartners ?? 0, 0);
      const submittedSlots = assignmentsByTerritory[territory.id] ?? [];

      for (let index = 0; index < maxSlots; index += 1) {
        const slotNumber = index + 1;
        const submittedPair = (submittedSlots[index] ?? "").trim();
        const existing = await tx.partnerAssignment.findUnique({
          where: {
            territoryId_slotNumber: {
              territoryId: territory.id,
              slotNumber,
            },
          },
        });

        if (!submittedPair) {
          if (existing && existing.assignedById === session.user.id) {
            await tx.partnerAssignment.delete({
              where: { id: existing.id },
            });
          }
          continue;
        }

        if (existing && existing.assignedById !== session.user.id) {
          throw new Error(`Territory slot ${territory.id}-${slotNumber} is already assigned.`);
        }

        if (existing) {
          await tx.partnerAssignment.update({
            where: { id: existing.id },
            data: {
              partnerPair: submittedPair,
            },
          });
        } else {
          await tx.partnerAssignment.create({
            data: {
              territoryId: territory.id,
              slotNumber,
              partnerPair: submittedPair,
              assignedById: session.user.id,
            },
          });
        }
      }
    }
  });

  revalidatePath("/");
  return { ok: true, message: "Assignments saved." };
}
