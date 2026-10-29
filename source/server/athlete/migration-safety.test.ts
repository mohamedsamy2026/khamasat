
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const drizzleDir = join(process.cwd(), "drizzle");

const migrationFiles = readdirSync(drizzleDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const journal = JSON.parse(
  readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf8")
) as {
  entries: Array<{ tag: string; idx: number }>;
};

const sportHealthMigration = "0005_calm_hardball.sql";
const authMigration = "0006_independent_auth.sql";

const sql = readFileSync(
  join(drizzleDir, sportHealthMigration),
  "utf8"
);

const authSql = readFileSync(
  join(drizzleDir, authMigration),
  "utf8"
);

function expectNoDestructiveStatements(content: string) {
  expect(content).not.toMatch(/DROP\s+TABLE/i);
  expect(content).not.toMatch(/DROP\s+COLUMN/i);
  expect(content).not.toMatch(/TRUNCATE/i);
  expect(content).not.toMatch(/DELETE\s+FROM/i);
  expect(content).not.toMatch(/RENAME\s+TABLE/i);
}

describe("sport and health migration safety", () => {
  it("preserves the existing migration history", () => {
    expect(migrationFiles).toContain(
      "0004_truthful_evaluation_notes_plans.sql"
    );

    expect(migrationFiles).toContain(sportHealthMigration);

    expect(journal.entries.some(
      (entry) => entry.tag === "0005_calm_hardball"
    )).toBe(true);

    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      [...journal.entries.keys()]
    );
  });

  it("never drops, truncates or deletes existing records", () => {
    expectNoDestructiveStatements(sql);
  });

  it("backfills required columns before tightening them", () => {
    const addSports = sql.indexOf(
      "ALTER TABLE `organizations` ADD `sports` json;"
    );

    const fillSports = sql.indexOf(
      "UPDATE `organizations` SET `sports` = JSON_ARRAY('football')"
    );

    const tightenSports = sql.indexOf(
      "ALTER TABLE `organizations` MODIFY COLUMN `sports` json NOT NULL;"
    );

    expect(addSports).toBeGreaterThan(-1);
    expect(fillSports).toBeGreaterThan(addSports);
    expect(tightenSports).toBeGreaterThan(fillSports);

    expect(sql).toContain(
      "ALTER TABLE `players` ADD `sport` varchar(40) DEFAULT 'football' NOT NULL;"
    );

    expect(sql).toContain(
      "ALTER TABLE `players` ADD `gymnasticsCategory` varchar(40) DEFAULT '' NOT NULL;"
    );
  });

  it("creates sensitive tables with independent scope rows", () => {
    for (const table of [
      "player_health_profiles",
      "player_emergency_contacts",
      "player_sensitive_grants",
      "player_physical_assessments",
    ]) {
      expect(sql).toContain(`CREATE TABLE \`${table}\``);
    }

    expect(sql).toContain(
      "CONSTRAINT `player_sensitive_grants_unique` UNIQUE(`playerId`,`organizationId`,`scope`)"
    );

    expect(sql).toContain(
      "CONSTRAINT `player_health_profiles_playerId_unique` UNIQUE(`playerId`)"
    );

    expect(sql).toContain(
      "CONSTRAINT `player_emergency_contacts_playerId_unique` UNIQUE(`playerId`)"
    );
  });

  it("adds note editor attribution without rewriting the author", () => {
    expect(sql).toContain(
      "ALTER TABLE `notes` ADD `lastEditedByName` varchar(160) DEFAULT '' NOT NULL;"
    );

    expect(sql).toContain(
      "ALTER TABLE `notes` ADD `lastEditedByUserId` int;"
    );

    expect(sql).not.toMatch(/notes`[^\n]*author/i);
  });
});

describe("independent authentication migration safety", () => {
  it("adds the authentication migration after the existing history", () => {
    expect(migrationFiles).toContain(authMigration);

    expect(journal.entries.at(-1)?.tag).toBe(
      "0006_independent_auth"
    );
  });

  it("creates credentials and sessions tables", () => {
    expect(authSql).toContain(
      "CREATE TABLE `auth_credentials`"
    );

    expect(authSql).toContain(
      "CREATE TABLE `auth_sessions`"
    );
  });

  it("links authentication records to existing users", () => {
    expect(authSql).toContain(
      "REFERENCES `users`(`id`)"
    );

    expect(authSql).toContain(
      "auth_credentials_user_id_unique"
    );

    expect(authSql).toContain(
      "auth_sessions_token_hash_unique"
    );
  });

  it("does not contain destructive schema operations", () => {
    expectNoDestructiveStatements(authSql);
  });

 it("only permits the documented organizations column adjustment", () => {
  const changes = authSql.match(
    /ALTER\s+TABLE\s+`(?:organizations|players|notes|memberships)`[^;]*;/gi
  ) ?? [];

  expect(changes).toEqual([
    "ALTER TABLE `organizations` MODIFY COLUMN `sports` json NOT NULL;",
  ]);
});
});
