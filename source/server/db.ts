
import { eq } from "drizzle-orm";
import {
  drizzle,
  type MySql2Database,
} from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import type { InsertUser } from "../drizzle/schema";
import { users } from "../drizzle/schema";

type Database = MySql2Database;
let _db: Database | null = null;
let _dbPromise: Promise<Database | null> | null = null;

// --------------------------------------------------
// Database connection initialization
// --------------------------------------------------

async function initializeDatabase(): Promise<Database | null> {
  let pool: ReturnType<typeof mysql.createPool> | null = null;

  try {
    const useSeparateConfig = Boolean(process.env.DB_HOST);

    let host: string;
    let port: number;
    let user: string;
    let password: string;
    let database: string;

    if (useSeparateConfig) {
      // Production: Render + TiDB Cloud

      host = process.env.DB_HOST || "";
      port = Number(process.env.DB_PORT || "4000");
      user = process.env.DB_USER || "";
      password = process.env.DB_PASSWORD || "";
      database = process.env.DB_NAME || "";

      if (!host || !user || !password || !database) {
        throw new Error(
          "Missing TiDB connection environment variables"
        );
      }
    } else {
      // Local development: MySQL DATABASE_URL

      const databaseUrl = process.env.DATABASE_URL;

      if (!databaseUrl) {
        console.warn(
          "[Database] DATABASE_URL is not configured"
        );
        return null;
      }

      const parsedUrl = new URL(databaseUrl);

      if (parsedUrl.protocol !== "mysql:") {
        throw new Error(
          "DATABASE_URL must use the mysql:// protocol"
        );
      }

      host = parsedUrl.hostname;
      port = Number(parsedUrl.port || "3306");
      user = decodeURIComponent(parsedUrl.username);
      password = decodeURIComponent(parsedUrl.password);
      database = decodeURIComponent(
        parsedUrl.pathname.replace(/^\//, "")
      );

      if (!host || !user || !database) {
        throw new Error(
          "Invalid DATABASE_URL configuration"
        );
      }
    }

    if (
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      throw new Error("Invalid database port");
    }

    const useSSL = process.env.DB_SSL === "true";

    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,

      ssl: useSSL
        ? {
            minVersion: "TLSv1.2",
            rejectUnauthorized: true,
          }
        : undefined,

      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 15000,
    });

    // Verify credentials and connectivity before
    // returning a working Drizzle instance.
    await pool.query("SELECT 1");

    const db = drizzle({
      client: pool,
    });

    console.info("[Database] Connected successfully");

    return db;
  } catch (error) {
    console.error(
      "[Database] Connection failed:",
      error instanceof Error
        ? error.message
        : "Unknown database error"
    );

    if (pool) {
      try {
        await pool.end();
      } catch {
        // Ignore cleanup errors.
      }
    }

    return null;
  }
}

// --------------------------------------------------
// Get shared database instance
// --------------------------------------------------

export async function getDb(): Promise<Database | null> {
  if (_db) {
    return _db;
  }

  if (!_dbPromise) {
    _dbPromise = initializeDatabase();
  }

  const db = await _dbPromise;

  if (db) {
    _db = db;
  } else {
    // Allow a new attempt after a failed connection.
    _dbPromise = null;
  }

  return db;
}

// --------------------------------------------------
// Create or update user
// --------------------------------------------------

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

// --------------------------------------------------
// Get user by Open ID
// --------------------------------------------------

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
