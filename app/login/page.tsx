import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ThemeControl } from "@/components/theme-control";
import { LoginForm } from "@/components/login-form";
import { auth } from "@/lib/auth";

export default async function LoginPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
      <div className="absolute right-6 top-6"><ThemeControl /></div>
      <LoginForm />
    </main>
  );
}
