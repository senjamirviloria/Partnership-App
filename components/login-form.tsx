"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@mdi/react";
import { mdiEye, mdiEyeOff } from "@mdi/js";

import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });

    setLoading(false);
    if (signInError) {
      setError(signInError.message || "Unable to sign in.");
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
      <h1 className="mb-1 text-2xl font-bold">Login</h1>
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">Sign in to manage territory assignments.</p>

      <label className="mb-2 block text-sm font-medium">Email</label>
      <input
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="mb-3 w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-gray-900 dark:text-gray-100"
      />

      <label className="mb-2 block text-sm font-medium">Password</label>
      <div className="mb-4 flex items-center rounded border border-gray-300 dark:border-gray-600 px-3 focus-within:border-gray-400">
        <input
          type={showPassword ? "text" : "password"}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full border-0 bg-transparent py-2 pr-3 text-gray-900 outline-none dark:text-gray-100"
        />
        <button
          type="button"
          onClick={() => setShowPassword((current) => !current)}
          className="shrink-0 text-gray-700 dark:text-gray-200 hover:text-black"
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          <Icon path={showPassword ? mdiEyeOff : mdiEye} size={0.9} aria-hidden />
        </button>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}

      <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">Account access is managed by the administrator.</p>
    </form>
  );
}
