import Link from "next/link";
import Icon from "@mdi/react";
import {
  mdiAccountGroupOutline,
  mdiMapOutline,
  mdiMapMarkerOutline,
  mdiCarOutline,
} from "@mdi/js";
import { requireAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

const AdminPage = async () => {
  await requireAdmin();
  const [users, areas, territories, cars, directory] = await Promise.all([
    prisma.user.count(),
    prisma.area.count(),
    prisma.territory.count(),
    prisma.territory.count({ where: { withCars: true } }),
    prisma.territory.findMany({
      take: 8,
      orderBy: [{ area: { areaName: "asc" } }, { territoryName: "asc" }],
      select: {
        id: true,
        territoryName: true,
        locations: true,
        noOfPartners: true,
        withCars: true,
        area: { select: { areaName: true } },
      },
    }),
  ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Overview</h1>
          <p>Manage your people and territory directory.</p>
        </div>
      </div>
      <div className="stats-grid" data-tutorial="admin-counts">
        {[
          {
            label: "Total users",
            count: users,
            icon: mdiAccountGroupOutline,
            href: "/admin/users",
          },
          {
            label: "Areas",
            count: areas,
            icon: mdiMapOutline,
            href: "/admin/areas",
          },
          {
            label: "Territories",
            count: territories,
            icon: mdiMapMarkerOutline,
            href: "/admin/territories",
          },
          {
            label: "Car required",
            count: cars,
            icon: mdiCarOutline,
            href: "/admin/territories?transport=car",
          },
        ].map((stat) => (
          <Link href={stat.href} key={stat.label} className="stat-card">
            <Icon path={stat.icon} size={1.2} aria-hidden />
            <div>
              <span>{stat.label}</span>
              <strong>{stat.count}</strong>
            </div>
          </Link>
        ))}
      </div>
      <div className="overview-grid" data-tutorial="admin-directory">
        <section className="surface">
          <div className="section-heading">
            <h2>Territory directory</h2>
            <Link className="button-secondary" href="/admin/territories">
              Manage territories
            </Link>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Territory</th>
                  <th>Area</th>
                  <th>Location</th>
                  <th>Pairs</th>
                  <th>Transport</th>
                </tr>
              </thead>
              <tbody>
                {directory.map((territory) => (
                  <tr key={territory.id}>
                    <td>
                      <strong>{territory.territoryName}</strong>
                    </td>
                    <td>{territory.area.areaName}</td>
                    <td className="location-cell">
                      {territory.locations || "—"}
                    </td>
                    <td>{territory.noOfPartners ?? 0}</td>
                    <td>
                      <span className="badge">
                        {territory.withCars
                          ? "Car required"
                          : "No car required"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {directory.length === 0 && (
              <p className="empty-state">
                No territories yet. Add an area and territory to get started.
              </p>
            )}
          </div>
        </section>
        <section className="surface quick-actions">
          <h2>Quick actions</h2>
          <p className="text-muted text-sm">Keep your workspace up to date.</p>
          <Link className="button-secondary" href="/admin/users?new=1">
            + Add user
          </Link>
          <Link className="button-secondary" href="/admin/areas?new=1">
            + Add area
          </Link>
          <Link className="button-secondary" href="/admin/territories?new=1">
            + Add territory
          </Link>
        </section>
      </div>
    </>
  );
};
export default AdminPage;
