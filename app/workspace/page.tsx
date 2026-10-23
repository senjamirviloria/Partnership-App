import { requireUser } from "@/lib/current-user";
import { AppShell } from "@/components/app-shell";
import { TerritoryAssignmentBoard } from "@/components/territory-assignment-board";

const WorkspacePage = async () => {
  const user = await requireUser();
  return (
    <AppShell tutorialEnabled={process.env.ENABLE_ONBOARDING_TUTORIAL === "true"} user={user}>
      <TerritoryAssignmentBoard
        currentUserId={user.id}
        currentUserName={user.name}
      />
    </AppShell>
  );
};
export default WorkspacePage;
