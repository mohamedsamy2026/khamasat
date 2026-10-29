
import type { QueryClient } from "@tanstack/react-query";
import { clearDemoToken } from "@/lib/athleteApi";

export function safeRedirect(): string {
  const raw = new URLSearchParams(
    window.location.search
  ).get("redirect");

  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\")
  ) {
    return "/academies";
  }

  try {
    const target = new URL(
      raw,
      window.location.origin
    );

    if (
      target.origin !== window.location.origin ||
      target.pathname === "/login" ||
      target.pathname === "/register"
    ) {
      return "/academies";
    }

    return (
      target.pathname +
      target.search +
      target.hash
    );
  } catch {
    return "/academies";
  }
}

export async function finishAuthentication(
  client: QueryClient
): Promise<void> {
  // Remove the previous demo session token.
  clearDemoToken();

  // Prevent carrying organization selection across accounts.
  try {
    localStorage.removeItem("athlete-organization");
  } catch {
    // Browser storage may be unavailable.
  }

  // Remove cached organization-specific data.
  client.removeQueries({
    queryKey: ["athlete"],
  });

  await Promise.all([
    client.invalidateQueries({
      queryKey: ["local-auth", "me"],
    }),
    client.invalidateQueries({
      queryKey: ["athlete-session"],
    }),
  ]);

  window.location.assign(safeRedirect());
}

export async function authPost(
  path: "login" | "register",
  payload: object
): Promise<void> {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body: {
    error?: string;
    success?: boolean;
  } = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 409) {
      throw new Error(
        "هذا البريد مرتبط بحساب موجود بالفعل."
      );
    }

    if (response.status === 429) {
      throw new Error(
        "محاولات كثيرة. حاول لاحقًا."
      );
    }

    if (response.status === 401) {
      throw new Error(
        "البريد الإلكتروني أو كلمة المرور غير صحيحة."
      );
    }

    if (response.status === 400) {
      throw new Error(
        "تأكد من صحة البيانات المدخلة."
      );
    }

    throw new Error(
      body.error ||
        "تعذر إتمام العملية. حاول مجددًا."
    );
  }

  if (!body.success) {
    throw new Error(
      "لم يؤكد الخادم نجاح العملية."
    );
  }
}
