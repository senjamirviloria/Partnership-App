"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  createArea,
  createDatabaseUser,
  createTerritory,
  deleteDatabaseUser,
  updateDatabaseUser,
  updateTerritory,
} from "@/app/super-admin-actions";
import type {
  AdminArea,
  AdminMode,
  AdminEditor,
  AdminUser,
} from "@/lib/admin-data";
import { LocationList } from "@/components/location-list";
import { AdminRecordEditor } from "@/components/admin-record-editor";

type Props = {
  mode: AdminMode;
  areas?: AdminArea[];
  users?: AdminUser[];
  currentUserId?: string;
  initiallyCreate?: boolean;
  carOnly?: boolean;
};
const PAGE_SIZE = 10;

export const SuperAdminPanel = ({
  mode,
  areas = [],
  users = [],
  currentUserId,
  initiallyCreate = false,
  carOnly = false,
}: Props) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editor, setEditor] = useState<AdminEditor | null>(
    initiallyCreate ? { kind: "create" } : null,
  );
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [onlyCars, setOnlyCars] = useState(carOnly);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const territories = areas.flatMap((area) =>
    area.territories.map((territory) => ({
      ...territory,
      areaName: area.areaName,
    })),
  );
  const term = query.trim().toLowerCase();
  const filteredUsers = users.filter(
    (user) =>
      (role === "all" || role === user.role) &&
      `${user.name} ${user.username} ${user.email}`
        .toLowerCase()
        .includes(term),
  );
  const filteredAreas = areas.filter((area) =>
    `${area.areaName} ${area.description ?? ""}`.toLowerCase().includes(term),
  );
  const filteredTerritories = territories.filter(
    (territory) =>
      (!onlyCars || territory.withCars) &&
      `${territory.territoryName} ${territory.areaName} ${territory.locations ?? ""}`
        .toLowerCase()
        .includes(term),
  );
  const count =
    mode === "users"
      ? filteredUsers.length
      : mode === "areas"
        ? filteredAreas.length
        : filteredTerritories.length;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const activePage = Math.min(page, pages);
  const start = (activePage - 1) * PAGE_SIZE;
  const singular =
    mode === "users" ? "user" : mode === "areas" ? "area" : "territory";
  const editingUser = editor?.kind === "user" ? editor.user : null;
  const editingTerritory =
    editor?.kind === "territory" ? editor.territory : null;
  const close = () => {
    setEditor(null);
    setError("");
  };
  const open = (next: AdminEditor) => {
    setError("");
    setEditor(next);
  };

  const run = (
    action: (data: FormData) => Promise<{ ok: boolean; message: string }>,
    data: FormData,
  ) => {
    setError("");
    startTransition(async () => {
      try {
        const result = await action(data);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setStatus(result.message);
        setEditor(null);
        router.refresh();
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to save. Please try again.",
        );
      }
    });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const action =
      mode === "users"
        ? editingUser
          ? updateDatabaseUser
          : createDatabaseUser
        : mode === "areas"
          ? createArea
          : editingTerritory
            ? updateTerritory
            : createTerritory;
    run(action, new FormData(event.currentTarget));
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>
            {mode === "users"
              ? "Users"
              : mode === "areas"
                ? "Areas"
                : "Territories"}
          </h1>
          <p>
            {mode === "users"
              ? "Manage accounts and access."
              : mode === "areas"
                ? "Organize your territory groups."
                : "Manage locations, pair capacity, and transport requirements."}
          </p>
        </div>
        <button
          className="button-primary"
          onClick={() => open({ kind: "create" })}
          disabled={mode === "territories" && areas.length === 0}
        >
          + Add {singular}
        </button>
      </div>
      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}
      {mode === "territories" && areas.length === 0 && (
        <p className="notice">Create an area before adding a territory.</p>
      )}
      <section className="surface">
        <div className="directory-toolbar">
          <input
            aria-label={`Search ${mode}`}
            placeholder={
              mode === "users"
                ? "Search name, username, or email…"
                : `Search ${mode}…`
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          {mode === "users" && (
            <select
              aria-label="Filter by role"
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All roles</option>
              <option value="user">User</option>
              <option value="super_admin">Super admin</option>
            </select>
          )}
          {mode === "territories" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlyCars}
                onChange={(event) => {
                  setOnlyCars(event.target.checked);
                  setPage(1);
                }}
              />
              Car required only
            </label>
          )}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {(mode === "users"
                  ? ["Name", "Username", "Email", "Role", "Actions"]
                  : mode === "areas"
                    ? ["Area", "Description", "Territories"]
                    : [
                        "Territory",
                        "Area",
                        "Location",
                        "Pairs",
                        "Transport",
                        "Actions",
                      ]
                ).map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mode === "users" &&
                filteredUsers.slice(start, start + PAGE_SIZE).map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="avatar">
                          {user.name.slice(0, 2).toUpperCase()}
                        </span>
                        <strong>
                          {user.name}
                          {user.id === currentUserId && (
                            <small className="text-muted block font-normal">
                              You
                            </small>
                          )}
                        </strong>
                      </div>
                    </td>
                    <td>{user.username}</td>
                    <td>{user.email}</td>
                    <td>
                      <span
                        className={`badge ${user.role === "super_admin" ? "badge-admin" : ""}`}
                      >
                        {user.role === "super_admin" ? "Super admin" : "User"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="button-secondary"
                        aria-label={`Edit ${user.name}`}
                        onClick={() => open({ kind: "user", user })}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              {mode === "areas" &&
                filteredAreas.slice(start, start + PAGE_SIZE).map((area) => (
                  <tr key={area.id}>
                    <td>
                      <strong>{area.areaName}</strong>
                    </td>
                    <td>{area.description || "—"}</td>
                    <td>{area.territories.length}</td>
                  </tr>
                ))}
              {mode === "territories" &&
                filteredTerritories
                  .slice(start, start + PAGE_SIZE)
                  .map((territory) => (
                    <tr key={territory.id}>
                      <td>
                        <strong>{territory.territoryName}</strong>
                      </td>
                      <td>{territory.areaName}</td>
                      <td className="location-cell">
                        <LocationList locations={territory.locations} emptyText="—" />
                      </td>
                      <td>{territory.noOfPartners ?? 0}</td>
                      <td>
                        <span className="badge">
                          {territory.withCars
                            ? "Car required"
                            : "No car required"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="button-secondary"
                          aria-label={`Edit ${territory.areaName} ${territory.territoryName}`}
                          onClick={() => open({ kind: "territory", territory })}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {count === 0 && (
          <p className="empty-state">
            {query || role !== "all" || onlyCars
              ? "No matching records. Try a different filter."
              : `No ${mode} yet.`}
          </p>
        )}
        <footer className="pagination">
          <span>
            {count === 0
              ? "0"
              : `${start + 1}–${Math.min(start + PAGE_SIZE, count)}`}{" "}
            of {count} {mode}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="button-secondary"
              disabled={activePage <= 1}
              onClick={() => setPage(activePage - 1)}
            >
              Previous
            </button>
            <span>
              {activePage} / {pages}
            </span>
            <button
              className="button-secondary"
              disabled={activePage >= pages}
              onClick={() => setPage(activePage + 1)}
            >
              Next
            </button>
          </div>
        </footer>
      </section>
      {editor && (
        <AdminRecordEditor
          mode={mode}
          areas={areas}
          editor={editor}
          currentUserId={currentUserId}
          pending={pending}
          error={error}
          close={close}
          submit={submit}
          onDelete={(data) => run(deleteDatabaseUser, data)}
        />
      )}
    </>
  );
};
