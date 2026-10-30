
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is required to run Drizzle commands"
  );
}

const useSSL = process.env.DB_SSL === "true";

const databaseUrl = new URL(connectionString);

if (
  databaseUrl.protocol !== "mysql:" &&
  databaseUrl.protocol !== "mysql2:"
) {
  throw new Error(
    "DATABASE_URL must be a MySQL connection string"
  );
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",

  dbCredentials: useSSL
    ? {
        host: databaseUrl.hostname,
        port: Number(databaseUrl.port || 3306),
        user: decodeURIComponent(databaseUrl.username),
        password: decodeURIComponent(databaseUrl.password),
        database: databaseUrl.pathname.replace(/^\//, ""),
        ssl: {
          minVersion: "TLSv1.2",
          rejectUnauthorized: true,
        },
      }
    : {
        url: connectionString,
      },
});
