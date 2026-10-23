"use client";

import { GuidedTutorial, type TutorialStep } from "./guided-tutorial";

export type WorkspaceTutorialState = {
  ready: boolean;
  hasUsableTerritories: boolean;
  hasSelectedTerritory: boolean;
  hasTwoAssignees: boolean;
  hasCompletePair: boolean;
  hasLocations: boolean;
  saved: boolean;
  saveFailed: boolean;
};

type Props = { state: WorkspaceTutorialState; onStep: (step: string) => void };

export const WorkspaceTutorial = ({ state, onStep }: Props) => {
  const steps: TutorialStep[] = [
    {
      id: "territories", title: "Choose a territory", target: "[data-tutorial='territory-picker']",
      description: "Expand an area and select a territory with at least one pair slot. Your existing selections also count. On mobile, the tabs switch between the three panels.",
      ready: state.hasSelectedTerritory, hint: "Select a territory that has at least one pair slot to continue.",
    },
    {
      id: "assignees", title: "Prepare two assignees", target: "[data-tutorial='assignee-create']",
      description: "Enter a real person's name, choose their gender, and select Create. Prepare at least two people, or use people already in your workspace. The Available filter hides people after they are assigned.",
      ready: state.hasTwoAssignees, hint: "Create or keep at least two assignees in your workspace.",
    },
    {
      id: "pairs", title: "Build a partner pair", target: "[data-tutorial='pair-workspace']",
      description: "Put two people together in a pair slot. Drag people on larger screens, tap an assignee to assign them, or use Add Existing Assignees. Assign Automatically in the Assignees panel is another option. Existing complete pairs count too.",
      ready: state.hasCompletePair, hint: "Assign exactly two people to one slot in a selected territory.",
    },
    {
      id: "maps", title: "Check the meeting location", target: "#panel-pairs .location-list, [data-tutorial='pair-workspace']",
      description: state.hasLocations
        ? "Each location has its own Map button. It searches Google Maps in a new tab without changing your assignments. Locations separated by a semicolon have separate links. Opening a map is optional for this tutorial."
        : "Your selected territories have no locations listed. An administrator can add them in Territories, separated by semicolons. Each location will get its own Google Maps search link. You can continue now.",
    },
    {
      id: "save", title: "Save your assignments", target: ".desktop-save, .mobile-save-bar",
      description: "Select Save assignments, then wait for All changes saved. A failed save keeps your edits so you can try again. Both save actions store the current board. An already-saved complete pair also satisfies this step.",
      ready: state.saved && state.hasCompletePair,
      hint: state.saveFailed ? "The save failed. Your edits are retained; select Save assignments to retry." : "Save a complete pair and wait for All changes saved.",
    },
  ];
  return <GuidedTutorial kind="workspace" eligible={state.ready} title="Try your first territory assignment" introduction="This is a hands-on tutorial using real workspace data. You will choose a territory, prepare two assignees, assign a pair, and save. Existing records count. Back and Skip do not undo your edits; unsaved changes remain yours to save. Replay this tutorial anytime using the question-mark button." canStart={state.hasUsableTerritories} unavailableMessage="There are no territories with pair slots yet. Ask an administrator to add a usable territory, then replay the tutorial. You can skip for now." steps={steps} onStep={onStep} />;
};
