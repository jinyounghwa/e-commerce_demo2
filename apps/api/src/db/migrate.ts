// 스키마 적용 — schema.sql 실행
import fs from 'fs';
import path from 'path';
import { getRaw } from './client';

export function migrate() {
  const sqlPath = path.resolve(__dirname, 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  const raw = getRaw();
  raw.exec(sql);
  console.log('✓ 스키마 적용 완료');
}
