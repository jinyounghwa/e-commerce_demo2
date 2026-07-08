// 카테고리 서브트리 해석 (쿠폰 scope용)
import { eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db/client';

/** rootId 의 모든 자손(자신 포함) 카테고리 ID 반환 */
export function descendantCategoryIds(rootId: number): number[] {
  const db = getDb();
  const result = new Set<number>([rootId]);
  let frontier = [rootId];
  while (frontier.length) {
    const children = db.select().from(schema.categories)
      .where(inArray(schema.categories.parentId, frontier)).all();
    const next: number[] = [];
    for (const c of children) {
      if (!result.has(c.id)) {
        result.add(c.id);
        next.push(c.id);
      }
    }
    frontier = next;
  }
  return [...result];
}
