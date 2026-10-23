import { requireAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { SuperAdminPanel } from "@/components/super-admin-panel";

const UsersPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) => {
  const current = await requireAdmin();
  const [users, params] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, username: true, email: true, role: true },
    }),
    searchParams,
  ]);
  return (
    <SuperAdminPanel
      mode="users"
      users={users}
      currentUserId={current.id}
      initiallyCreate={params.new === "1"}
    />
  );
};
export default UsersPage;
