import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Membership, Session } from "@shared/athlete";

const DEMO_TOKEN_KEY = "athlete-demo-token";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

let memoryOrganization: string | null = null;
let memoryDemoToken: string | null = null;

function currentOrganization() {
  try {
    return memoryOrganization ?? localStorage.getItem("athlete-organization");
  } catch {
    return memoryOrganization;
  }
}

function storeOrganization(id: number) {
  memoryOrganization = String(id);
  try {
    localStorage.setItem("athlete-organization", String(id));
  } catch {
    /* Session memory still works on restricted browsers. */
  }
}

function currentDemoToken() {
  if (memoryDemoToken) return memoryDemoToken;
  try {
    const token =
      sessionStorage.getItem(DEMO_TOKEN_KEY) ??
      localStorage.getItem(DEMO_TOKEN_KEY);
    memoryDemoToken = token || null;
    return memoryDemoToken;
  } catch {
    return memoryDemoToken;
  }
}

function storeDemoToken(token: string) {
  memoryDemoToken = token;
  try {
    sessionStorage.setItem(DEMO_TOKEN_KEY, token);
  } catch {
    /* Memory remains available in restricted browser contexts. */
  }
  try {
    localStorage.setItem(DEMO_TOKEN_KEY, token);
  } catch {
    /* Memory remains available in restricted browser contexts. */
  }
}

export function clearDemoToken() {
  memoryDemoToken = null;
  try {
    sessionStorage.removeItem(DEMO_TOKEN_KEY);
  } catch {
    /* Nothing else is needed when browser storage is unavailable. */
  }
  try {
    localStorage.removeItem(DEMO_TOKEN_KEY);
  } catch {
    /* Nothing else is needed when browser storage is unavailable. */
  }
}

function requestHeaders(options: HeadersInit = {}) {
  const headers = new Headers(options);
  const org = currentOrganization();
  const demoToken = currentDemoToken();
  if (org && !headers.has("X-Organization-Id"))
    headers.set("X-Organization-Id", org);
  if (demoToken && !headers.has("X-Demo-Token"))
    headers.set("X-Demo-Token", demoToken);
  return headers;
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = requestHeaders(options.headers);
  if (
    options.body &&
    typeof options.body === "string" &&
    !headers.has("Content-Type")
  )
    headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/athlete${path}`, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    const message =
      problem.error === "Invalid session cookie"
        ? "يرجى تسجيل الدخول للوصول إلى هذه البيانات"
        : problem.error ||
          problem.message ||
          "تعذر إتمام الطلب، يرجى المحاولة مجددًا";
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function downloadPrivate(path: string): Promise<Blob> {
  const response = await fetch(`/api/athlete${path}`, {
    headers: requestHeaders(),
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new ApiError(
      problem.error || "لا تملك صلاحية الوصول إلى الملف",
      response.status
    );
  }
  return response.blob();
}

export function uploadVideo<T>({
  playerId,
  title,
  skill,
  recordedAt,
  file,
  mime,
  onProgress,
}: {
  playerId: number;
  title: string;
  skill: string;
  recordedAt: string;
  file: File;
  mime: string;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<T> {
  const query = new URLSearchParams({
    playerId: String(playerId),
    skill,
    name: title,
    recordedAt,
  });

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/athlete/videos?${query.toString()}`, true);
    request.withCredentials = true;
    request.responseType = "text";
    requestHeaders({ "Content-Type": mime }).forEach((value, key) => {
      request.setRequestHeader(key, value);
    });
    request.upload.onprogress = event => {
      const total = event.total || file.size;
      onProgress?.(event.loaded, total);
    };
    request.onerror = () =>
      reject(new ApiError("تعذر الاتصال أثناء رفع الفيديو.", 0));
    request.onabort = () =>
      reject(new ApiError("تم إلغاء رفع الفيديو قبل الحفظ.", 0));
    request.onload = () => {
      let body: unknown = undefined;
      try {
        body = request.responseText ? JSON.parse(request.responseText) : undefined;
      } catch {
        // A malformed response is handled below with a clear save-confirmation error.
      }
      if (request.status !== 201) {
        const problem = body as { error?: string; message?: string } | undefined;
        reject(
          new ApiError(
            problem?.error ||
              problem?.message ||
              "لم يؤكد الخادم حفظ الفيديو؛ لم يُعتبر المقطع محفوظًا.",
            request.status
          )
        );
        return;
      }
      if (!body) {
        reject(new ApiError("تعذر قراءة تأكيد حفظ الفيديو من الخادم.", 502));
        return;
      }
      resolve(body as T);
    };
    request.send(file);
  });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

