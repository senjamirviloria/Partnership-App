"use client";

import { usePathname, useRouter } from "next/navigation";
import { GuidedTutorial, type TutorialStep } from "./guided-tutorial";

const steps: TutorialStep[] = [
  { id: "counts", title: "Your admin overview", description: "These live counts show users, areas, territories, and territories requiring cars. Select a count to open its directory.", target: "[data-tutorial='admin-counts']" },
  { id: "navigation", title: "Manage the directory", description: "Use Users to manage accounts and roles, Areas to add areas, and Territories to edit locations, pair capacity, and car requirements. On smaller screens, open the navigation menu to find these pages.", target: ".sidebar nav, [data-tutorial='navigation-menu']" },
  { id: "directory", title: "Territories and locations", description: "Review the territory directory and use quick actions to add records when needed. In Territories, separate locations with a semicolon (;). Each location has its own Map link that opens a Google Maps search in a new tab.", target: "[data-tutorial='admin-directory']" },
  { id: "appearance", title: "Choose your appearance", description: "System follows your device automatically. Choose Light or Dark to keep your own preference.", target: ".theme-control" },
  { id: "workspace", title: "Try the assignment workspace", description: "Open user workspace from the sidebar or navigation menu to organise territory partners. Next, try a hands-on walkthrough using real workspace data. No admin records have been created by this introduction.", target: "[data-tutorial='workspace-switch'], [data-tutorial='navigation-menu']" },
];

export const AdminTutorial = () => {
  const pathname = usePathname();
  const router = useRouter();
  return <GuidedTutorial kind="admin" eligible={pathname === "/admin"} title="Welcome to Partnership administration" introduction="Take a short tour of your admin tools. This introduction explains the controls without creating accounts, areas, or territories. You can skip now and replay it from the question-mark button." steps={steps} finishLabel="Open workspace tutorial" onFinish={() => router.push("/workspace?tutorial=start")} />;
};
