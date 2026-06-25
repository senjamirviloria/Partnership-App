"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import Icon from "@mdi/react";
import {
  mdiFullscreen,
  mdiFullscreenExit,
  mdiHumanFemale,
  mdiHumanMale,
  mdiWeatherNight,
  mdiWhiteBalanceSunny,
} from "@mdi/js";

import { loadBoardState, saveBoardState } from "@/app/actions";
import { authClient } from "@/lib/auth-client";

type Territory = {
  id: number;
  territoryName: string;
  locations: string | null;
  noOfPartners: number | null;
  withCars: boolean;
};

type Area = {
  id: number;
  areaName: string;
  territories: Territory[];
};

type Gender = "male" | "female";

type Assignee = {
  id: string;
  name: string;
  gender: Gender;
};

type Props = {
  currentUserId: string;
  currentUserName: string;
};

type SlotAssignmentsByTerritory = Record<number, string[][]>;

type BoardState = {
  selectedTerritories: number[];
  slotAssignmentsByTerritory: SlotAssignmentsByTerritory;
  assignees: Assignee[];
};
type ExistingAssigneeTarget = {
  territoryId: number;
  slotIndex: number;
} | null;

type ExistingAssigneeFilter = "all" | "unassigned" | "assigned";
type MaximizedPanel = "territories" | "assignees" | "pairs" | null;

const TRANSPORT_SALT = "territory-api-transport-v1";
const TRANSPORT_ITERATIONS = 120000;
const THEME_STORAGE_KEY = "partnership_app:theme";

type EncryptedTerritoriesResponse = {
  payload: string;
  encryptionUserId?: string;
};

type DecryptedTerritoriesPayload = {
  areas: Area[];
};

function buildDefaultSlotAssignments(areas: Area[]): SlotAssignmentsByTerritory {
  const initial: SlotAssignmentsByTerritory = {};

  for (const territory of areas.flatMap((area) => area.territories)) {
    const maxSlots = Math.max(territory.noOfPartners ?? 0, 0);
    initial[territory.id] = Array.from({ length: maxSlots }, () => [] as string[]);
  }

  return initial;
}

function formatPairRequirement(noOfPartners: number | null, withCars: boolean) {
  const pairCount = noOfPartners ?? 0;
  const pairText = pairCount === 1 ? "pair" : "pairs";
  return withCars ? `${pairCount} ${pairText} with car` : `${pairCount} ${pairText}`;
}

function toSlotKey(territoryId: number, slotIndex: number) {
  return `${territoryId}:${slotIndex}`;
}

