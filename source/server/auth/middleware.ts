
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import { AUTH_COOKIE_NAME, getSessionUser } from "./session";

export async function authenticateLocalRequest(
  req: Request
): Promise<User | null> {
  const cookieHeader = req.headers.cookie ?? "";

  const sessionCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));

  if (!sessionCookie) {
    return null;
  }

  const token = sessionCookie.slice(AUTH_COOKIE_NAME.length + 1);

  return getSessionUser(token);
}
