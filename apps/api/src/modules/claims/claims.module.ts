import { Module } from '@nestjs/common';

import { Body, Controller, Get, Param, Post, Query, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../../db/client';
import { parse } from '../../common/zod';
import { Auth, CurrentUser } from '../../common/auth.guard';
import { notify } from '../../common/notify';

const createSchema = z.object({
  orderId: z.number(),
  orderItemId: z.number(),
  type: z.enum(['CANCEL', 'RETURN', 'EXCHANGE']),
  reason: z.string().min(2),
  detail: z.string().optional(),
  exchangeSkuId: z.number().optional(),
});

@Controller('claims')
export class ClaimsController {
  @Post()
  @Auth('USER', 'ADMIN')
  create(@CurrentUser() u: any, @Body() body: unknown) {
    const dto = parse(createSchema, body);
    const db = getDb();
    const order = db.select().from(schema.orders).where(eq(schema.orders.id, dto.orderId)).get();
    if (!order || order.userId !== u.id) throw new NotFoundException('주문 없음');
    const item = db.select().from(schema.orderItems).where(eq(schema.orderItems.id, dto.orderItemId)).get();
    if (!item || item.orderId !== order.id) throw new BadRequestException('주문 아이템 불일치');

    // 상태 검증
    if (dto.type === 'CANCEL') {
      if (!['PAID', 'PREPARING'].includes(order.status)) {
        throw new ConflictException('출고 전(결제완료/상품준비) 상태에서만 취소 가능');
      }
    } else {
      if (!['DELIVERED', 'CONFIRMED'].includes(order.status)) {
        throw new ConflictException('배송완료/구매확정 상태에서만 반품/교환 가능');
      }
    }
    if (item.status === 'CLAIMED') throw new ConflictException('이미 클레임 처리된 아이템');

    // 중복 클레임 방지
    const existing = db.select().from(schema.claims)
      .where(and(eq(schema.claims.orderItemId, item.id), eq(schema.claims.status, 'REQUESTED'))).get();
    if (existing) throw new ConflictException('이미 진행 중인 클레임');

    const claim = db.insert(schema.claims).values({
      orderId: order.id, orderItemId: item.id, userId: u.id,
      type: dto.type, status: 'REQUESTED', reason: dto.reason, detail: dto.detail ?? '',
      exchangeSkuId: dto.exchangeSkuId ?? null,
    }).returning({ id: schema.claims.id }).get();
    notify(u.id, 'CLAIM', 'CS 접수', `${dto.type} 요청이 접수되었습니다.`, '/my/claims');
    return { ok: true, claimId: claim.id };
  }

  @Get()
  @Auth('USER', 'ADMIN')
  list(@CurrentUser() u: any, @Query('status') status?: string) {
    const db = getDb();
    const conds = [eq(schema.claims.userId, u.id)];
    const rows = db.select().from(schema.claims)
      .where(status ? and(...conds, eq(schema.claims.status, status)) : conds[0])
      .orderBy(desc(schema.claims.createdAt)).all();
    return rows.map((c) => ({
      ...c,
      orderNo: db.select().from(schema.orders).where(eq(schema.orders.id, c.orderId)).get()?.orderNo,
    }));
  }

  @Get(':id')
  @Auth('USER', 'ADMIN')
  detail(@CurrentUser() u: any, @Param('id') id: number) {
    const db = getDb();
    const claim = db.select().from(schema.claims).where(eq(schema.claims.id, id)).get();
    if (!claim || claim.userId !== u.id) throw new NotFoundException('클레임 없음');
    const order = db.select().from(schema.orders).where(eq(schema.orders.id, claim.orderId)).get()!;
    const item = db.select().from(schema.orderItems).where(eq(schema.orderItems.id, claim.orderItemId)).get()!;
    return { ...claim, orderNo: order.orderNo, item };
  }
}

@Module({ controllers: [ClaimsController] })
export class ClaimsModule {}
