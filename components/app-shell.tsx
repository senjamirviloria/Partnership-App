"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import Icon from "@mdi/react";
import {
  mdiViewDashboardOutline,
  mdiAccountGroupOutline,
  mdiMapOutline,
  mdiMapMarkerOutline,
  mdiViewColumnOutline,
  mdiArrowTopRight,
  mdiHexagonMultipleOutline,
} from "@mdi/js";

import { authClient } from "@/lib/auth-client";
import { ThemeControl } from "@/components/theme-control";
import { Modal } from "@/components/modal";

type Props = {
  children: ReactNode;
  user: { name: string; email: string; role: string };
  admin?: boolean;
};

export const AppShell = ({ children, user, admin = false }: Props) => {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const links = admin
    ? [
        { href: "/admin", label: "Overview", icon: mdiViewDashboardOutline },
        { href: "/admin/users", label: "Users", icon: mdiAccountGroupOutline },
        { href: "/admin/areas", label: "Areas", icon: mdiMapOutline },
        {
          href: "/admin/territories",
          label: "Territories",
          icon: mdiMapMarkerOutline,
        },
      ]
    : [
        {
          href: "/workspace",
          label: "Assignment board",
          icon: mdiViewColumnOutline,
        },
      ];
  const navigation = (
    <>
      <Link href={admin ? "/admin" : "/workspace"} className="brand">
        <Icon path={mdiHexagonMultipleOutline} size={1.2} aria-hidden />
        Partnership
      </Link>
      <p className="workspace-badge">
        {admin ? "Admin workspace" : "My workspace"}
      </p>
      <nav aria-label={admin ? "Admin navigation" : "Workspace navigation"}>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            <Icon path={link.icon} size={0.9} aria-hidden />
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        {(admin || user.role === "super_admin") && (
          <Link
            className="workspace-switch"
            href={admin ? "/workspace" : "/admin"}
            onClick={() => setMenuOpen(false)}
          >
            <Icon path={mdiArrowTopRight} size={0.8} aria-hidden />
            {admin ? "Open user workspace" : "Open admin dashboard"}
          </Link>
        )}
        <div className="profile">
          <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
        </div>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">{navigation}</aside>
      {menuOpen && (
        <Modal title="Navigation" drawer onClose={() => setMenuOpen(false)}>
          <div className="mobile-navigation">{navigation}</div>
        </Modal>
      )}
      <div className="shell-body">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="icon-button xl:hidden"
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              ☰
            </button>
            <span className="mobile-brand">Partnership</span>
            <span className="text-sm font-medium text-muted">
              {admin ? "Administration" : "Territory workspace"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeControl />
            <button
              className="button-secondary"
              onClick={async () => {
                if (
                  !window.dispatchEvent(
                    new Event("partnership-before-leave", { cancelable: true }),
                  )
                )
                  return;
                try {
                  const result = await authClient.signOut();
                  if (result.error) throw new Error(result.error.message);
                  router.push("/login");
                  router.refresh();
                } catch {
                  setSignOutError("Unable to sign out. Please try again.");
                }
              }}
            >
              Sign out
            </button>
          </div>
        </header>
        {signOutError && (
          <p role="alert" className="notice">
            {signOutError}
          </p>
        )}
        <div className="shell-content">{children}</div>
      </div>
    </div>
  );
};
