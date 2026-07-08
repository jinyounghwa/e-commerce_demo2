import { Module } from '@nestjs/common';

import { Controller, Get, Param, Post, ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../../db/client';
import { Auth, CurrentUser } from '../../common/auth.guard';
import { expireUserCoupons, issueCoupon } from './coupon-engine';

@Controller('coupons')
export class CouponsController {
  // 발급 가능 쿠폰 목록 (쿠폰존)
  @Get('available')
  @Auth('USER', 'ADMIN')
  available(@CurrentUser() u: any) {
    expireUserCoupons(u.id);
    const db = getDb();
    const coupons = db.select().from(schema.coupons)
      .where(eq(schema.coupons.isActive, 1)).all();
    const mine = db.select().from(schema.userCoupons).where(eq(schema.userCoupons.userId, u.id)).all();
    return coupons.map((c) => ({
      ...c,
      isIssued: mine.some((m) => m.couponId === c.id),
      remaining: c.totalQuantity == null ? null : Math.max(0, c.totalQuantity - c.issuedCount),
    }));
  }

  @Post(':id/download')
  @Auth('USER', 'ADMIN')
  download(@CurrentUser() u: any, @Param('id') id: number) {
    const ucId = issueCoupon(u.id, id);
    return { ok: true, userCouponId: ucId };
  }
}

@Module({ controllers: [CouponsController] })
export class CouponsModule {}
