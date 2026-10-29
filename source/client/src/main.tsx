
import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";

import App from "./App";
import { startLogin } from "./const";
import "./index.css";

const queryClient = new QueryClient();

/**
 * Redirect unauthorized users to the local login page.
 *
 * Authentication now relies on the application's own
 * HTTP-only session cookie instead of Manus OAuth.
 */
function redirectToLoginIfUnauthorized(error: unknown): void {
  if (!(error instanceof TRPCClientError)) return;

  if (typeof window === "undefined") return;

  const errorCode = (
    error.data as { code?: string } | undefined
  )?.code;

  if (errorCode !== "UNAUTHORIZED") return;

  // Avoid redirecting repeatedly while already on auth pages.
  if (
    window.location.pathname === "/login" ||
    window.location.pathname === "/register"
  ) {
    return;
  }

  startLogin();
}

/**
 * Handle API query errors.
 */
queryClient.getQueryCache().subscribe(event => {
  if (
    event.type !== "updated" ||
    event.action.type !== "error"
  ) {
    return;
  }

  const error = event.query.state.error;

  redirectToLoginIfUnauthorized(error);

  console.error("[API Query Error]", error);
});

/**
 * Handle API mutation errors.
 */
queryClient.getMutationCache().subscribe(event => {
  if (
    event.type !== "updated" ||
    event.action.type !== "error"
  ) {
    return;
  }

  const error = event.mutation.state.error;

  redirectToLoginIfUnauthorized(error);

  console.error("[API Mutation Error]", error);
});

/**
 * Create the tRPC client.
 *
 * Browser cookies are sent automatically to the same-origin
 * backend. No session tokens are stored in localStorage
 * or sessionStorage.
 */
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",

      transformer: superjson,

      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

/**
 * Application root.
 */
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element was not found");
}

createRoot(rootElement).render(
  <trpc.Provider
    client={trpcClient}
    queryClient={queryClient}
  >
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
