// 스키마 적용 — schema.sql 실행
import fs from 'fs';
import path from 'path';
import { getRaw } from './client';

export function migrate() {
  // dist 빌드 환경(src 미포함)과 dev(ts-node) 모두 대응
  const here = path.resolve(__dirname, 'schema.sql');
  const src = path.resolve(__dirname, '..', '..', 'src', 'db', 'schema.sql');
  const sqlPath = fs.existsSync(here) ? here : src;
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  const raw = getRaw();
  raw.exec(sql);
  console.log('✓ 스키마 적용 완료');
}
