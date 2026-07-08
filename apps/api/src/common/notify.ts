// 인앱 알림 생성 헬퍼
import { getDb, schema } from '../db/client';
import { nowISO } from './util';

export function notify(
  userId: number,
  type: 'ORDER' | 'COUPON' | 'QNA' | 'CLAIM',
  title: string,
  body: string,
  link?: string,
) {
  getDb().insert(schema.notifications).values({
    userId, type, title, body, link, isRead: 0, createdAt: nowISO(),
  }).run();
}
