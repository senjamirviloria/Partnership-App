"use server";

import { hashPassword } from "better-auth/crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const USER_ROLES = new Set(["user", "super_admin"]);

async function requireSuperAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error("You must be logged in.");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (user?.role !== "super_admin") {
    throw new Error("Only super admins can perform this action.");
  }

  return session.user.id;
}

function getRequiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
}

function getOptionalText(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getPositiveInteger(formData: FormData, key: string) {
  const parsed = Number(getRequiredText(formData, key));
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive whole number.`);
  }
  return parsed;
}

function getNonNegativeInteger(formData: FormData, key: string) {
  const parsed = Number(getRequiredText(formData, key));
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${key} must be zero or a positive whole number.`);
  }
  return parsed;
}

function normalizeRole(value: string) {
  return USER_ROLES.has(value) ? value : "user";
}

export async function createDatabaseUser(formData: FormData) {
  await requireSuperAdmin();

  const email = getRequiredText(formData, "email").toLowerCase();
  const username = getRequiredText(formData, "username");
  const name = getRequiredText(formData, "name");
  const password = getRequiredText(formData, "password");
  const role = normalizeRole(getRequiredText(formData, "role"));
  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        username,
        name,
        role,
        emailVerified: true,
      },
    });

    await tx.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: passwordHash,
      },
    });
  });

  revalidatePath("/");
  return { ok: true, message: "User created." };
}

async function assertCanRemoveSuperAdminRole(userId: string) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (target?.role !== "super_admin") {
    return;
  }

  const superAdminCount = await prisma.user.count({
    where: { role: "super_admin" },
  });

  if (superAdminCount <= 1) {
    throw new Error("At least one super admin must remain.");
  }
}

export async function updateDatabaseUser(formData: FormData) {
  const currentUserId = await requireSuperAdmin();

  const userId = getRequiredText(formData, "userId");
  const email = getRequiredText(formData, "email").toLowerCase();
  const username = getRequiredText(formData, "username");
  const name = getRequiredText(formData, "name");
  const role = normalizeRole(getRequiredText(formData, "role"));
  const password = getOptionalText(formData, "password");

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!target) {
    throw new Error("User not found.");
  }

  if (target.role === "super_admin" && role !== "super_admin") {
    await assertCanRemoveSuperAdminRole(userId);
  }

  const passwordHash = password ? await hashPassword(password) : null;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        email,
        username,
        name,
        role,
      },
    });

    if (!passwordHash) {
      return;
    }

    const credentialAccount = await tx.account.findFirst({
      where: {
        userId,
        providerId: "credential",
      },
      select: { id: true },
    });

    if (credentialAccount) {
      await tx.account.update({
        where: { id: credentialAccount.id },
        data: { password: passwordHash },
      });
      return;
    }

    await tx.account.create({
      data: {
        userId,
        providerId: "credential",
        accountId: userId,
        password: passwordHash,
      },
    });
  });

  if (currentUserId === userId && role !== "super_admin") {
    revalidatePath("/");
    return { ok: true, message: "User updated. This account is no longer a super admin." };
  }

  revalidatePath("/");
  return { ok: true, message: "User updated." };
}

export async function deleteDatabaseUser(formData: FormData) {
  const currentUserId = await requireSuperAdmin();
  const userId = getRequiredText(formData, "userId");

  if (userId === currentUserId) {
    throw new Error("You cannot delete your own account.");
  }

  await assertCanRemoveSuperAdminRole(userId);

  await prisma.user.delete({
    where: { id: userId },
  });

  revalidatePath("/");
  return { ok: true, message: "User deleted." };
}

export async function createArea(formData: FormData) {
  await requireSuperAdmin();

  const areaName = getRequiredText(formData, "areaName");
  const description = getOptionalText(formData, "description");

  await prisma.area.create({
    data: {
      areaName,
      description,
    },
  });

  revalidatePath("/");
  revalidatePath("/api/territories");
  return { ok: true, message: "Area added." };
}

export async function updateTerritory(formData: FormData) {
  await requireSuperAdmin();

  const id = getPositiveInteger(formData, "territoryId");
  const territoryName = getRequiredText(formData, "territoryName");
  const locations = getOptionalText(formData, "locations");
  const noOfPartners = getNonNegativeInteger(formData, "noOfPartners");
  const withCars = formData.get("withCars") === "on";

  await prisma.territory.update({
    where: { id },
    data: {
      territoryName,
      locations,
      noOfPartners,
      withCars,
    },
  });

  revalidatePath("/");
  revalidatePath("/api/territories");
  return { ok: true, message: "Territory updated." };
}

export async function createTerritory(formData: FormData) {
  await requireSuperAdmin();

  const areaId = getPositiveInteger(formData, "areaId");
  const territoryName = getRequiredText(formData, "territoryName");
  const locations = getOptionalText(formData, "locations");
  const noOfPartners = getNonNegativeInteger(formData, "noOfPartners");
  const withCars = formData.get("withCars") === "on";

  await prisma.territory.create({
    data: {
      areaId,
      territoryName,
      locations,
      noOfPartners,
      withCars,
    },
  });

  revalidatePath("/");
  revalidatePath("/api/territories");
  return { ok: true, message: "Territory added." };
}
