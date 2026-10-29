
export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Redirect the user to the local login page.
 *
 * This replaces the previous Manus OAuth flow while preserving
 * the startLogin() API used throughout the frontend.
 */
export const startLogin = (): void => {
  if (typeof window === "undefined") return;

  const currentPath =
    window.location.pathname +
    window.location.search +
    window.location.hash;

  // Prevent redirect loops.
  if (
    window.location.pathname === "/login" ||
    window.location.pathname === "/register"
  ) {
    return;
  }

  const params = new URLSearchParams();

  // Return the user to the page they originally requested.
  if (currentPath !== "/") {
    params.set("redirect", currentPath);
  }

  const query = params.toString();

  window.location.assign(
    query ? `/login?${query}` : "/login"
  );
};