function normalizeSecret(secret: string) {
  return secret.trim().replace(/^['"]+|['"]+$/g, "");
}

function getTransportSecret() {
  const secret = process.env.NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY;
  const normalized = typeof secret === "string" ? normalizeSecret(secret) : "";
  if (!normalized) {
    throw new Error("Missing NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY.");
  }
  return normalized;
}

function formatLocations(locations: string | null) {
  if (!locations) return [];
  return locations
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveTransportKey(userId: string) {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(`${getTransportSecret()}:${userId}`),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(TRANSPORT_SALT),
      iterations: TRANSPORT_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["decrypt"],
  );
}

async function decryptTerritoryPayload(
  userId: string,
  raw: string,
): Promise<DecryptedTerritoriesPayload | null> {
  if (!raw.startsWith("enc:")) {
    try {
      return JSON.parse(raw) as DecryptedTerritoriesPayload;
    } catch {
      return null;
    }
  }

  if (!window.crypto?.subtle) {
    return null;
  }

  const packed = base64ToBytes(raw.slice(4));
  if (packed.length <= 28) {
    return null;
  }

  const iv = packed.slice(0, 12);
  const cipherAndTag = packed.slice(12);

  try {
    const key = await deriveTransportKey(userId);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipherAndTag,
    );

    const text = new TextDecoder().decode(decrypted);
    return JSON.parse(text) as DecryptedTerritoriesPayload;
  } catch {
    return null;
  }
}

function generateAssigneeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeGender(value: unknown): Gender {
  return value === "female" ? "female" : "male";
}

function toggleGender(gender: Gender): Gender {
  return gender === "male" ? "female" : "male";
}

export function TerritoryAssignmentBoard({
  currentUserId,
  currentUserName,
}: Props) {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [areas, setAreas] = useState<Area[]>([]);
  const [isLoadingAreas, setIsLoadingAreas] = useState(true);
  const [isLoadingBoard, setIsLoadingBoard] = useState(false);
  const [isSavingBoard, setIsSavingBoard] = useState(false);
  const [loadError, setLoadError] = useState<string>("");
  const [selectedTerritories, setSelectedTerritories] = useState<number[]>([]);
  const [openAreas, setOpenAreas] = useState<Record<number, boolean>>({});
  const [slotAssignmentsByTerritory, setSlotAssignmentsByTerritory] = useState<SlotAssignmentsByTerritory>({});
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [newAssigneeName, setNewAssigneeName] = useState("");
  const [newAssigneeGender, setNewAssigneeGender] = useState<Gender>("male");
  const [editingAssigneeId, setEditingAssigneeId] = useState<string | null>(null);
  const [editingAssigneeName, setEditingAssigneeName] = useState("");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null);
  const [selectedAssigneeIdsForBulkAssign, setSelectedAssigneeIdsForBulkAssign] = useState<string[]>([]);
  const [slotDraftNames, setSlotDraftNames] = useState<Record<string, string>>({});
  const [slotDraftGenders, setSlotDraftGenders] = useState<Record<string, Gender>>({});
  const [assignModalAssigneeIds, setAssignModalAssigneeIds] = useState<string[]>([]);
  const [existingAssigneeTarget, setExistingAssigneeTarget] = useState<ExistingAssigneeTarget>(null);
  const [territorySearchQuery, setTerritorySearchQuery] = useState("");
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState("");
  const [existingAssigneeFilter, setExistingAssigneeFilter] = useState<ExistingAssigneeFilter>("all");
  const [maximizedPanel, setMaximizedPanel] = useState<MaximizedPanel>(null);
  const [partnerPairSearchQuery, setPartnerPairSearchQuery] = useState("");
  const [openPairLocationTerritories, setOpenPairLocationTerritories] = useState<Record<number, boolean>>({});

  const territoryMap = useMemo(() => {
    return new Map(
      areas
        .flatMap((area) => area.territories)
        .map((territory) => [territory.id, territory]),
    );
  }, [areas]);

  const assigneeNameMap = useMemo(() => {
    return new Map(assignees.map((assignee) => [assignee.id, assignee.name]));
  }, [assignees]);

  const assigneeMap = useMemo(() => {
    return new Map(assignees.map((assignee) => [assignee.id, assignee]));
  }, [assignees]);

  const assignedAssigneeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const slots of Object.values(slotAssignmentsByTerritory)) {
      for (const assigneeIds of slots) {
        for (const assigneeId of assigneeIds) {
          ids.add(assigneeId);
        }
      }
    }
    return ids;
  }, [slotAssignmentsByTerritory]);

  const availableAssignees = useMemo(() => {
    return assignees.filter((assignee) => !assignedAssigneeIds.has(assignee.id));
  }, [assignees, assignedAssigneeIds]);

  const selectedAreas = useMemo(() => {
    return areas
      .map((area) => ({
        ...area,
        territories: area.territories.filter((territory) => selectedTerritories.includes(territory.id)),
      }))
      .filter((area) => area.territories.length > 0);
  }, [areas, selectedTerritories]);

  const hasAnyPartnerPairs = useMemo(() => {
    return Object.values(slotAssignmentsByTerritory).some((slots) =>
      slots.some((assigneeIds) => assigneeIds.length > 0),
    );
  }, [slotAssignmentsByTerritory]);
  const hasAnyBoardState = selectedTerritories.length > 0 || assignees.length > 0 || hasAnyPartnerPairs;

  const filteredAreasForAssignModal = useMemo(() => {
    const query = territorySearchQuery.trim().toLowerCase();
    if (!query) {
      return selectedAreas;
    }

    return selectedAreas
      .map((area) => {
        const areaMatches = area.areaName.toLowerCase().includes(query);
        const territories = areaMatches
          ? area.territories
          : area.territories.filter((territory) => territory.territoryName.toLowerCase().includes(query));
        return { ...area, territories };
      })
      .filter((area) => area.territories.length > 0);
  }, [selectedAreas, territorySearchQuery]);

  const filteredSelectedAreasForPairs = useMemo(() => {
    const query = partnerPairSearchQuery.trim().toLowerCase();
    if (!query) {
      return selectedAreas;
    }

    return selectedAreas
      .map((area) => {
        const areaMatches = area.areaName.toLowerCase().includes(query);
        const territories = area.territories.filter((territory) => {
          const territoryMatches = territory.territoryName.toLowerCase().includes(query);
          const locationMatches = formatLocations(territory.locations).some((location) =>
            location.toLowerCase().includes(query),
          );
          const assignedNameMatches = (slotAssignmentsByTerritory[territory.id] ?? [])
            .flat()
            .some((assigneeId) => (assigneeNameMap.get(assigneeId) ?? "").toLowerCase().includes(query));

          return areaMatches || territoryMatches || locationMatches || assignedNameMatches;
        });

        return { ...area, territories };
      })
      .filter((area) => area.territories.length > 0);
  }, [assigneeNameMap, partnerPairSearchQuery, selectedAreas, slotAssignmentsByTerritory]);

  const filteredAssigneesForExistingModal = useMemo(() => {
    const query = assigneeSearchQuery.trim().toLowerCase();
    return assignees
      .filter((assignee) => {
        const isAssigned = assignedAssigneeIds.has(assignee.id);
        if (existingAssigneeFilter === "unassigned" && isAssigned) {
          return false;
        }
        if (existingAssigneeFilter === "assigned" && !isAssigned) {
          return false;
        }
        return !query || assignee.name.toLowerCase().includes(query);
      })
      .sort((left, right) => {
        const leftAssigned = assignedAssigneeIds.has(left.id);
        const rightAssigned = assignedAssigneeIds.has(right.id);
        if (leftAssigned !== rightAssigned) {
          return leftAssigned ? 1 : -1;
        }
        return left.name.localeCompare(right.name, undefined, {
          sensitivity: "base",
        });
      });
  }, [assignees, assignedAssigneeIds, assigneeSearchQuery, existingAssigneeFilter]);

  const canAssignMultiple =
    availableAssignees.length > 0 && selectedAssigneeIdsForBulkAssign.length > 0;
  const canAssignAutomatically =
    availableAssignees.length > 0 && selectedAreas.some((area) => area.territories.length > 0);

  useEffect(() => {
    const availableIds = new Set(availableAssignees.map((assignee) => assignee.id));
    setSelectedAssigneeIdsForBulkAssign((current) =>
      current.filter((assigneeId) => availableIds.has(assigneeId)),
    );
  }, [availableAssignees]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const getStoredTheme = () => {
      const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
      return theme === "dark" || theme === "light" ? theme : null;
    };

    const applyTheme = (theme: "dark" | "light" | null) => {
      const darkActive = theme ? theme === "dark" : media.matches;
      root.classList.toggle("dark", darkActive);
      setIsDarkMode(darkActive);
    };

    applyTheme(getStoredTheme());

    const onMediaChange = (event: MediaQueryListEvent) => {
      if (!getStoredTheme()) {
        root.classList.toggle("dark", event.matches);
        setIsDarkMode(event.matches);
      }
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onMediaChange);
      return () => media.removeEventListener("change", onMediaChange);
    }

    media.addListener(onMediaChange);
    return () => media.removeListener(onMediaChange);
  }, []);

  useEffect(() => {
    const loadTerritories = async () => {
      setIsLoadingAreas(true);
      setLoadError("");

      try {
        if (!window.crypto?.subtle) {
          throw new Error("This browser cannot decrypt territory data.");
        }

        const response = await fetch("/api/territories", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Failed to load territories (${response.status})`);
        }

        const body = (await response.json()) as EncryptedTerritoriesResponse;
        const decrypted = await decryptTerritoryPayload(
          body.encryptionUserId ?? currentUserId,
          body.payload,
        );

        if (!decrypted) {
          throw new Error("Unable to decrypt territories payload.");
        }

        setAreas(decrypted.areas);
        setOpenAreas({});
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Unable to load territories.");
      } finally {
        setIsLoadingAreas(false);
      }
    };

    void loadTerritories();
  }, [currentUserId]);

  useEffect(() => {
    if (areas.length === 0) {
      setSelectedTerritories([]);
      setSlotAssignmentsByTerritory({});
      setAssignees([]);
      return;
    }

    let isActive = true;

    const loadFromDatabase = async () => {
      setIsLoadingBoard(true);
      const defaults = buildDefaultSlotAssignments(areas);

      try {
        const result = await loadBoardState();
        if (!isActive) {
          return;
        }

        if (!result.ok) {
          setSelectedTerritories([]);
          setSlotAssignmentsByTerritory(defaults);
          setAssignees([]);
          setLoadError(result.message);
          return;
        }

        const parsed = result.state as BoardState;
        const selected = Array.isArray(parsed.selectedTerritories)
          ? parsed.selectedTerritories.filter((territoryId) => territoryMap.has(territoryId))
          : [];

        const mergedSlots: SlotAssignmentsByTerritory = {};
        for (const [territoryIdText, defaultSlots] of Object.entries(defaults)) {
          const territoryId = Number(territoryIdText);
          const savedSlots = parsed.slotAssignmentsByTerritory?.[territoryId] ?? [];
          mergedSlots[territoryId] = defaultSlots.map((_, slotIndex) => {
            const slot = savedSlots[slotIndex];
            if (!Array.isArray(slot)) return [];
            return slot.filter((assigneeId) => typeof assigneeId === "string");
          });
        }

        const savedAssignees = Array.isArray(parsed.assignees)
          ? parsed.assignees
              .filter((item) => item && typeof item.id === "string" && typeof item.name === "string")
              .map((item) => ({
                id: item.id,
                name: item.name.trim(),
                gender: normalizeGender((item as Partial<Assignee>).gender),
              }))
              .filter((item) => item.name.length > 0)
          : [];

        const allowedIds = new Set(savedAssignees.map((assignee) => assignee.id));
        for (const territoryId of Object.keys(mergedSlots).map(Number)) {
          mergedSlots[territoryId] = mergedSlots[territoryId].map((slot) =>
            slot.filter((assigneeId) => allowedIds.has(assigneeId)),
          );
        }

        setSelectedTerritories(selected);
        setSlotAssignmentsByTerritory(mergedSlots);
        setAssignees(savedAssignees);
      } catch (error) {
        if (!isActive) {
          return;
        }
        setSelectedTerritories([]);
        setSlotAssignmentsByTerritory(defaults);
        setAssignees([]);
        setLoadError(error instanceof Error ? error.message : "Unable to load saved board state.");
      } finally {
        if (isActive) {
          setIsLoadingBoard(false);
        }
      }
    };

    void loadFromDatabase();

    return () => {
      isActive = false;
    };
  }, [areas, currentUserId, territoryMap]);

  const toggleTerritory = (territoryId: number) => {
    setSelectedTerritories((current) =>
      current.includes(territoryId)
        ? current.filter((id) => id !== territoryId)
        : [...current, territoryId],
    );
  };

  const showAllAreas = () => {
    setOpenAreas(Object.fromEntries(areas.map((area) => [area.id, true])));
  };

  const hideAllAreas = () => {
    setOpenAreas(Object.fromEntries(areas.map((area) => [area.id, false])));
  };

  const onCreateAssignee = () => {
    const trimmed = newAssigneeName.trim();
    if (!trimmed) return;

    const newAssignee: Assignee = {
      id: generateAssigneeId(),
      name: trimmed,
      gender: newAssigneeGender,
    };

    setAssignees((current) => [...current, newAssignee]);
    setNewAssigneeName("");
    setStatus("Assignee created.");
  };

  const onAddAssigneeToSlot = (territoryId: number, slotIndex: number) => {
    const slotKey = toSlotKey(territoryId, slotIndex);
    const name = (slotDraftNames[slotKey] ?? "").trim();
    if (!name) return;

    const assigneeId = generateAssigneeId();
    const gender = slotDraftGenders[slotKey] ?? "male";
    setAssignees((current) => [...current, { id: assigneeId, name, gender }]);
    setSlotAssignmentsByTerritory((current) => {
      const next: SlotAssignmentsByTerritory = { ...current };
      const territorySlots = [...(next[territoryId] ?? [])];
      const targetSlot = [...(territorySlots[slotIndex] ?? [])];
      targetSlot.push(assigneeId);
      territorySlots[slotIndex] = targetSlot;
      next[territoryId] = territorySlots;
      return next;
    });
    setSlotDraftNames((current) => ({ ...current, [slotKey]: "" }));
    setStatus("Assignee created and assigned.");
  };

  const onStartEditAssignee = (assigneeId: string) => {
    const assignee = assignees.find((item) => item.id === assigneeId);
    if (!assignee) return;

    setSelectedAssigneeId(assigneeId);
    setEditingAssigneeId(assigneeId);
    setEditingAssigneeName(assignee.name);
  };

  const onSaveEditAssignee = () => {
    if (!editingAssigneeId) return;
    const trimmed = editingAssigneeName.trim();
    if (!trimmed) return;

    setAssignees((current) =>
      current.map((assignee) =>
        assignee.id === editingAssigneeId
          ? { ...assignee, name: trimmed }
          : assignee,
      ),
    );
    setEditingAssigneeId(null);
    setEditingAssigneeName("");
    setStatus("Assignee updated.");
  };

  const onCancelEditAssignee = () => {
    setEditingAssigneeId(null);
    setEditingAssigneeName("");
  };

  const onToggleAssigneeActions = (assigneeId: string) => {
    if (selectedAssigneeId === assigneeId) {
      setSelectedAssigneeId(null);
      if (editingAssigneeId === assigneeId) {
        setEditingAssigneeId(null);
        setEditingAssigneeName("");
      }
      return;
    }
    setSelectedAssigneeId(assigneeId);
  };

  const onToggleBulkAssigneeSelection = (assigneeId: string, checked: boolean) => {
    setSelectedAssigneeIdsForBulkAssign((current) => {
      if (checked) {
        return current.includes(assigneeId) ? current : [...current, assigneeId];
      }
      return current.filter((id) => id !== assigneeId);
    });
  };

  const onCycleAssigneeGender = (assigneeId: string) => {
    setAssignees((current) =>
      current.map((assignee) =>
        assignee.id === assigneeId
          ? { ...assignee, gender: toggleGender(assignee.gender) }
          : assignee,
      ),
    );
  };

  const removeAssigneeEverywhere = (assigneeId: string) => {
    setAssignees((current) => current.filter((assignee) => assignee.id !== assigneeId));
    setSlotAssignmentsByTerritory((current) => {
      const next: SlotAssignmentsByTerritory = {};
      for (const [territoryIdText, slots] of Object.entries(current)) {
        const territoryId = Number(territoryIdText);
        next[territoryId] = slots.map((slot) => slot.filter((id) => id !== assigneeId));
      }
      return next;
    });

    if (editingAssigneeId === assigneeId) {
      setEditingAssigneeId(null);
      setEditingAssigneeName("");
    }
    if (selectedAssigneeId === assigneeId) {
      setSelectedAssigneeId(null);
    }
    setSelectedAssigneeIdsForBulkAssign((current) => current.filter((id) => id !== assigneeId));
    setAssignModalAssigneeIds((current) => current.filter((id) => id !== assigneeId));
  };

  const onDeleteAssignee = (assigneeId: string) => {
    removeAssigneeEverywhere(assigneeId);
    setStatus("Assignee deleted.");
  };

  const onClearAssigneesPane = () => {
    if (availableAssignees.length === 0) {
      return;
    }

    const availableIds = new Set(availableAssignees.map((assignee) => assignee.id));
    setAssignees((current) => current.filter((assignee) => !availableIds.has(assignee.id)));

    if (editingAssigneeId && availableIds.has(editingAssigneeId)) {
      setEditingAssigneeId(null);
      setEditingAssigneeName("");
    }
    setSelectedAssigneeIdsForBulkAssign((current) =>
      current.filter((assigneeId) => !availableIds.has(assigneeId)),
    );

    setStatus("Unassigned assignees cleared.");
  };

  const onDragStartAssignee = (event: DragEvent<HTMLDivElement>, assigneeId: string, includeBulkSelection = false) => {
    const selectedIds =
      includeBulkSelection && selectedAssigneeIdsForBulkAssign.includes(assigneeId)
        ? selectedAssigneeIdsForBulkAssign.filter((id) => assigneeNameMap.has(id))
        : [assigneeId];

    const payload = selectedIds.length > 0 ? selectedIds : [assigneeId];
    event.dataTransfer.setData("text/assignee-id", payload[0]);
    event.dataTransfer.setData("application/x-assignee-ids", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
  };

  const assignAssigneesToSlot = (assigneeIds: string[], territoryId: number, slotIndex: number) => {
    const validAssigneeIds = Array.from(new Set(assigneeIds)).filter((assigneeId) => assigneeNameMap.has(assigneeId));
    if (validAssigneeIds.length === 0) {
      return;
    }

    setSlotAssignmentsByTerritory((current) => {
      const cloned: SlotAssignmentsByTerritory = {};

      for (const [territoryIdText, slots] of Object.entries(current)) {
        const parsedTerritoryId = Number(territoryIdText);
        cloned[parsedTerritoryId] = slots.map((slot) =>
          slot.filter((slotAssigneeId) => !validAssigneeIds.includes(slotAssigneeId)),
        );
      }

      const targetSlots = [...(cloned[territoryId] ?? [])];
      const targetSlot = [...(targetSlots[slotIndex] ?? [])];
      targetSlot.push(...validAssigneeIds);
      targetSlots[slotIndex] = targetSlot;
      cloned[territoryId] = targetSlots;
      return cloned;
    });
  };

  const assignAssigneeToSlot = (assigneeId: string, territoryId: number, slotIndex: number) => {
    assignAssigneesToSlot([assigneeId], territoryId, slotIndex);
  };

  const onDropToSlot = (event: DragEvent<HTMLDivElement>, territoryId: number, slotIndex: number) => {
    event.preventDefault();
    const assigneeIdsJson = event.dataTransfer.getData("application/x-assignee-ids");
    if (assigneeIdsJson) {
      try {
        const parsed = JSON.parse(assigneeIdsJson) as unknown;
        if (Array.isArray(parsed)) {
          const assigneeIds = parsed.filter((value): value is string => typeof value === "string");
          if (assigneeIds.length > 0) {
            assignAssigneesToSlot(assigneeIds, territoryId, slotIndex);
            return;
          }
        }
      } catch {
        // Fall through to single-assignee payload.
      }
    }

    const assigneeId = event.dataTransfer.getData("text/assignee-id");
    if (!assigneeId) return;
    assignAssigneeToSlot(assigneeId, territoryId, slotIndex);
  };

  const onOpenAssignModalForAssignees = (assigneeIds: string[]) => {
    const normalized = Array.from(new Set(assigneeIds)).filter((assigneeId) => assigneeNameMap.has(assigneeId));
    if (normalized.length === 0) {
      return;
    }

    setSelectedAssigneeId(normalized[0]);
    setTerritorySearchQuery("");
    setAssignModalAssigneeIds(normalized);
  };

  const onOpenAssignModalFromPane = (assigneeId: string) => {
    if (!assigneeNameMap.has(assigneeId)) {
      return;
    }

    const selectedSet = new Set(selectedAssigneeIdsForBulkAssign);
    if (selectedSet.size > 0) {
      if (!selectedSet.has(assigneeId)) {
        selectedSet.add(assigneeId);
      }
      onOpenAssignModalForAssignees(Array.from(selectedSet));
      return;
    }

    onOpenAssignModalForAssignees([assigneeId]);
  };

  const onOpenAssignMultiple = () => {
    if (!canAssignMultiple) {
      return;
    }
    onOpenAssignModalForAssignees(selectedAssigneeIdsForBulkAssign);
  };

  const onAssignAutomatically = () => {
    if (!canAssignAutomatically) {
      return;
    }

    const selectedIds = selectedAssigneeIdsForBulkAssign.length > 0
      ? selectedAssigneeIdsForBulkAssign
      : availableAssignees.map((assignee) => assignee.id);
    const selectedSet = new Set(selectedIds);
    const pool = availableAssignees.filter((assignee) => selectedSet.has(assignee.id));

    const byGender: Record<Gender, string[]> = { male: [], female: [] };
    for (const assignee of pool) {
      byGender[assignee.gender].push(assignee.id);
    }

    const shuffle = (values: string[]) => {
      const next = [...values];
      for (let index = next.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      }
      return next;
    };

    byGender.male = shuffle(byGender.male);
    byGender.female = shuffle(byGender.female);

    let assignedCount = 0;
    const nextAssignments: SlotAssignmentsByTerritory = {};
    for (const [territoryIdText, slots] of Object.entries(slotAssignmentsByTerritory)) {
      nextAssignments[Number(territoryIdText)] = slots.map((slot) => [...slot]);
    }

    for (const area of selectedAreas) {
      for (const territory of area.territories) {
        const pairSlots = Math.min(3, Math.max(territory.noOfPartners ?? 0, 0));
        if (pairSlots <= 0) continue;

        const territorySlots = [...(nextAssignments[territory.id] ?? [])];

        for (let slotIndex = 0; slotIndex < pairSlots; slotIndex += 1) {
          const slot = [...(territorySlots[slotIndex] ?? [])];
          const slotAssignees = slot
            .map((assigneeId) => assigneeMap.get(assigneeId))
            .filter((item): item is Assignee => Boolean(item));

          const existingGenders = Array.from(new Set(slotAssignees.map((assignee) => assignee.gender)));
          if (existingGenders.length > 1) {
            territorySlots[slotIndex] = slot;
            continue;
          }

          const slotGender: Gender | null = existingGenders[0] ?? null;
          const remaining = Math.max(2 - slot.length, 0);
          if (remaining === 0) {
            territorySlots[slotIndex] = slot;
            continue;
          }

          if (slotGender) {
            for (let count = 0; count < remaining && byGender[slotGender].length > 0; count += 1) {
              const nextAssigneeId = byGender[slotGender].shift();
              if (!nextAssigneeId) break;
              slot.push(nextAssigneeId);
              assignedCount += 1;
            }
            territorySlots[slotIndex] = slot;
            continue;
          }

          const eligibleGenders = (["male", "female"] as const).filter((gender) =>
            byGender[gender].length >= 2,
          );
          if (eligibleGenders.length === 0) {
            territorySlots[slotIndex] = slot;
            continue;
          }

          const selectedGender = eligibleGenders[Math.floor(Math.random() * eligibleGenders.length)];
          for (let count = 0; count < 2; count += 1) {
            const nextAssigneeId = byGender[selectedGender].shift();
            if (!nextAssigneeId) break;
            slot.push(nextAssigneeId);
            assignedCount += 1;
          }
          territorySlots[slotIndex] = slot;
        }

        nextAssignments[territory.id] = territorySlots;
      }
    }

    setSlotAssignmentsByTerritory(nextAssignments);

    setSelectedAssigneeIdsForBulkAssign((current) =>
      current.filter((assigneeId) => !selectedSet.has(assigneeId)),
    );
    if (assignedCount === 0) {
      setStatus("No compatible same-gender partner pairs were available for automatic assignment.");
      return;
    }
    setStatus(`${assignedCount} assignees automatically assigned.`);
  };

  const onCloseAssignModal = () => {
    setTerritorySearchQuery("");
    setAssignModalAssigneeIds([]);
  };

  const onOpenExistingAssigneesModal = (territoryId: number, slotIndex: number) => {
    setAssigneeSearchQuery("");
    setExistingAssigneeFilter("all");
    setExistingAssigneeTarget({ territoryId, slotIndex });
  };

  const onCloseExistingAssigneesModal = () => {
    setAssigneeSearchQuery("");
    setExistingAssigneeFilter("all");
    setExistingAssigneeTarget(null);
  };

  const onAssignExistingAssigneeToSlot = (assigneeId: string) => {
    if (!existingAssigneeTarget || !assigneeNameMap.has(assigneeId)) {
      return;
    }

    assignAssigneeToSlot(assigneeId, existingAssigneeTarget.territoryId, existingAssigneeTarget.slotIndex);
    setExistingAssigneeTarget(null);
    setStatus("Assignee assigned.");
  };

  const onAssignAssigneeToTerritory = (territoryId: number) => {
    const assigneeIds = assignModalAssigneeIds.filter((assigneeId) => assigneeNameMap.has(assigneeId));
    if (assigneeIds.length === 0) {
      return;
    }

    const territory = territoryMap.get(territoryId);
    const maxSlots = Math.max(territory?.noOfPartners ?? 0, 0);
    if (maxSlots === 0) {
      setStatus("This territory has no available pair slots.");
      return;
    }

    setSlotAssignmentsByTerritory((current) => {
      const cloned: SlotAssignmentsByTerritory = {};

      for (const [territoryIdText, slots] of Object.entries(current)) {
        const parsedTerritoryId = Number(territoryIdText);
        cloned[parsedTerritoryId] = slots.map((slot) =>
          slot.filter((slotAssigneeId) => !assigneeIds.includes(slotAssigneeId)),
        );
      }

      const targetSlots = [...(cloned[territoryId] ?? [])];
      for (const assigneeId of assigneeIds) {
        let targetSlotIndex = 0;
        let minCount = Number.POSITIVE_INFINITY;

        for (let index = 0; index < maxSlots; index += 1) {
          const slotCount = (targetSlots[index] ?? []).length;
          if (slotCount < minCount) {
            minCount = slotCount;
            targetSlotIndex = index;
          }
        }

        const targetSlot = [...(targetSlots[targetSlotIndex] ?? [])];
        targetSlot.push(assigneeId);
        targetSlots[targetSlotIndex] = targetSlot;
      }

      cloned[territoryId] = targetSlots;
      return cloned;
    });

    setSelectedAssigneeIdsForBulkAssign((current) =>
      current.filter((assigneeId) => !assigneeIds.includes(assigneeId)),
    );
    setAssignModalAssigneeIds([]);
    setStatus(assigneeIds.length === 1 ? "Assignee assigned." : `${assigneeIds.length} assignees assigned.`);
  };

  const onSave = async () => {
    setIsSavingBoard(true);
    try {
      const result = await saveBoardState({
        selectedTerritories,
        slotAssignmentsByTerritory,
        assignees,
      });

      if (!result.ok) {
        setStatus(result.message);
        return false;
      }

      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save to database.");
      return false;
    } finally {
      setIsSavingBoard(false);
    }
  };

  const onSaveAssignments = async () => {
    setStatus("Saving assignments to database...");
    const saved = await onSave();
    if (saved) {
      setStatus("Assignments saved to database.");
    }
  };

  const onSaveAssignees = async () => {
    setStatus("Saving assignees to database...");
    const saved = await onSave();
    if (saved) {
      setStatus("Assignees saved to database.");
    }
  };

  const onReset = () => {
    const confirmed = window.confirm(
      "This will clear the current board on this screen. Save afterward to update the database. Continue?",
    );
    if (!confirmed) {
      return;
    }

    const defaults = buildDefaultSlotAssignments(areas);

    setSelectedTerritories([]);
    setSlotAssignmentsByTerritory(defaults);
    setAssignees([]);
    setSelectedAssigneeId(null);
    setEditingAssigneeId(null);
    setEditingAssigneeName("");
    setNewAssigneeName("");
    setStatus("Board reset locally. Save to update the database.");
  };

  const onCopyAssignments = async () => {
    const selectedAreaEntries = selectedAreas
      .map((area) => {
        const territoryEntries = area.territories
          .map((territory) => {
            const slots = slotAssignmentsByTerritory[territory.id] ?? [];
            const filled = slots
              .map((assigneeIds) =>
                assigneeIds
                  .map((assigneeId) => assigneeNameMap.get(assigneeId) ?? "")
                  .map((name) => name.trim())
                  .filter((name) => name.length > 0)
                  .join(" & "),
              )
              .filter((line) => line.length > 0);

            if (filled.length === 0) return null;

            return [territory.territoryName, ...filled].join("\n");
          })
          .filter((entry): entry is string => Boolean(entry));

        if (territoryEntries.length === 0) return null;
        return [area.areaName, "", territoryEntries.join("\n\n")].join("\n");
      })
      .filter((entry): entry is string => Boolean(entry));

    if (selectedAreaEntries.length === 0) {
      setStatus("No assignments to copy.");
      return;
    }

    const formattedDate = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date());

    const textOutput = [
      `Fishing schedule ${formattedDate}`,
      "",
      selectedAreaEntries.join("\n\n"),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(textOutput);
      setStatus("Assignments copied to clipboard.");
    } catch {
      setStatus("Failed to copy assignments.");
    }
  };

  const onSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  };

  const onToggleTheme = () => {
    const nextTheme = isDarkMode ? "light" : "dark";
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setIsDarkMode(nextTheme === "dark");
  };

  const onShowAllPairLocations = () => {
    const next: Record<number, boolean> = {};
    for (const area of selectedAreas) {
      for (const territory of area.territories) {
        next[territory.id] = true;
      }
    }
    setOpenPairLocationTerritories(next);
  };

  const onHideAllPairLocations = () => {
    setOpenPairLocationTerritories({});
  };

  const getPanelClassName = (isMaximized: boolean) =>
    isMaximized
      ? "fixed inset-0 z-50 overflow-y-auto bg-white dark:bg-gray-950 p-4 sm:p-6"
      : "w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 lg:w-1/3 lg:min-w-0";

  const getPanelHeaderClassName = (isMaximized: boolean) =>
    isMaximized
      ? "sticky top-0 z-10 -mx-4 -mt-4 mb-4 flex items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6"
      : "mb-3 flex items-center justify-between gap-2";

  const getMaximizeButton = (panel: Exclude<MaximizedPanel, null>, label: string) => {
    const isMaximized = maximizedPanel === panel;

    return (
      <button
        type="button"
        onClick={() => setMaximizedPanel(isMaximized ? null : panel)}
        className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-800"
        aria-label={`${isMaximized ? "Exit full screen" : "Full screen"} ${label}`}
        title={isMaximized ? "Exit full screen" : "Full screen"}
      >
        <Icon path={isMaximized ? mdiFullscreenExit : mdiFullscreen} size={0.75} aria-hidden />
      </button>
    );
  };

  const isTerritoriesMaximized = maximizedPanel === "territories";
  const isAssigneesMaximized = maximizedPanel === "assignees";
  const isPairsMaximized = maximizedPanel === "pairs";

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Territory Partner Assignment</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">Signed in as {currentUserName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleTheme}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900"
            aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
            title={isDarkMode ? "Dark mode enabled" : "Light mode enabled"}
          >
            <Icon path={isDarkMode ? mdiWeatherNight : mdiWhiteBalanceSunny} size={0.85} aria-hidden />
          </button>
          <button
            onClick={onSignOut}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900"
          >
            Sign out
          </button>
        </div>
      </div>

      {isLoadingAreas && (
        <div className="mb-4 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
          Loading territories...
        </div>
      )}

      {isLoadingBoard && !isLoadingAreas && (
        <div className="mb-4 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
          Loading saved assignments...
        </div>
      )}

      {loadError && (
        <div className="mb-4 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">
          {loadError}
        </div>
      )}

      <section className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 lg:flex-row lg:justify-center lg:items-start">
        <div className={getPanelClassName(isTerritoriesMaximized)}>
          <div className={getPanelHeaderClassName(isTerritoriesMaximized)}>
            <h2 className="text-lg font-semibold">Select Territories</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={showAllAreas}
                disabled={areas.length === 0}
                className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Show all
              </button>
              <button
                type="button"
                onClick={hideAllAreas}
                disabled={areas.length === 0}
                className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Hide all
              </button>
              {getMaximizeButton("territories", "Select Territories")}
            </div>
          </div>
          <div className={isTerritoriesMaximized ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "space-y-4"}>
            {areas.map((area) => {
              const hasSelectedInArea = area.territories.some((territory) =>
                selectedTerritories.includes(territory.id),
              );
              const isAreaOpen = openAreas[area.id] ?? hasSelectedInArea;
              return (
                <div key={area.id} className="rounded-md border border-gray-100 dark:border-gray-800 p-3">
                <button
                  type="button"
                  onClick={() => setOpenAreas((current) => ({ ...current, [area.id]: !current[area.id] }))}
                  className="mb-2 flex w-full items-center justify-between text-left font-semibold"
                >
                  <span>{area.areaName}</span>
                  <span>{isAreaOpen ? "-" : "+"}</span>
                </button>
                {isAreaOpen && (
                  <ul className="space-y-2 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                    {area.territories.map((territory) => (
                      <li key={territory.id}>
                        <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800">
                          <input
                            type="checkbox"
                            checked={selectedTerritories.includes(territory.id)}
                            onChange={() => toggleTerritory(territory.id)}
                            className="mt-1"
                          />
                          <span className="text-sm">
                            <span className="font-semibold">
                              {territory.territoryName} ({formatPairRequirement(territory.noOfPartners, territory.withCars)})
                            </span>
                            <span className="mt-1 block text-gray-600 dark:text-gray-300">
                              {formatLocations(territory.locations).map((location) => (
                                <span key={location} className="block">
                                  {location}
                                </span>
                              ))}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                </div>
              );
            })}
          </div>
        </div>

        <div className={getPanelClassName(isAssigneesMaximized)}>
          <div className={getPanelHeaderClassName(isAssigneesMaximized)}>
            <h2 className="text-lg font-semibold">Assignees</h2>
            {getMaximizeButton("assignees", "Assignees")}
          </div>

          <div
            className={
              isAssigneesMaximized
                ? "mb-5 grid max-w-4xl gap-3 rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-3 md:grid-cols-[minmax(260px,1fr)_auto_auto] md:items-center"
                : "mb-3 space-y-2"
            }
          >
            <input
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
              value={newAssigneeName}
              onChange={(event) => setNewAssigneeName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCreateAssignee();
                }
              }}
              placeholder="Enter assignee name"
            />
            <div className="flex items-center gap-4 rounded border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="new-assignee-gender"
                  value="male"
                  checked={newAssigneeGender === "male"}
                  onChange={() => setNewAssigneeGender("male")}
                />
                Male
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="new-assignee-gender"
                  value="female"
                  checked={newAssigneeGender === "female"}
                  onChange={() => setNewAssigneeGender("female")}
                />
                Female
              </label>
            </div>
            <button
              type="button"
              onClick={onCreateAssignee}
              className={`${isAssigneesMaximized ? "px-5" : "w-full px-3"} rounded-md border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40 py-2 text-sm text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40`}
            >
              Create
            </button>
          </div>

          <div className={isAssigneesMaximized ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "max-h-[52vh] space-y-2 overflow-y-auto pr-1"}>
            {availableAssignees.map((assignee) => {
              const isEditingThis = editingAssigneeId === assignee.id;
              const isSelectedThis = selectedAssigneeId === assignee.id;
              const isCheckedForBulk = selectedAssigneeIdsForBulkAssign.includes(assignee.id);
              const genderIcon = assignee.gender === "male" ? mdiHumanMale : mdiHumanFemale;
              const nextGenderLabel = assignee.gender === "male" ? "female" : "male";
              return (
                <div
                  key={assignee.id}
                  onClick={() => onToggleAssigneeActions(assignee.id)}
                  className={`flex cursor-pointer items-center justify-between rounded border px-3 py-2 text-sm ${
                    isSelectedThis
                      ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/30"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <div
                    draggable={!isEditingThis}
                    onDragStart={(event) => onDragStartAssignee(event, assignee.id, true)}
                    className="flex min-w-0 items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={isCheckedForBulk}
                      onChange={(event) => onToggleBulkAssigneeSelection(assignee.id, event.target.checked)}
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      aria-label={`Select ${assignee.name} for multiple assignment`}
                    />
                    <span className="text-gray-500 dark:text-gray-400" onClick={(event) => event.stopPropagation()}>
                      ::
                    </span>
                    {isEditingThis ? (
                      <input
                        className="w-full rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-sm"
                        value={editingAssigneeName}
                        onChange={(event) => setEditingAssigneeName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onSaveEditAssignee();
                          }
                        }}
                        onClick={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                      />
                    ) : (
                      <span className="flex items-center gap-1 truncate">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onCycleAssigneeGender(assignee.id);
                          }}
                          className="rounded border border-gray-300 dark:border-gray-600 p-0.5 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900"
                          aria-label={`Set ${assignee.name} to ${nextGenderLabel}`}
                          title={`Click to switch to ${nextGenderLabel}`}
                        >
                          <Icon path={genderIcon} size={0.65} aria-hidden />
                        </button>
                        <span className="truncate">{assignee.name}</span>
                      </span>
                    )}
                  </div>
                  <div
                    className={`ml-2 items-center gap-1 ${isSelectedThis || isEditingThis ? "flex" : "hidden"}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {isEditingThis ? (
                      <>
                        <button
                          type="button"
                          onClick={onSaveEditAssignee}
                          className="rounded bg-black px-2 py-1 text-xs text-white"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={onCancelEditAssignee}
                          className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteAssignee(assignee.id)}
                          className="rounded border border-red-300 dark:border-red-800 px-2 py-1 text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:bg-red-950/40 dark:hover:bg-red-950/40"
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onOpenAssignModalFromPane(assignee.id)}
                          className="rounded border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40 px-2 py-1 text-xs text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40"
                        >
                          Assign
                        </button>
                        <button
                          type="button"
                          onClick={() => onStartEditAssignee(assignee.id)}
                          className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteAssignee(assignee.id)}
                          className="rounded border border-red-300 dark:border-red-800 px-2 py-1 text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:bg-red-950/40 dark:hover:bg-red-950/40"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 dark:border-gray-800 pt-3">
            <button
              type="button"
              onClick={onSaveAssignees}
              disabled={isLoadingBoard || isSavingBoard}
              className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingBoard ? "Saving..." : "Save assignees"}
            </button>
            <button
              type="button"
              onClick={onClearAssigneesPane}
              disabled={availableAssignees.length === 0}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear assignees
            </button>
            <button
              type="button"
              onClick={onOpenAssignMultiple}
              disabled={!canAssignMultiple}
              className="rounded-md border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40 px-3 py-2 text-sm text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Assign Multiple
            </button>
            <button
              type="button"
              onClick={onAssignAutomatically}
              disabled={!canAssignAutomatically}
              className="rounded-md border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40 px-3 py-2 text-sm text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Assign Automatically
            </button>
          </div>
        </div>

        <div className={getPanelClassName(isPairsMaximized)}>
          <div className={getPanelHeaderClassName(isPairsMaximized)}>
            <h2 className="text-lg font-semibold">Assign Partner Pairs</h2>
            {getMaximizeButton("pairs", "Assign Partner Pairs")}
          </div>
          <div
            className={
              isPairsMaximized
                ? "mb-5 grid max-w-4xl gap-3 rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-3 md:grid-cols-[minmax(280px,1fr)_auto] md:items-center"
                : "mb-3 space-y-2"
            }
          >
            <input
              type="text"
              value={partnerPairSearchQuery}
              onChange={(event) => setPartnerPairSearchQuery(event.target.value)}
              placeholder="Search assignees, territories, or locations"
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onShowAllPairLocations}
                disabled={selectedTerritories.length === 0}
                className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Show all locations
              </button>
              <button
                type="button"
                onClick={onHideAllPairLocations}
                disabled={selectedTerritories.length === 0}
                className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Hide all locations
              </button>
            </div>
          </div>
          {selectedAreas.length === 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-300">Choose territories on the left to assign partners.</p>
          )}
          {selectedAreas.length > 0 && filteredSelectedAreasForPairs.length === 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-300">No partner pairs match your search.</p>
          )}
          <div className="space-y-4">
            {filteredSelectedAreasForPairs.map((area) => (
              <div key={area.id} className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                <h3 className="mb-3 border-b border-gray-100 dark:border-gray-800 pb-2 font-semibold text-gray-800 dark:text-gray-100">{area.areaName}</h3>
                <div className={isPairsMaximized ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
                  {area.territories.map((territory) => {
                    const maxSlots = Math.max(territory.noOfPartners ?? 0, 0);
                    const territoryLocations = formatLocations(territory.locations);
                    const areLocationsOpen = openPairLocationTerritories[territory.id] ?? false;
                    return (
                      <div key={territory.id} className="rounded-md border border-gray-100 dark:border-gray-800 p-3">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenPairLocationTerritories((current) => ({
                              ...current,
                              [territory.id]: !(current[territory.id] ?? false),
                            }))
                          }
                          className="mb-2 flex w-full items-start justify-between gap-2 rounded px-2 py-1 text-left font-semibold hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <span>
                            {territory.territoryName} ({formatPairRequirement(territory.noOfPartners, territory.withCars)})
                          </span>
                          <span className="shrink-0 text-gray-500 dark:text-gray-400">
                            {areLocationsOpen ? "-" : "+"}
                          </span>
                        </button>
                        {areLocationsOpen && (
                          <div className="mb-3 rounded-md border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-3 py-2">
                            {territoryLocations.length === 0 ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400">No locations listed.</p>
                            ) : (
                              <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
                                {territoryLocations.map((location) => (
                                  <li key={location}>{location}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                        <div className="space-y-2">
                          {Array.from({ length: maxSlots }).map((_, slotIndex) => {
                            const slotNumber = slotIndex + 1;
                            const slotAssigneeIds = slotAssignmentsByTerritory[territory.id]?.[slotIndex] ?? [];
                            const isPairComplete = slotAssigneeIds.length === 2;
                            const isOverPairCapacity = slotAssigneeIds.length > 2;

                            return (
                              <div key={`${territory.id}-${slotNumber}`} className="space-y-1">
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                                  Pair slot #{slotNumber}
                                </label>
                                <div
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={(event) => onDropToSlot(event, territory.id, slotIndex)}
                                  className={`min-h-[88px] rounded-lg border-2 p-4 ${
                                    isOverPairCapacity
                                      ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/25"
                                      : isPairComplete
                                        ? "border-green-200 bg-green-50/70 dark:border-green-900 dark:bg-green-950/20"
                                      : "border-gray-400 bg-gray-50 dark:bg-gray-900"
                                  }`}
                                  style={{ borderStyle: "dashed" }}
                                >
                                  {slotAssigneeIds.length === 0 && (
                                    <div className="flex min-h-[56px] items-center justify-center rounded-md border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2">
                                      <p className="text-xs text-gray-500 dark:text-gray-400">Drag assignees here or add below</p>
                                    </div>
                                  )}
                                  {isOverPairCapacity && (
                                    <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                                      Warning: this slot has {slotAssigneeIds.length} assignees (pair slot expected: 2).
                                    </p>
                                  )}
                                  <div className="flex flex-wrap gap-2">
                                    {slotAssigneeIds.map((assigneeId) => {
                                      const assigneeName = assigneeNameMap.get(assigneeId) ?? "Unknown";
                                      const assigneeGender = assigneeMap.get(assigneeId)?.gender ?? "male";
                                      const genderIcon = assigneeGender === "male" ? mdiHumanMale : mdiHumanFemale;
                                      const nextGenderLabel = assigneeGender === "male" ? "female" : "male";
                                      const isEditingThis = editingAssigneeId === assigneeId;
                                      const isSelectedThis = selectedAssigneeId === assigneeId;
                                      return (
                                        <div
                                          key={`${territory.id}-${slotNumber}-${assigneeId}`}
                                          draggable={!isEditingThis}
                                          onDragStart={(event) => onDragStartAssignee(event, assigneeId)}
                                          onClick={() => onToggleAssigneeActions(assigneeId)}
                                          className={`flex cursor-pointer items-center gap-2 rounded-full border px-2 py-1 text-xs ${
                                            isSelectedThis
                                              ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/30"
                                              : "border-cyan-300 bg-cyan-50 text-cyan-900 dark:border-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-100"
                                          }`}
                                        >
                                          <span className="text-gray-500 dark:text-gray-400" onClick={(event) => event.stopPropagation()}>
                                            ::
                                          </span>
                                          {isEditingThis && (
                                            <input
                                              className="w-28 rounded border border-gray-300 dark:border-gray-600 px-1 py-0.5 text-[10px]"
                                              value={editingAssigneeName}
                                              onChange={(event) => setEditingAssigneeName(event.target.value)}
                                              onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                  event.preventDefault();
                                                  event.stopPropagation();
                                                  onSaveEditAssignee();
                                                }
                                              }}
                                              onClick={(event) => event.stopPropagation()}
                                              onMouseDown={(event) => event.stopPropagation()}
                                            />
                                          )}
                                          {!isEditingThis && (
                                            <span className="flex items-center gap-1">
                                              <button
                                                type="button"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  onCycleAssigneeGender(assigneeId);
                                                }}
                                                className="rounded border border-gray-300 dark:border-gray-600 p-0.5 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900"
                                                aria-label={`Set ${assigneeName} to ${nextGenderLabel}`}
                                                title={`Click to switch to ${nextGenderLabel}`}
                                              >
                                                <Icon path={genderIcon} size={0.55} aria-hidden />
                                              </button>
                                              <span>{assigneeName}</span>
                                            </span>
                                          )}
                                          {(isSelectedThis || isEditingThis) && (isEditingThis ? (
                                            <>
                                              <button
                                                type="button"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  onSaveEditAssignee();
                                                }}
                                                className="rounded bg-black px-2 py-1 text-[10px] text-white"
                                              >
                                                Save
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  onCancelEditAssignee();
                                                }}
                                                className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-[10px] hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900"
                                              >
                                                Cancel
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  onDeleteAssignee(assigneeId);
                                                }}
                                                className="rounded border border-red-300 dark:border-red-800 px-2 py-1 text-[10px] text-red-700 dark:text-red-300 hover:bg-red-50 dark:bg-red-950/40 dark:hover:bg-red-950/40"
                                              >
                                                Delete
                                              </button>
                                            </>
                                          ) : (
                                            <>
                                              <button
                                                type="button"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  onOpenAssignModalForAssignees([assigneeId]);
                                                }}
                                                className="rounded border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40 px-1 py-0.5 text-[10px] text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40"
                                              >
                                                Assign
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  onStartEditAssignee(assigneeId);
                                                }}
                                                className="rounded border border-gray-300 dark:border-gray-600 px-1 py-0.5 text-[10px] hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900"
                                              >
                                                Edit
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  onDeleteAssignee(assigneeId);
                                                }}
                                                className="rounded border border-red-300 dark:border-red-800 px-1 py-0.5 text-[10px] text-red-700 dark:text-red-300 hover:bg-red-50 dark:bg-red-950/40 dark:hover:bg-red-950/40"
                                              >
                                                Delete
                                              </button>
                                            </>
                                          ))}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                    <input
                                      className="min-w-0 flex-1 rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs"
                                      value={slotDraftNames[toSlotKey(territory.id, slotIndex)] ?? ""}
                                      onChange={(event) =>
                                        setSlotDraftNames((current) => ({
                                          ...current,
                                          [toSlotKey(territory.id, slotIndex)]: event.target.value,
                                        }))
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          onAddAssigneeToSlot(territory.id, slotIndex);
                                        }
                                      }}
                                      placeholder="Add new assignee"
                                    />
                                    {(() => {
                                      const slotKey = toSlotKey(territory.id, slotIndex);
                                      const draftGender = slotDraftGenders[slotKey] ?? "male";
                                      const nextDraftGender = toggleGender(draftGender);
                                      const draftGenderLabel = draftGender === "male" ? "Male" : "Female";
                                      const nextDraftGenderLabel = nextDraftGender === "male" ? "Male" : "Female";
                                      return (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setSlotDraftGenders((current) => ({
                                              ...current,
                                              [slotKey]: nextDraftGender,
                                            }))
                                          }
                                          className="inline-flex items-center justify-center gap-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
                                          aria-label={`Gender for new assignee in pair slot ${slotNumber}; currently ${draftGenderLabel}. Click to switch to ${nextDraftGenderLabel}.`}
                                          title={`Click to switch to ${nextDraftGenderLabel}`}
                                        >
                                          <Icon path={draftGender === "male" ? mdiHumanMale : mdiHumanFemale} size={0.6} aria-hidden />
                                          <span>{draftGenderLabel}</span>
                                        </button>
                                      );
                                    })()}
                                    <button
                                      type="button"
                                      onClick={() => onAddAssigneeToSlot(territory.id, slotIndex)}
                                      className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
                                    >
                                      Add
                                    </button>
                                  </div>
                                  <div className="mt-2">
                                    <button
                                      type="button"
                                      onClick={() => onOpenExistingAssigneesModal(territory.id, slotIndex)}
                                      className="rounded border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40 px-2 py-1 text-xs text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40"
                                    >
                                      Add Existing Assignees
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSaveAssignments}
              disabled={isLoadingBoard || isSavingBoard}
              className="rounded-md border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40 px-4 py-2 text-sm text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingBoard ? "Saving..." : "Save assignments"}
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={isLoadingBoard || isSavingBoard || !hasAnyBoardState}
              className="rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-2 text-sm text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onCopyAssignments}
              disabled={!hasAnyPartnerPairs}
              className="rounded-md border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40 px-4 py-2 text-sm text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Copy Assigments
            </button>
          </div>
          {status && <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">{status}</p>}
        </div>
      </section>
      {assignModalAssigneeIds.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={onCloseAssignModal}
        >
          <div
            className="w-full max-w-2xl rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold">
                Assign {assignModalAssigneeIds.length > 1 ? `${assignModalAssigneeIds.length} Assignees` : (assigneeNameMap.get(assignModalAssigneeIds[0]) ?? "Assignee")} to Territory
              </h3>
              <button
                type="button"
                onClick={onCloseAssignModal}
                className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900"
              >
                Close
              </button>
            </div>
            <div className="mb-3">
              <input
                type="text"
                value={territorySearchQuery}
                onChange={(event) => setTerritorySearchQuery(event.target.value)}
                placeholder="Search territories"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              />
            </div>
            {selectedAreas.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                No territories selected yet. Select territories first.
              </p>
            ) : filteredAreasForAssignModal.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">No territories match your search.</p>
            ) : (
              <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                {filteredAreasForAssignModal.map((area) => (
                  <div key={area.id} className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                    <h4 className="mb-2 font-semibold">{area.areaName}</h4>
                    <div className="space-y-2">
                      {area.territories.map((territory) => (
                        <div
                          key={territory.id}
                          className="flex items-center justify-between gap-3 rounded border border-gray-100 dark:border-gray-800 px-3 py-2"
                        >
                          <p className="min-w-0 truncate text-sm">
                            {territory.territoryName} ({formatPairRequirement(territory.noOfPartners, territory.withCars)})
                          </p>
                          <button
                            type="button"
                            onClick={() => onAssignAssigneeToTerritory(territory.id)}
                            className="shrink-0 rounded bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700"
                          >
                            Assign
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {existingAssigneeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={onCloseExistingAssigneesModal}
        >
          <div
            className="w-full max-w-xl rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold">
                Add Existing Assignees
              </h3>
              <button
                type="button"
                onClick={onCloseExistingAssigneesModal}
                className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900"
              >
                Close
              </button>
            </div>
            <div className="mb-3">
              <input
                type="text"
                value={assigneeSearchQuery}
                onChange={(event) => setAssigneeSearchQuery(event.target.value)}
                placeholder="Search assignees"
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              />
            </div>
            <div className="mb-3 flex flex-wrap gap-2 rounded-md bg-gray-100 dark:bg-gray-800 p-1">
              {[
                { value: "all", label: "All" },
                { value: "unassigned", label: "Unassigned" },
                { value: "assigned", label: "Already assigned" },
              ].map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setExistingAssigneeFilter(filter.value as ExistingAssigneeFilter)}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                    existingAssigneeFilter === filter.value
                      ? "bg-white dark:bg-gray-950 text-gray-950 dark:text-gray-50 shadow-sm"
                      : "text-gray-600 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-900/70"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            {assignees.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">No assignees available yet.</p>
            ) : filteredAssigneesForExistingModal.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">No assignees match your search.</p>
            ) : (
              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {filteredAssigneesForExistingModal.map((assignee) => {
                  const isAssigned = assignedAssigneeIds.has(assignee.id);

                  return (
                    <div
                      key={assignee.id}
                      className="flex items-center justify-between gap-3 rounded border border-gray-100 dark:border-gray-800 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">
                          <span className="inline-flex items-center gap-1">
                            <Icon path={assignee.gender === "male" ? mdiHumanMale : mdiHumanFemale} size={0.65} aria-hidden />
                            <span>{assignee.name}</span>
                          </span>
                        </p>
                        <p className={`mt-0.5 text-xs ${isAssigned ? "text-amber-700 dark:text-amber-300" : "text-gray-500 dark:text-gray-400"}`}>
                          {isAssigned ? "Already assigned" : "Unassigned"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAssignExistingAssigneeToSlot(assignee.id)}
                        className="shrink-0 rounded bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700"
                      >
                        Assign
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
