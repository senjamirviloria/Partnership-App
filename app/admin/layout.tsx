import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/current-user";
import { AppShell } from "@/components/app-shell";

const AdminLayout = async ({ children }: { children: ReactNode }) => {
  const user = await requireAdmin();
  return (
    <AppShell tutorialEnabled={process.env.ENABLE_ONBOARDING_TUTORIAL === "true"} user={user} admin>
      <main>{children}</main>
    </AppShell>
  );
};
export default AdminLayout;
