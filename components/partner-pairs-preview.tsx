"use client";

import { useEffect, useRef } from "react";
import Icon from "@mdi/react";
import { mdiArrowLeft } from "@mdi/js";
import { formatLocations } from "@/lib/locations";

type Props = {
  areas: {
    id: number;
    areaName: string;
    territories: { id: number; territoryName: string; locations: string | null }[];
  }[];
  slots: Record<number, string[][]>;
  assigneeNames: ReadonlyMap<string, string>;
  onClose: () => void;
};

export const PartnerPairsPreview = ({ areas, slots, assigneeNames, onClose }: Props) => {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      opener?.focus({ preventScroll: true });
    };
  }, []);

  const roster = areas.map((area) => ({
    ...area,
    territories: area.territories.map((territory) => ({
      ...territory,
      assignments: (slots[territory.id] ?? [])
        .map((slot, index) => ({
          number: index + 1,
          names: slot.map((id) => assigneeNames.get(id)).filter(Boolean).join(" & "),
        }))
        .filter((slot) => slot.names),
    })),
  }));
  const territories = roster.flatMap((area) => area.territories);
  const assignedSlots = territories.reduce((count, territory) => count + territory.assignments.length, 0);

  return (
    <dialog
      ref={ref}
      className="pairs-preview"
      aria-labelledby="pairs-preview-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <div className="pairs-preview-content">
        <header className="pairs-preview-header">
          <button type="button" className="button-secondary pairs-preview-back" onClick={onClose} autoFocus>
            <Icon path={mdiArrowLeft} size={0.8} aria-hidden />
            Back to workspace
          </button>
          <div className="pairs-preview-title">
            <h2 id="pairs-preview-title">Partner Pairs</h2>
            <span>List mode</span>
          </div>
          <p className="font-semibold">Current territory assignments</p>
          <p className="text-muted text-sm">
            {territories.length} {territories.length === 1 ? "territory" : "territories"} ·{" "}
            {assignedSlots} assigned {assignedSlots === 1 ? "slot" : "slots"}
          </p>
        </header>
        {roster.length === 0 && (
          <p className="board-panel text-muted">No territories selected yet. Go back to the workspace to select territories.</p>
        )}
        {roster.map((area) => (
          <section key={area.id} className="pairs-preview-area" aria-labelledby={`pairs-preview-area-${area.id}`}>
            <h3 id={`pairs-preview-area-${area.id}`}>{area.areaName}</h3>
            <div className="pairs-preview-columns" aria-hidden="true"><span>Territory</span><span>Assigned partners</span></div>
            <ul role="list">
              {area.territories.map((territory) => {
                const locations = formatLocations(territory.locations);
                return (
                  <li key={territory.id} className="pairs-preview-row">
                    <div>
                      <h4 className="font-semibold">{territory.territoryName}</h4>
                      {locations.length > 0 && <p className="text-muted text-sm">{locations.join(" · ")}</p>}
                    </div>
                    {territory.assignments.length ? (
                      <ul role="list" aria-label="Assigned partners" className="space-y-1 font-semibold">
                        {territory.assignments.map((slot) => <li key={slot.number}>{slot.names}</li>)}
                      </ul>
                    ) : <p className="text-muted text-sm">Unassigned</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </dialog>
  );
};
