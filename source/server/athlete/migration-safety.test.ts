import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard rails for the sport/health migration. These assertions are about the
 * shipped SQL file, so they protect the "additive and reversible" contract even
 * when no MySQL instance is available to apply it.
 */
const drizzleDir = join(process.cwd(), "drizzle");
const migrationFiles = readdirSync(drizzleDir)
  .filter(name => name.endsWith(".sql"))
  .sort();
const latest = migrationFiles.at(-1) ?? "";
const sql = latest ? readFileSync(join(drizzleDir, latest), "utf8") : "";
const journal = JSON.parse(
  readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf8")
) as { entries: Array<{ tag: string; idx: number }> };

describe("sport and health migration safety", () => {
  it("ships a new migration after the existing history", () => {
    expect(migrationFiles).toContain(
      "0004_truthful_evaluation_notes_plans.sql"
    );
    expect(latest).toBe("0005_calm_hardball.sql");
    expect(journal.entries.at(-1)?.tag).toBe("0005_calm_hardball");
    expect(journal.entries.map(entry => entry.idx)).toEqual([
      ...journal.entries.keys(),
    ]);
  });

  it("never drops, truncates or deletes existing records", () => {
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/RENAME\s+TABLE/i);
  });

  it("backfills the new required columns before tightening them", () => {
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

  it("creates the sensitive tables with independent scope rows", () => {
    for (const table of [
      "player_health_profiles",
      "player_emergency_contacts",
      "player_sensitive_grants",
      "player_physical_assessments",
    ])
      expect(sql).toContain(`CREATE TABLE \`${table}\``);
    expect(sql).toMatch(
      /CONSTRAINT `player_sensitive_grants_unique` UNIQUE\(`playerId`,`organizationId`,`scope`\)/
    );
    expect(sql).toContain(
      "CONSTRAINT `player_health_profiles_playerId_unique` UNIQUE(`playerId`)"
    );
    expect(sql).toContain(
      "CONSTRAINT `player_emergency_contacts_playerId_unique` UNIQUE(`playerId`)"
    );
  });

  it("adds note editor attribution without rewriting the author column", () => {
    expect(sql).toContain(
      "ALTER TABLE `notes` ADD `lastEditedByName` varchar(160) DEFAULT '' NOT NULL;"
    );
    expect(sql).toContain("ALTER TABLE `notes` ADD `lastEditedByUserId` int;");
    // The original author columns are never altered or dropped.
    expect(sql).not.toMatch(/notes`[^\n]*author/i);
  });
});