type ContextValue = {
  session: Session | undefined;
  organization: Membership | undefined;
  orgId: number | undefined;
  setOrgId: (id: number) => void;
  loading: boolean;
  error: unknown;
  invalidate: () => Promise<void>;
  enterDemo: (type: "academy" | "club") => Promise<void>;
  initialize: () => Promise<void>;
};

const AthleteContext = createContext<ContextValue | null>(null);

export function AthleteProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [bootstrappingDemo, setBootstrappingDemo] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<unknown>(null);
  const demoBootstrapStarted = useRef(false);
  const query = useQuery({
    queryKey: ["athlete-session"],
    queryFn: () => api<Session>("/session"),
    retry: false,
  });
  const [orgId, setOrg] = useState<number | undefined>(() => {
    const n = Number(currentOrganization());
    return n > 0 ? n : undefined;
  });

  useEffect(() => {
    const session = query.data;
    if (!session) return;

    if (session.user) {
      clearDemoToken();
      return;
    }
    if (session.mode === "demo") {
      if (session.demoToken) storeDemoToken(session.demoToken);
      return;
    }
    if (demoBootstrapStarted.current) return;

    let active = true;
    demoBootstrapStarted.current = true;
    setBootstrapError(null);
    setBootstrappingDemo(true);
    void api<Session>("/demo-session", { method: "POST" })
      .then(nextSession => {
        if (!active) return;
        if (nextSession.mode === "demo" && nextSession.demoToken)
          storeDemoToken(nextSession.demoToken);
        client.setQueryData(["athlete-session"], nextSession);
      })
      .catch(problem => {
        if (active) setBootstrapError(problem);
      })
      .finally(() => {
        if (active) setBootstrappingDemo(false);
      });

    return () => {
      active = false;
    };
  }, [client, query.data]);

  const memberships = query.data?.memberships ?? [];
  const organization =
    memberships.find(m => m.organizationId === orgId) ?? memberships[0];

  useEffect(() => {
    if (organization && organization.organizationId !== orgId) {
      storeOrganization(organization.organizationId);
      setOrg(organization.organizationId);
    }
  }, [organization, orgId]);

  const invalidate = async () => {
    demoBootstrapStarted.current = false;
    setBootstrapError(null);
    await Promise.all([
      client.invalidateQueries({ queryKey: ["local-auth", "me"] }),
      client.invalidateQueries({ queryKey: ["athlete"] }),
      client.invalidateQueries({ queryKey: ["athlete-session"] }),
    ]);
  };

  const setOrgId = (id: number) => {
    if (!memberships.some(m => m.organizationId === id)) return;
    storeOrganization(id);
    setOrg(id);
    client.removeQueries({ queryKey: ["athlete"] });
  };

  const enterDemo = async (type: "academy" | "club") => {
    const next =
      query.data?.mode === "demo"
        ? query.data
        : await api<Session>("/demo-session", { method: "POST" });
    if (next.mode !== "demo" || next.user)
      throw new ApiError("تعذر تهيئة مساحة العرض الافتراضية.", 503);
    const membership = next.memberships.find(item => item.type === type);
    if (!membership) throw new ApiError("منظور العرض المطلوب غير متاح.", 503);
    if (next.demoToken) storeDemoToken(next.demoToken);
    storeOrganization(membership.organizationId);
    setOrg(membership.organizationId);
    client.setQueryData(["athlete-session"], next);
    client.removeQueries({ queryKey: ["athlete"] });
  };

  const initialize = async () => {
    if (!query.data?.user || query.data.mode === "demo")
      throw new ApiError("تتطلب هذه العملية جلسة عضو مسجل الدخول.", 403);
    await api<Session>("/setup-demo", { method: "POST" });
    await invalidate();
  };

  return (
    <AthleteContext.Provider
      value={{
        session: query.data,
        organization,
        orgId: organization?.organizationId,
        setOrgId,
        loading: query.isLoading || bootstrappingDemo,
        error: query.error ?? bootstrapError,
        invalidate,
        enterDemo,
        initialize,
      }}
    >
      {children}
    </AthleteContext.Provider>
  );
}

export function useAthlete() {
  const value = useContext(AthleteContext);
  if (!value) throw new Error("AthleteProvider is missing");
  return value;
}

export function useApi<T>(path: string, enabled = true) {
  const { orgId, session } = useAthlete();
  return useQuery<T, ApiError>({
    queryKey: ["athlete", orgId, path],
    queryFn: () =>
      api<T>(path, {
        headers: orgId ? { "X-Organization-Id": String(orgId) } : {},
      }),
    enabled:
      enabled && !!orgId && Boolean(session?.user || session?.mode === "demo"),
    retry: false,
  });
}
