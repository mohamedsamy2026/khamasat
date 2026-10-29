
import { trpc } from "@/lib/trpc";
import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clearDemoToken } from "@/lib/athleteApi";
type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

type AuthUser = {
  id: number;
  name: string | null;
  email: string | null;
  role: "user" | "admin";
};

async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Authentication request failed: ${response.status}`);
  }

  const data = await response.json();

  return data.user ?? null;
}

export function useAuth(options?: UseAuthOptions) {
  const {
    redirectOnUnauthenticated = false,
    redirectPath = "/login",
  } = options ?? {};

  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  const meQuery = useQuery({
    queryKey: ["local-auth", "me"],
    queryFn: fetchCurrentUser,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });


const logout = useCallback(async () => {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Logout failed: ${response.status}`);
  }

  // Clear the previous user's session and private cached data.
  queryClient.setQueryData(["local-auth", "me"], null);
  utils.auth.me.setData(undefined, null);

  queryClient.removeQueries({
    queryKey: ["athlete"],
  });

  queryClient.removeQueries({
    queryKey: ["athlete-session"],
  });

  clearDemoToken();

  try {
    localStorage.removeItem("athlete-organization");
  } catch {
    // Storage may be unavailable.
  }

  // Reload to reset in-memory organization and session state.
  window.location.replace("/");
}, [queryClient, utils]);


  const state = useMemo(
    () => ({
      user: meQuery.data ?? null,
      loading: meQuery.isPending,
      error: meQuery.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    }),
    [meQuery.data, meQuery.isPending, meQuery.error]
  );

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isPending || meQuery.isError) return;
    if (state.isAuthenticated) return;

    if (window.location.pathname === redirectPath) return;

    window.location.assign(redirectPath);
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    meQuery.isPending,
    meQuery.isError,
    state.isAuthenticated,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
