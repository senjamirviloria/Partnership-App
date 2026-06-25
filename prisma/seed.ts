import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const prisma = new PrismaClient();

function stripOptionalQuotes(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function loadSeedSecretFile() {
  const secretFilePath = ".env.seed.local";
  if (!existsSync(secretFilePath)) {
    return;
  }

  const lines = readFileSync(secretFilePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = stripOptionalQuotes(trimmed.slice(separatorIndex + 1));
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getRequiredSeedValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required seed value ${name}. Add it to .env.seed.local or export it before running db:seed.`);
  }
  return value;
}

loadSeedSecretFile();

const DEFAULT_ADMIN_EMAIL = getRequiredSeedValue("DEFAULT_ADMIN_EMAIL").toLowerCase();
const DEFAULT_ADMIN_USERNAME = getRequiredSeedValue("DEFAULT_ADMIN_USERNAME");
const DEFAULT_ADMIN_NAME = getRequiredSeedValue("DEFAULT_ADMIN_NAME");
const DEFAULT_ADMIN_PASSWORD = getRequiredSeedValue("DEFAULT_ADMIN_PASSWORD");
const DEFAULT_DTAQ_EMAIL = getRequiredSeedValue("DEFAULT_DTAQ_EMAIL").toLowerCase();
const DEFAULT_DTAQ_USERNAME = getRequiredSeedValue("DEFAULT_DTAQ_USERNAME");
const DEFAULT_DTAQ_NAME = getRequiredSeedValue("DEFAULT_DTAQ_NAME");
const DEFAULT_DTAQ_PASSWORD = getRequiredSeedValue("DEFAULT_DTAQ_PASSWORD");
const SEED_USER_EMAIL = getRequiredSeedValue("SEED_USER_EMAIL").toLowerCase();
const SEED_USER_USERNAME = getRequiredSeedValue("SEED_USER_USERNAME");
const SEED_USER_NAME = getRequiredSeedValue("SEED_USER_NAME");
const SEED_USER_PASSWORD = getRequiredSeedValue("SEED_USER_PASSWORD");
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL?.trim() || "superadmin@email.local.com").toLowerCase();
const SUPER_ADMIN_USERNAME = process.env.SUPER_ADMIN_USERNAME?.trim() || "superadmin";
const SUPER_ADMIN_NAME = process.env.SUPER_ADMIN_NAME?.trim() || "Super Admin";
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD?.trim() || "superAdmindtaq1914";

type TerritorySeed = {
  territoryName: string;
  locations: string;
  noOfPartners: number;
  withCars: boolean;
};

type AreaSeed = {
  areaName: string;
  description: string;
  territories: TerritorySeed[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`SEED_AREAS_JSON_FILE contains invalid ${path}; expected a non-empty string.`);
  }

  return value;
}

function requireNumber(value: unknown, path: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`SEED_AREAS_JSON_FILE contains invalid ${path}; expected a number.`);
  }

  return value;
}

function requireBoolean(value: unknown, path: string) {
  if (typeof value !== "boolean") {
    throw new Error(`SEED_AREAS_JSON_FILE contains invalid ${path}; expected a boolean.`);
  }

  return value;
}

function parseTerritorySeed(value: unknown, areaIndex: number, territoryIndex: number): TerritorySeed {
  const path = `area[${areaIndex}].territories[${territoryIndex}]`;
  if (!isRecord(value)) {
    throw new Error(`SEED_AREAS_JSON_FILE contains invalid ${path}; expected an object.`);
  }

  return {
    territoryName: requireString(value.territoryName, `${path}.territoryName`),
    locations: requireString(value.locations, `${path}.locations`),
    noOfPartners: requireNumber(value.noOfPartners, `${path}.noOfPartners`),
    withCars: requireBoolean(value.withCars, `${path}.withCars`),
  };
}

function parseAreaSeed(value: unknown, areaIndex: number): AreaSeed {
  const path = `area[${areaIndex}]`;
  if (!isRecord(value)) {
    throw new Error(`SEED_AREAS_JSON_FILE contains invalid ${path}; expected an object.`);
  }

  if (!Array.isArray(value.territories)) {
    throw new Error(`SEED_AREAS_JSON_FILE contains invalid ${path}.territories; expected an array.`);
  }

  return {
    areaName: requireString(value.areaName, `${path}.areaName`),
    description: requireString(value.description, `${path}.description`),
    territories: value.territories.map((territory, territoryIndex) =>
      parseTerritorySeed(territory, areaIndex, territoryIndex),
    ),
  };
}

function loadSeedAreas(filePathValue: string): AreaSeed[] {
  const seedAreasPath = isAbsolute(filePathValue) ? filePathValue : resolve(filePathValue);
  if (!existsSync(seedAreasPath)) {
    throw new Error(`Missing territory seed file from SEED_AREAS_JSON_FILE: ${seedAreasPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(seedAreasPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to parse SEED_AREAS_JSON_FILE at ${seedAreasPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("SEED_AREAS_JSON_FILE must contain a JSON array of areas.");
  }

  return parsed.map((area, areaIndex) => parseAreaSeed(area, areaIndex));
}

const seedData = loadSeedAreas(getRequiredSeedValue("SEED_AREAS_JSON_FILE"));

async function ensureCredentialUser({
  email,
  username,
  name,
  password,
  role = "user",
}: {
  email: string;
  username: string;
  name: string;
  password: string;
  role?: "user" | "super_admin";
}) {
  const user = await prisma.user.upsert({
    where: {
      email,
    },
    update: {
      username,
      name,
      role,
      emailVerified: true,
    },
    create: {
      email,
      username,
      name,
      role,
      emailVerified: true,
    },
  });

  const passwordHash = await hashPassword(password);
  const credentialAccount = await prisma.account.findFirst({
    where: {
      userId: user.id,
      providerId: "credential",
    },
  });

  if (credentialAccount) {
    await prisma.account.update({
      where: {
        id: credentialAccount.id,
      },
      data: {
        accountId: user.id,
        password: passwordHash,
      },
    });
  } else {
    await prisma.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: passwordHash,
      },
    });
  }
}

async function ensureDefaultAdmin() {
  await ensureCredentialUser({
    email: DEFAULT_ADMIN_EMAIL,
    username: DEFAULT_ADMIN_USERNAME,
    name: DEFAULT_ADMIN_NAME,
    password: DEFAULT_ADMIN_PASSWORD,
  });
}

async function ensureDefaultDtaqUser() {
  await ensureCredentialUser({
    email: DEFAULT_DTAQ_EMAIL,
    username: DEFAULT_DTAQ_USERNAME,
    name: DEFAULT_DTAQ_NAME,
    password: DEFAULT_DTAQ_PASSWORD,
  });
}

async function ensureSeedUser() {
  await ensureCredentialUser({
    email: SEED_USER_EMAIL,
    username: SEED_USER_USERNAME,
    name: SEED_USER_NAME,
    password: SEED_USER_PASSWORD,
  });
}

async function ensureSuperAdmin() {
  await ensureCredentialUser({
    email: SUPER_ADMIN_EMAIL,
    username: SUPER_ADMIN_USERNAME,
    name: SUPER_ADMIN_NAME,
    password: SUPER_ADMIN_PASSWORD,
    role: "super_admin",
  });
}

async function main() {
  await ensureSuperAdmin();
  await ensureDefaultAdmin();
  await ensureDefaultDtaqUser();
  await ensureSeedUser();

  for (const areaSeed of seedData) {
    const area = await prisma.area.upsert({
      where: {
        areaName: areaSeed.areaName,
      },
      update: {
        description: areaSeed.description,
      },
      create: {
        areaName: areaSeed.areaName,
        description: areaSeed.description,
      },
    });

    for (const territory of areaSeed.territories) {
      await prisma.territory.upsert({
        where: {
          areaId_territoryName: {
            areaId: area.id,
            territoryName: territory.territoryName,
          },
        },
        update: {
          locations: territory.locations,
          noOfPartners: territory.noOfPartners,
          withCars: territory.withCars,
        },
        create: {
          territoryName: territory.territoryName,
          areaId: area.id,
          locations: territory.locations,
          noOfPartners: territory.noOfPartners,
          withCars: territory.withCars,
        },
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seeding failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
