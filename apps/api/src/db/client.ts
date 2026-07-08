// DB 클라이언트 — better-sqlite3 + Drizzle
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.resolve(process.cwd(), 'apps/api/data');
const DB_PATH = path.join(DB_DIR, 'malldemo.db');

let _db: BetterSQLite3Database<typeof schema> | null = null;
let _raw: Database.Database | null = null;

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

export function getRaw(): Database.Database {
  if (!_raw) {
    ensureDir();
    _raw = new Database(DB_PATH);
    _raw.pragma('journal_mode = WAL');
    _raw.pragma('foreign_keys = ON');
  }
  return _raw;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!_db) {
    _db = drizzle(getRaw(), { schema });
  }
  return _db;
}

/** 즉시 실행되는 트랜잭션 래퍼 (better-sqlite3 .transaction() 은 함수를 반환하므로 호출 필요) */
export function runTx<T>(fn: () => T): T {
  return getRaw().transaction(fn)();
}

export function resetDb() {
  if (_raw) {
    _raw.close();
    _raw = null;
    _db = null;
  }
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  if (fs.existsSync(DB_PATH + '-wal')) fs.unlinkSync(DB_PATH + '-wal');
  if (fs.existsSync(DB_PATH + '-shm')) fs.unlinkSync(DB_PATH + '-shm');
}

export { schema, DB_PATH };
