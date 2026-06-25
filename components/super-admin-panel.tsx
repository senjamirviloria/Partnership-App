"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createArea,
  createDatabaseUser,
  createTerritory,
  deleteDatabaseUser,
  updateDatabaseUser,
  updateTerritory,
} from "@/app/super-admin-actions";

type AdminTerritory = {
  id: number;
  territoryName: string;
  locations: string | null;
  noOfPartners: number | null;
  withCars: boolean;
};

type AdminArea = {
  id: number;
  areaName: string;
  territories: AdminTerritory[];
};

type AdminUser = {
  id: string;
  email: string;
  username: string;
  name: string;
  role: string;
};

type Props = {
  areas: AdminArea[];
  users: AdminUser[];
};

function getInitialTerritory(areas: AdminArea[]) {
  return areas[0]?.territories[0] ?? null;
}

function getMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function SuperAdminPanel({ areas, users }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<number | null>(() => getInitialTerritory(areas)?.id ?? null);

  const territories = useMemo(() => areas.flatMap((area) => area.territories.map((territory) => ({
    ...territory,
    areaName: area.areaName,
  }))), [areas]);
  const selectedTerritory = territories.find((territory) => territory.id === selectedTerritoryId) ?? territories[0] ?? null;

  const submitAction = (
    event: FormEvent<HTMLFormElement>,
    action: (formData: FormData) => Promise<{ ok: boolean; message: string }>,
    fallback: string,
    confirmMessage?: string,
  ) => {
    event.preventDefault();
    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      setStatus("Saving...");
      try {
        const result = await action(formData);
        setStatus(result.message);
        router.refresh();
      } catch (error) {
        setStatus(getMessage(error, fallback));
      }
    });
  };

  return (
    <section className="mx-auto mb-6 w-full max-w-[1400px] rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Super Admin</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Manage database users and territory records.</p>
        </div>
        {status && <p className="text-sm text-slate-700 dark:text-slate-200">{status}</p>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <form
          onSubmit={(event) => submitAction(event, createDatabaseUser, "Unable to create user.")}
          className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
        >
          <h3 className="mb-3 font-semibold">Add User</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Name</span>
              <input name="name" required className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Username</span>
              <input name="username" required className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Email</span>
              <input name="email" type="email" required className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Password</span>
              <input name="password" type="password" required className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Role</span>
              <select name="role" defaultValue="user" className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                <option value="user">User</option>
                <option value="super_admin">Super admin</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950"
          >
            Create user
          </button>
        </form>

        <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
          <h3 className="mb-3 font-semibold">Edit Territory</h3>
          {selectedTerritory ? (
            <form
              key={selectedTerritory.id}
              onSubmit={(event) => submitAction(event, updateTerritory, "Unable to update territory.")}
              className="space-y-3"
            >
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Territory</span>
                <select
                  value={selectedTerritory.id}
                  onChange={(event) => setSelectedTerritoryId(Number(event.target.value))}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
                >
                  {territories.map((territory) => (
                    <option key={territory.id} value={territory.id}>
                      {territory.areaName} / {territory.territoryName}
                    </option>
                  ))}
                </select>
              </label>
              <input type="hidden" name="territoryId" value={selectedTerritory.id} />
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Name</span>
                  <input name="territoryName" required defaultValue={selectedTerritory.territoryName} className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Pairs</span>
                  <input name="noOfPartners" type="number" min="0" required defaultValue={selectedTerritory.noOfPartners ?? 0} className="w-24 rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input name="withCars" type="checkbox" defaultChecked={selectedTerritory.withCars} />
                  With cars
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Locations</span>
                <textarea name="locations" rows={4} defaultValue={selectedTerritory.locations ?? ""} className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
              </label>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-slate-950 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950"
              >
                Save territory
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">No territories are available.</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <form
          onSubmit={(event) => submitAction(event, createArea, "Unable to add area.")}
          className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
        >
          <h3 className="mb-3 font-semibold">Add Area</h3>
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Area name</span>
              <input name="areaName" required className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Description</span>
              <input name="description" className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
            </label>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950"
          >
            Add area
          </button>
        </form>

        <form
          onSubmit={(event) => submitAction(event, createTerritory, "Unable to add territory.")}
          className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
        >
          <h3 className="mb-3 font-semibold">Add Territory</h3>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Area</span>
              <select name="areaId" className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.areaName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Name</span>
              <input name="territoryName" required className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Pairs</span>
              <input name="noOfPartners" type="number" min="0" required defaultValue={1} className="w-24 rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input name="withCars" type="checkbox" />
              With cars
            </label>
          </div>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium">Locations</span>
            <textarea name="locations" rows={3} className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
          </label>
          <button
            type="submit"
            disabled={isPending || areas.length === 0}
            className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950"
          >
            Add territory
          </button>
        </form>
      </div>

      <div className="mt-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
        <h3 className="mb-3 font-semibold">Edit Users</h3>
        <div className="space-y-3">
          {users.map((user) => (
            <div key={user.id} className="rounded border border-slate-200 p-3 text-sm dark:border-slate-700">
              <form
                onSubmit={(event) => submitAction(event, updateDatabaseUser, "Unable to update user.")}
                className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"
              >
                <input type="hidden" name="userId" value={user.id} />
                <label>
                  <span className="mb-1 block font-medium">Name</span>
                  <input name="name" required defaultValue={user.name} className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
                </label>
                <label>
                  <span className="mb-1 block font-medium">Username</span>
                  <input name="username" required defaultValue={user.username} className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
                </label>
                <label>
                  <span className="mb-1 block font-medium">Email</span>
                  <input name="email" type="email" required defaultValue={user.email} className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
                </label>
                <label>
                  <span className="mb-1 block font-medium">Role</span>
                  <select name="role" defaultValue={user.role} className="w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                    <option value="user">User</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1 block font-medium">New password</span>
                  <input name="password" type="password" placeholder="Leave unchanged" className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" />
                </label>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full rounded-md bg-slate-950 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950"
                  >
                    Save
                  </button>
                </div>
              </form>
              <form
                onSubmit={(event) =>
                  submitAction(
                    event,
                    deleteDatabaseUser,
                    "Unable to delete user.",
                    `Delete ${user.email}? This also removes their saved assignments.`,
                  )
                }
                className="mt-2 flex justify-end"
              >
                <input type="hidden" name="userId" value={user.id} />
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                >
                  Delete user
                </button>
              </form>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
