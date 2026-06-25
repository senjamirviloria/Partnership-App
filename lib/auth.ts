import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "@/lib/prisma";

function normalizeOrigin(value: string) {
  const trimmed = value.trim().replace(/^['"]+|['"]+$/g, "");
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function getTrustedOrigins() {
  const explicit = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter((origin) => origin.length > 0);

  const defaults = [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    "http://localhost:3101",
    "https://partnership_app-senjamirv.as2.pitunnel.net",
  ]
    .filter((origin): origin is string => Boolean(origin))
    .map((origin) => normalizeOrigin(origin));

  return Array.from(new Set([...explicit, ...defaults]));
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "mysql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      username: {
        type: "string",
        required: true,
        unique: true,
      },
    },
  },
  trustedOrigins: getTrustedOrigins(),
});
