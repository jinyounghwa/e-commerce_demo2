import { Module } from '@nestjs/common';

import { Controller, Get } from '@nestjs/common';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { getDb, schema } from '../../db/client';
import { Auth, CurrentUser } from '../../common/auth.guard';
import { nowISO } from '../../common/util';

@Controller('me/points')
export class PointsController {
  @Get()
  @Auth('USER', 'ADMIN')
  ledger(@CurrentUser() u: any) {
    const db = getDb();
    // 소멸 처리 (만료된 적립분 차감)
    const expired = db.select({ id: schema.pointLedger.id, amount: schema.pointLedger.amount })
      .from(schema.pointLedger)
      .where(and(
        eq(schema.pointLedger.userId, u.id),
        sql`${schema.pointLedger.amount} > 0`,
        sql`${schema.pointLedger.expiresAt} IS NOT NULL`,
        lt(schema.pointLedger.expiresAt, nowISO()),
      )).all();
    let expiredSum = 0;
    for (const e of expired) {
      db.update(schema.pointLedger).set({ expiresAt: null })
        .where(eq(schema.pointLedger.id, e.id)).run();
      db.insert(schema.pointLedger).values({
        userId: u.id, amount: -e.amount, type: 'EXPIRE', memo: '포인트 소멸',
      }).run();
      expiredSum += e.amount;
    }
    if (expiredSum > 0) {
      db.update(schema.users).set({ pointBalance: Math.max(0, u.pointBalance - expiredSum) })
        .where(eq(schema.users.id, u.id)).run();
    }

    const rows = db.select().from(schema.pointLedger)
      .where(eq(schema.pointLedger.userId, u.id)).orderBy(desc(schema.pointLedger.createdAt)).all();
    const expiringSoon = db.select().from(schema.pointLedger)
      .where(and(
        eq(schema.pointLedger.userId, u.id),
        sql`${schema.pointLedger.amount} > 0`,
        sql`${schema.pointLedger.expiresAt} IS NOT NULL`,
      )).all()
      .filter((r) => new Date(r.expiresAt!).getTime() - Date.now() < 7 * 86400000);
    const balance = Math.max(0, u.pointBalance - expiredSum);
    return { balance, ledger: rows, expiringSoon };
  }
}

@Module({ controllers: [PointsController] })
export class PointsModule {}
