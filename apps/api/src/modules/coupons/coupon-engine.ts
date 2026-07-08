// 쿠폰 발급 + lazy 만료 헬퍼 (공용)
import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import { getDb, schema } from '../../db/client';
import { nowISO, addDays } from '../../common/util';

/** 조회 시점 만료 처리 (lazy) */
export function expireUserCoupons(userId: number) {
  const db = getDb();
  db.update(schema.userCoupons)
    .set({ status: 'EXPIRED' })
    .where(and(
      eq(schema.userCoupons.userId, userId),
      eq(schema.userCoupons.status, 'UNUSED'),
      lt(schema.userCoupons.expiresAt, nowISO()),
    )).run();
}

/** 특정 쿠폰을 유저에게 발급 (1인 1매, 수량 제한) */
export function issueCoupon(userId: number, couponId: number) {
  const db = getDb();
  const coupon = db.select().from(schema.coupons).where(eq(schema.coupons.id, couponId)).get();
  if (!coupon || !coupon.isActive) throw new NotFoundException('쿠폰 없음');
  if (coupon.issueType !== 'DOWNLOAD' && coupon.issueType !== 'ADMIN') {
    throw new ConflictException('다운로드/지급형 쿠폰이 아닙니다');
  }
  // 수량 제한
  if (coupon.totalQuantity != null && coupon.issuedCount >= coupon.totalQuantity) {
    throw new ConflictException('발급 수량 초과');
  }
  // 1인 1매
  const existing = db.select().from(schema.userCoupons)
    .where(and(eq(schema.userCoupons.userId, userId), eq(schema.userCoupons.couponId, couponId))).get();
  if (existing) throw new ConflictException('이미 발급받은 쿠폰입니다');

  const issuedAt = nowISO();
  const r = db.insert(schema.userCoupons).values({
    userId, couponId, status: 'UNUSED',
    issuedAt, expiresAt: addDays(issuedAt, coupon.validDays),
  }).returning({ id: schema.userCoupons.id }).get();
  db.update(schema.coupons).set({ issuedCount: coupon.issuedCount + 1 })
    .where(eq(schema.coupons.id, couponId)).run();
  return r.id;
}

/** 가입 시 자동발급 쿠폰 모두 발급 */
export function issueSignupCoupons(userId: number) {
  const db = getDb();
  const autos = db.select().from(schema.coupons).where(eq(schema.coupons.issueType, 'AUTO_SIGNUP')).all();
  for (const c of autos) {
    const issuedAt = nowISO();
    db.insert(schema.userCoupons).values({
      userId, couponId: c.id, status: 'UNUSED',
      issuedAt, expiresAt: addDays(issuedAt, c.validDays),
    }).run();
    db.update(schema.coupons).set({ issuedCount: c.issuedCount + 1 })
      .where(eq(schema.coupons.id, c.id)).run();
  }
}
