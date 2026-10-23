import { loadAdminAreas } from "@/lib/admin-data";
import { SuperAdminPanel } from "@/components/super-admin-panel";

const TerritoriesPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; transport?: string }>;
}) => {
  const [areas, params] = await Promise.all([loadAdminAreas(), searchParams]);
  return (
    <SuperAdminPanel
      mode="territories"
      areas={areas}
      initiallyCreate={params.new === "1"}
      carOnly={params.transport === "car"}
    />
  );
};
export default TerritoriesPage;
