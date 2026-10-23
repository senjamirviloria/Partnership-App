import { loadAdminAreas } from "@/lib/admin-data";
import { SuperAdminPanel } from "@/components/super-admin-panel";

const AreasPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) => {
  const [areas, params] = await Promise.all([loadAdminAreas(), searchParams]);
  return (
    <SuperAdminPanel
      mode="areas"
      areas={areas}
      initiallyCreate={params.new === "1"}
    />
  );
};
export default AreasPage;
