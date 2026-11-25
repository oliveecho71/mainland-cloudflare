import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const input = process.argv[2];
if (!input) throw new Error("用法: node scripts/import-snapshot.mjs <snapshot.json>");
const snapshot = JSON.parse(readFileSync(input, "utf8"));
const names = ["students", "lessons", "bookings", "site_content"];
const columns = {
  students: ["id", "name", "phone", "invite_hash", "invite_expires_at", "password_hash", "password_salt", "active", "created_at"],
  lessons: ["id", "title", "kind", "starts_at", "ends_at", "public_place", "private_place", "objective", "private_brief", "capacity", "status", "created_at"],
  bookings: ["id", "student_id", "lesson_id", "status", "attended", "created_at"],
  site_content: ["key", "value", "updated_at"],
};
for (const name of names) {
  if (!Array.isArray(snapshot[name])) throw new Error(`快照缺少 ${name} 数组`);
  for (const row of snapshot[name]) {
    if (!row || typeof row !== "object" || columns[name].some(column => !(column in row))) {
      throw new Error(`${name} 中有缺失字段的记录`);
    }
  }
}

const file = path.resolve(process.env.DB_PATH || "data/booking.sqlite");
mkdirSync(path.dirname(file), { recursive: true });
const db = new DatabaseSync(file);
db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='students'").get()) {
  for (const migration of ["0000_useful_thena.sql", "0001_futuristic_romulus.sql"]) {
    db.exec(readFileSync(path.join(process.cwd(), "drizzle", migration), "utf8").replaceAll("--> statement-breakpoint", ""));
  }
}
for (const name of names) {
  if (db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get().count !== 0) {
    throw new Error(`目标库 ${name} 已有数据；为防止覆盖，请换空库后重试`);
  }
}

db.exec("BEGIN IMMEDIATE");
try {
  for (const name of names) {
    const keys = columns[name];
    const insert = db.prepare(`INSERT INTO ${name} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`);
    for (const row of snapshot[name]) insert.run(...keys.map(key => row[key]));
  }
  const badReferences = db.prepare("PRAGMA foreign_key_check").all();
  if (badReferences.length) throw new Error(`外键检查失败：${badReferences.length} 条`);
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
for (const name of names) {
  const count = db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get().count;
  if (count !== snapshot[name].length) throw new Error(`${name} 数量核对失败`);
  process.stdout.write(`${name}: ${count}\n`);
}
db.close();
