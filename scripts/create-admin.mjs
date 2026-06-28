#!/usr/bin/env node
/* Create or update the single CMS admin user in kona-blog-db.
 *
 * Hashing matches worker/auth.ts exactly: PBKDF2-SHA256, 210k iters, 16-byte
 * salt, 256-bit key, stored as "pbkdf2$<iters>$<saltB64>$<hashB64>".
 *
 *   node scripts/create-admin.mjs                 # prompts, writes to --remote D1
 *   node scripts/create-admin.mjs --local         # writes to local dev D1
 *   node scripts/create-admin.mjs --print         # only print the INSERT SQL
 */

import { pbkdf2Sync, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import readline from "node:readline";

const ITERS = 100_000; // must match worker/auth.ts; Workers caps PBKDF2 at 100000
const DB = "kona-blog-db";
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

const args = process.argv.slice(2);
const useLocal = args.includes("--local");
const printOnly = args.includes("--print");

function genId() {
  const buf = randomBytes(8);
  let s = "";
  for (const b of buf) s += ID_ALPHABET[b % ID_ALPHABET.length];
  return s;
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERS, 32, "sha256");
  return `pbkdf2$${ITERS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Echo the prompt once, then mute every keystroke the line editor writes.
      rl._writeToOutput = (str) => {
        if (str === question) process.stdout.write(str);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

async function main() {
  const username = await ask("admin username: ");
  if (!username) throw new Error("username required");
  const password = await ask("password (hidden): ", { hidden: true });
  if (password.length < 12) throw new Error("use a password of at least 12 characters");
  const confirm = await ask("confirm password: ", { hidden: true });
  if (password !== confirm) throw new Error("passwords do not match");

  const id = genId();
  const passwordHash = hashPassword(password);
  const sql =
    `INSERT INTO admin_users (id, username, password_hash) ` +
    `VALUES (${sqlStr(id)}, ${sqlStr(username)}, ${sqlStr(passwordHash)}) ` +
    `ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash;`;

  if (printOnly) {
    console.log(sql);
    return;
  }

  const wranglerArgs = ["wrangler", "d1", "execute", DB, useLocal ? "--local" : "--remote", "--command", sql];
  console.log(`\nApplying to ${useLocal ? "local" : "remote"} D1 (${DB})...`);
  execFileSync("npx", wranglerArgs, { stdio: "inherit" });
  console.log(`\nDone. Admin "${username}" is ready. Visit /admin to sign in.`);
}

main().catch((err) => {
  console.error("\nError: " + err.message);
  process.exit(1);
});
