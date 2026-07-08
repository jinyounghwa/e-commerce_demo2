import { Module } from '@nestjs/common';

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { getDb, schema } from '../../db/client';
import { eq, and, desc } from 'drizzle-orm';
import { parse, num } from '../../common/zod';
import { Auth, CurrentUser } from '../../common/auth.guard';
import { expireUserCoupons } from '../coupons/coupon-engine';

const addrSchema = z.object({
  label: z.string(), receiver: z.string(), phone: z.string(),
  zipcode: z.string(), addr1: z.string(), addr2: z.string().optional(),
  isDefault: z.boolean().optional(),
});
const addrUpdateSchema = addrSchema.partial();

@Controller()
export class AccountController {
  // ── /me ──
  @Get('me')
  @Auth('USER', 'ADMIN')
  me(@CurrentUser() u: any) {
    const db = getDb();
    return {
      id: u.id, email: u.email, name: u.name, role: u.role,
      grade: u.grade, totalSpent: u.totalSpent, pointBalance: u.pointBalance,
    };
  }

  // ── 배송지 ──
  @Get('me/addresses')
  @Auth('USER', 'ADMIN')
  addresses(@CurrentUser() u: any) {
    return getDb().select().from(schema.addresses).where(eq(schema.addresses.userId, u.id)).all();
  }

  @Post('me/addresses')
  @Auth('USER', 'ADMIN')
  addAddress(@CurrentUser() u: any, @Body() body: unknown) {
    const dto = parse(addrSchema, body);
    const db = getDb();
    if (dto.isDefault) {
      db.update(schema.addresses).set({ isDefault: 0 }).where(eq(schema.addresses.userId, u.id)).run();
    }
    return db.insert(schema.addresses).values({
      userId: u.id, label: dto.label, receiver: dto.receiver, phone: dto.phone,
      zipcode: dto.zipcode, addr1: dto.addr1, addr2: dto.addr2 ?? '',
      isDefault: dto.isDefault ? 1 : 0,
    }).returning().get();
  }

  @Patch('me/addresses/:id')
  @Auth('USER', 'ADMIN')
  updateAddress(@CurrentUser() u: any, @Param('id') id: number, @Body() body: unknown) {
    const dto = parse(addrUpdateSchema, body);
    const db = getDb();
    if (dto.isDefault) {
      db.update(schema.addresses).set({ isDefault: 0 }).where(eq(schema.addresses.userId, u.id)).run();
    }
    db.update(schema.addresses).set({
      ...(dto.label != null && { label: dto.label }),
      ...(dto.receiver != null && { receiver: dto.receiver }),
      ...(dto.phone != null && { phone: dto.phone }),
      ...(dto.zipcode != null && { zipcode: dto.zipcode }),
      ...(dto.addr1 != null && { addr1: dto.addr1 }),
      ...(dto.addr2 != null && { addr2: dto.addr2 }),
      ...(dto.isDefault != null && { isDefault: dto.isDefault ? 1 : 0 }),
    }).where(and(eq(schema.addresses.id, id), eq(schema.addresses.userId, u.id))).run();
    return { ok: true };
  }

  @Delete('me/addresses/:id')
  @Auth('USER', 'ADMIN')
  deleteAddress(@CurrentUser() u: any, @Param('id') id: number) {
    getDb().delete(schema.addresses)
      .where(and(eq(schema.addresses.id, id), eq(schema.addresses.userId, u.id))).run();
    return { ok: true };
  }

  // ── 내 쿠폰 ──
  @Get('me/coupons')
  @Auth('USER', 'ADMIN')
  myCoupons(@CurrentUser() u: any, @Query('status') status?: string) {
    expireUserCoupons(u.id);
    const db = getDb();
    const rows = db.select({
      id: schema.userCoupons.id, status: schema.userCoupons.status,
      issuedAt: schema.userCoupons.issuedAt, expiresAt: schema.userCoupons.expiresAt,
      couponId: schema.coupons.id, name: schema.coupons.name,
      discountType: schema.coupons.discountType, discountValue: schema.coupons.discountValue,
      maxDiscount: schema.coupons.maxDiscount, minOrderAmount: schema.coupons.minOrderAmount,
      scope: schema.coupons.scope, scopeCategoryId: schema.coupons.scopeCategoryId, scopeProductId: schema.coupons.scopeProductId,
    }).from(schema.userCoupons).innerJoin(schema.coupons, eq(schema.userCoupons.couponId, schema.coupons.id))
      .where(eq(schema.userCoupons.userId, u.id)).all();
    return status ? rows.filter((r) => r.status === status) : rows;
  }

  // ── 알림 ──
  @Get('me/notifications')
  @Auth('USER', 'ADMIN')
  notifications(@CurrentUser() u: any, @Query('limit') limit?: string) {
    const lim = num(limit, 50);
    return getDb().select().from(schema.notifications)
      .where(eq(schema.notifications.userId, u.id)).orderBy(desc(schema.notifications.createdAt)).limit(lim).all();
  }

  @Patch('me/notifications/:id/read')
  @Auth('USER', 'ADMIN')
  readNoti(@CurrentUser() u: any, @Param('id') id: number) {
    getDb().update(schema.notifications).set({ isRead: 1 })
      .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, u.id))).run();
    return { ok: true };
  }
}

@Module({ controllers: [AccountController] })
export class AccountModule {}
