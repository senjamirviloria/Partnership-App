import { redirect } from "next/navigation";
import { requireUser } from "@/lib/current-user";

const HomePage = async () => {
  const user = await requireUser();
  redirect(user.role === "super_admin" ? "/admin" : "/workspace");
};
export default HomePage;
