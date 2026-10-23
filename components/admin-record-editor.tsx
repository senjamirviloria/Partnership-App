"use client";

import type { FormEvent } from "react";
import type { AdminArea, AdminEditor, AdminMode } from "@/lib/admin-data";
import { Modal } from "@/components/modal";

type Props = {
  mode: AdminMode;
  areas: AdminArea[];
  editor: AdminEditor;
  currentUserId?: string;
  pending: boolean;
  error: string;
  close: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (data: FormData) => void;
};

export const AdminRecordEditor = ({
  mode,
  areas,
  editor,
  currentUserId,
  pending,
  error,
  close,
  submit,
  onDelete,
}: Props) => {
  const editingUser = editor.kind === "user" ? editor.user : null;
  const editingTerritory =
    editor.kind === "territory" ? editor.territory : null;
  const singular =
    mode === "users" ? "user" : mode === "areas" ? "area" : "territory";
  const title = `${editor.kind === "create" ? "Add" : "Edit"} ${singular}`;
  return (
    <Modal title={title} drawer onClose={close} busy={pending}>
      <form
        onSubmit={submit}
        className="editor-form"
        key={editingUser?.id ?? editingTerritory?.id ?? "new"}
      >
        <fieldset disabled={pending}>
          {mode === "users" && (
            <>
              {editingUser && (
                <input type="hidden" name="userId" value={editingUser.id} />
              )}
              <label>
                Full name
                <input
                  name="name"
                  required
                  defaultValue={editingUser?.name}
                  autoComplete="name"
                />
              </label>
              <label>
                Username
                <input
                  name="username"
                  required
                  defaultValue={editingUser?.username}
                  autoComplete="off"
                />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={editingUser?.email}
                  autoComplete="email"
                />
              </label>
              <label>
                Role
                <select name="role" defaultValue={editingUser?.role ?? "user"}>
                  <option value="user">User</option>
                  <option value="super_admin">Super admin</option>
                </select>
              </label>
              <div className="form-divider" />
              <label>
                {editingUser ? "New password (optional)" : "Password"}
                <input
                  name="password"
                  type="password"
                  required={!editingUser}
                  autoComplete="new-password"
                />
              </label>
              {editingUser && (
                <p className="text-muted text-sm">
                  Leave blank to keep the current password.
                </p>
              )}
            </>
          )}
          {mode === "areas" && (
            <>
              <label>
                Area name
                <input name="areaName" required maxLength={100} />
              </label>
              <label>
                Description
                <input name="description" maxLength={255} />
              </label>
            </>
          )}
          {mode === "territories" && (
            <>
              {editingTerritory ? (
                <>
                  <input
                    type="hidden"
                    name="territoryId"
                    value={editingTerritory.id}
                  />
                  <p className="text-muted text-sm">
                    Area: {editingTerritory.areaName}
                  </p>
                </>
              ) : (
                <label>
                  Area
                  <select name="areaId" required>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.areaName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Name
                <input
                  name="territoryName"
                  required
                  maxLength={120}
                  defaultValue={editingTerritory?.territoryName}
                />
              </label>
              <label>
                Number of pairs
                <input
                  name="noOfPartners"
                  type="number"
                  min="0"
                  step="1"
                  required
                  defaultValue={editingTerritory?.noOfPartners ?? 1}
                />
              </label>
              <label className="checkbox-label">
                <input
                  name="withCars"
                  type="checkbox"
                  defaultChecked={editingTerritory?.withCars}
                />
                Car required
              </label>
              <label>
                Locations
                <textarea
                  name="locations"
                  rows={5}
                  aria-describedby="locations-help"
                  defaultValue={editingTerritory?.locations ?? ""}
                />
              </label>
              <p id="locations-help" className="text-muted text-xs">
                Separate locations with a semicolon (;). Each location gets its own Google Maps link.
              </p>
            </>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="editor-footer">
          <button
            type="button"
            className="button-secondary"
            disabled={pending}
            onClick={close}
          >
            Cancel
          </button>
          <button className="button-primary" disabled={pending}>
            {pending
              ? "Saving…"
              : editor.kind === "create"
                ? `Create ${singular}`
                : "Save changes"}
          </button>
        </div>
      </form>
      {editingUser && (
        <div className="danger-zone">
          <p className="text-muted text-sm">
            Deleting an account also removes its saved assignments.
          </p>
          <button
            className="button-danger"
            disabled={pending || editingUser.id === currentUserId}
            onClick={() => {
              if (
                window.confirm(
                  `Delete ${editingUser.email}? This also removes their saved assignments.`,
                )
              ) {
                const data = new FormData();
                data.set("userId", editingUser.id);
                onDelete(data);
              }
            }}
          >
            Delete user
          </button>
          {editingUser.id === currentUserId && (
            <p className="text-muted text-sm">
              You cannot delete your own account.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
};
