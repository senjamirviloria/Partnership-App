import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const requireUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) redirect("/login");
  return user;
});

export const requireAdmin = async () => {
  const user = await requireUser();
  if (user.role !== "super_admin") redirect("/workspace");
  return user;
};
