// ============================================================================
// scripts/clean-schema.mjs : make a pg_dump file loadable ANYWHERE
// ============================================================================
// Newer versions of pg_dump write lines that make the file fail on other
// PostgreSQL versions or on older psql programs:
//
//   \restrict <random key>      psql-only command added in the 2025 security
//   \unrestrict <random key>    releases. An older psql says "invalid command".
//                               The key also changes on EVERY dump, so Git
//                               shows a pointless difference each time.
//   SET transaction_timeout     A PostgreSQL 17+ setting. A PostgreSQL 16 (or
//                               older) server rejects it.
//
// This script removes those lines. Run it right after every pg_dump:
//
//   pg_dump -U postgres -s -O -x -d YOUR_DEV_DB -f db/schema.sql
//   node scripts/clean-schema.mjs db/schema.sql
//
// It edits the file in place (no ">" redirect, because on Windows PowerShell a
// redirect writes UTF-16, which psql cannot read).
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];

if (!file) {
  console.error("Usage: node scripts/clean-schema.mjs db/schema.sql");
  process.exit(1);
}

const lines = readFileSync(file, "utf8").split(/\r?\n/);

const isUnsafe = (line) =>
  /^\\(un)?restrict(\s|$)/.test(line) || /^SET transaction_timeout\b/.test(line);

const kept = lines.filter((line) => !isUnsafe(line));
const removed = lines.length - kept.length;

const cleaned = kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";

writeFileSync(file, cleaned, "utf8");

console.log(`${file}: removed ${removed} line(s).`);