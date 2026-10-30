
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { InsertUser } from "../drizzle/schema";
import { users } from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily initialize Drizzle so local tools can run without a database.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const databaseUrl = process.env.DATABASE_URL;
      const useSSL = process.env.DB_SSL === "true";

      _db = drizzle({
        connection: {
          uri: databaseUrl,
          ...(useSSL
            ? {
                ssl: {
                  minVersion: "TLSv1.2",
                  rejectUnauthorized: true,
                },
              }
            : {}),
        },
      });
    } catch (error) {
      console.error(
        "[Database] Failed to initialize database:",
        error
      );

      _db = null;
    }
  }

  return _db;
}

export async function upsertUser(
  user: InsertUser
): Promise<void> {
  if (!user.openId) {
    throw new Error(
      "User openId is required for upsert"
    );
  }

  const db = await getDb();

  if (!db) {
    throw new Error("Database is not available");
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };

    const updateSet: Record<string, unknown> = {};

    const textFields = [
      "name",
      "email",
      "loginMethod",
    ] as const;

    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];

      if (value === undefined) {
        return;
      }

      const normalized = value ?? null;

      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }

    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db
      .insert(users)
      .values(values)
      .onDuplicateKeyUpdate({
        set: updateSet,
      });
  } catch (error) {
    console.error(
      "[Database] Failed to upsert user:",
      error
    );

    throw error;
  }
}

export async function getUserByOpenId(
  openId: string
) {
  const db = await getDb();

  if (!db) {
    console.warn(
      "[Database] Cannot get user: database not available"
    );

    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0
    ? result[0]
    : undefined;
}

// TODO: Add feature queries as the schema grows.
