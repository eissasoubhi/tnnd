import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";
import { migrationFiles } from "./database.js";
import {
  migrationVersion,
  runPendingMigrations,
  stripOuterTransaction,
  type MigrationQuery
} from "./migration-runner.js";

test("declared migration list stays synchronized with migration files on disk", async () => {
  const files = (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  assert.deepEqual([...migrationFiles], files);
});

test("migration version strips only the sql suffix", () => {
  assert.equal(migrationVersion("0016_texting_style_source_examples.sql"), "0016_texting_style_source_examples");
});

test("runner strips an outer transaction so it can own atomic application", () => {
  assert.equal(
    stripOuterTransaction("BEGIN;\nCREATE TABLE example(id int);\nCOMMIT;"),
    "CREATE TABLE example(id int);"
  );
  assert.equal(stripOuterTransaction("CREATE TABLE example(id int);"), "CREATE TABLE example(id int);");
});

test("runner skips applied migrations and records new ones atomically", async () => {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const query: MigrationQuery = async (text, values) => {
    calls.push({ text, values });
    if (text.startsWith("SELECT version")) {
      return { rows: [{ version: "0001_first" }] };
    }
    return { rows: [], rowCount: 1 };
  };

  const applied = await runPendingMigrations(query, {
    files: ["0001_first.sql", "0002_second.sql"],
    readMigration: async (file) => file === "0002_second.sql"
      ? "BEGIN;\nCREATE TABLE second(id int);\nCOMMIT;"
      : "CREATE TABLE first(id int);"
  });

  assert.deepEqual(applied, ["0002_second"]);
  assert.ok(calls.some((call) => call.text === "BEGIN"));
  assert.ok(calls.some((call) => call.text === "CREATE TABLE second(id int);"));
  assert.ok(calls.some((call) =>
    call.text.startsWith("INSERT INTO schema_migrations") && call.values?.[0] === "0002_second"
  ));
  assert.ok(calls.some((call) => call.text === "COMMIT"));
  assert.equal(calls.some((call) => call.text.includes("CREATE TABLE first")), false);
});

test("runner rolls back a failed migration and does not report it as applied", async () => {
  const calls: string[] = [];
  const query: MigrationQuery = async (text) => {
    calls.push(text);
    if (text === "BROKEN SQL") throw new Error("synthetic migration failure");
    if (text.startsWith("SELECT version")) return { rows: [] };
    return { rows: [], rowCount: 1 };
  };

  await assert.rejects(
    runPendingMigrations(query, {
      files: ["0001_broken.sql"],
      readMigration: async () => "BROKEN SQL"
    }),
    /synthetic migration failure/
  );
  assert.equal(calls.at(-1), "ROLLBACK");
});
