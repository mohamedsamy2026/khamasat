
import { COOKIE_NAME } from "@shared/const";
import { AUTH_COOKIE_NAME, revokeAuthSession } from "./auth/session";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),

    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookieHeader = ctx.req.headers.cookie ?? "";

      const sessionCookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));

      if (sessionCookie) {
        const token = sessionCookie.slice(AUTH_COOKIE_NAME.length + 1);
        await revokeAuthSession(token);
      }

      // Remove the new local session cookie
      ctx.res.clearCookie(AUTH_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });

      // Remove the legacy Manus cookie during migration
      const legacyOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, legacyOptions);

      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
