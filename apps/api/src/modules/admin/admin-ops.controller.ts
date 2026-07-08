import { Body, Controller, Get, Param, Patch, Post, Query, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, getRaw, schema, runTx } from '../../db/client';
import { parse } from '../../common/zod';
import { Auth } from '../../common/auth.guard';
import { assertTransition, ORDER_TRANSITIONS } from '../../common/state-machine';
import { gradeFromSpent, gradeRule } from '../../common/grade';
import { processClaim, ClaimAction } from '../claims/claims-engine';
import { notify } from '../../common/notify';
import { nowISO } from '../../common/util';

@Controller()
export class AdminOpsController {
  // ── 주문 ──
  @Get('admin/orders')
  @Auth('ADMIN')
  orders(@Query('status') status?: string) {
    const db = getDb();
    const orders = db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt))
      .where(status ? eq(schema.orders.status, status!) : undefined).all();
    return orders.map((o) => {
      const user = db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
        .from(schema.users).where(eq(schema.users.id, o.userId)).get()!;
      const items = db.select({
        id: schema.orderItems.id, productName: schema.orderItems.productName,
        optionLabel: schema.orderItems.optionLabel, quantity: schema.orderItems.quantity,
        unitPrice: schema.orderItems.unitPrice, thumbnailUrl: schema.products.thumbnailUrl,
        status: schema.orderItems.status,
      }).from(schema.orderItems).innerJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
        .where(eq(schema.orderItems.orderId, o.id)).all();
      return { ...o, user, items };
    });
  }

  @Patch('admin/orders/:id/status')
  @Auth('ADMIN')
  updateOrderStatus(@Param('id') id: number, @Body() body: unknown) {
    const dto = parse(z.object({ status: z.string() }), body);
    const db = getDb();
    const raw = getRaw();
    return runTx(() => {
      const order = db.select().from(schema.orders).where(eq(schema.orders.id, id)).get();
      if (!order) throw new NotFoundException('주문 없음');
      assertTransition(ORDER_TRANSITIONS, order.status, dto.status, '주문');

      if (dto.status === 'CANCELED') {
        // 출고 전 취소: 재고 복원 + 쿠폰/포인트 복원
        const items = db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id)).all();
        for (const it of items) {
          raw.prepare('UPDATE skus SET stock = stock + ? WHERE id = ?').run(it.quantity, it.skuId);
        }
        if (order.usedUserCouponId) {
          db.update(schema.userCoupons).set({ status: 'UNUSED', usedAt: null, usedOrderId: null })
            .where(eq(schema.userCoupons.id, order.usedUserCouponId)).run();
        }
        if (order.pointsUsed > 0) {
          const u = db.select().from(schema.users).where(eq(schema.users.id, order.userId)).get()!;
          db.update(schema.users).set({ pointBalance: u.pointBalance + order.pointsUsed })
            .where(eq(schema.users.id, order.userId)).run();
          db.insert(schema.pointLedger).values({
            userId: order.userId, amount: order.pointsUsed, type: 'REFUND', refOrderId: order.id, memo: '취소 환불',
          }).run();
        }
        notify(order.userId, 'CLAIM', '주문 취소', `${order.orderNo} 주문이 취소되었습니다.`, '/my/orders');
      }

      db.update(schema.orders).set({ status: dto.status }).where(eq(schema.orders.id, id)).run();
      return { ok: true, status: dto.status };
    });
  }

  // ── 클레임 ──
  @Get('admin/claims')
  @Auth('ADMIN')
  claims(@Query('status') status?: string) {
    const db = getDb();
    const rows = db.select().from(schema.claims).orderBy(desc(schema.claims.createdAt))
      .where(status ? eq(schema.claims.status, status!) : undefined).all();
    return rows.map((c) => {
      const order = db.select().from(schema.orders).where(eq(schema.orders.id, c.orderId)).get()!;
      const item = db.select().from(schema.orderItems).where(eq(schema.orderItems.id, c.orderItemId)).get()!;
      const user = db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, c.userId)).get()!;
      return { ...c, orderNo: order.orderNo, orderStatus: order.status, item, userName: user.name };
    });
  }

  @Patch('admin/claims/:id')
  @Auth('ADMIN')
  processClaimAction(@Param('id') id: number, @Body() body: ClaimAction) {
    return processClaim(Number(id), body);
  }

  // ── 회원 ──
  @Get('admin/users')
  @Auth('ADMIN')
  users() {
    return getDb().select({
      id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role,
      grade: schema.users.grade, totalSpent: schema.users.totalSpent, pointBalance: schema.users.pointBalance,
      createdAt: schema.users.createdAt,
    }).from(schema.users).orderBy(schema.users.id).all();
  }

  @Patch('admin/users/:id/grade')
  @Auth('ADMIN')
  updateGrade(@Param('id') id: number, @Body() body: unknown) {
    const dto = parse(z.object({ grade: z.enum(['BRONZE', 'SILVER', 'GOLD', 'VIP']) }), body);
    getDb().update(schema.users).set({ grade: dto.grade }).where(eq(schema.users.id, id)).run();
    return { ok: true };
  }

  @Post('admin/users/:id/points')
  @Auth('ADMIN')
  adjustPoints(@Param('id') id: number, @Body() body: unknown) {
    const dto = parse(z.object({ amount: z.number().int(), memo: z.string().optional() }), body);
    const db = getDb();
    const u = db.select().from(schema.users).where(eq(schema.users.id, id)).get();
    if (!u) throw new NotFoundException('회원 없음');
    if (u.pointBalance + dto.amount < 0) throw new BadRequestException('포인트 부족');
    db.update(schema.users).set({ pointBalance: u.pointBalance + dto.amount }).where(eq(schema.users.id, id)).run();
    db.insert(schema.pointLedger).values({
      userId: id, amount: dto.amount, type: 'ADMIN', memo: dto.memo ?? '관리자 조정',
      expiresAt: dto.amount > 0 ? new Date(Date.now() + 90 * 86400000).toISOString() : null,
    }).run();
    return { ok: true, balance: u.pointBalance + dto.amount };
  }

  // ── 리뷰 ──
  @Get('admin/reviews')
  @Auth('ADMIN')
  reviews(@Query('productId') productId?: string) {
    const db = getDb();
    const rows = db.select({
      id: schema.reviews.id, rating: schema.reviews.rating, content: schema.reviews.content,
      isVisible: schema.reviews.isVisible, adminReply: schema.reviews.adminReply,
      createdAt: schema.reviews.createdAt, productName: schema.products.name, userName: schema.users.name,
      productId: schema.reviews.productId,
    }).from(schema.reviews).innerJoin(schema.products, eq(schema.reviews.productId, schema.products.id))
      .innerJoin(schema.users, eq(schema.reviews.userId, schema.users.id))
      .orderBy(desc(schema.reviews.createdAt)).all();
    return productId ? rows.filter((r) => r.productId === Number(productId)) : rows;
  }

  @Patch('admin/reviews/:id')
  @Auth('ADMIN')
  updateReview(@Param('id') id: number, @Body() body: unknown) {
    const dto = parse(z.object({
      isVisible: z.number().optional(), adminReply: z.string().optional(),
    }), body);
    const db = getDb();
    db.update(schema.reviews).set({
      ...(dto.isVisible != null && { isVisible: dto.isVisible }),
      ...(dto.adminReply != null && { adminReply: dto.adminReply }),
    }).where(eq(schema.reviews.id, id)).run();
    return { ok: true };
  }

  // ── Q&A ──
  @Get('admin/qnas')
  @Auth('ADMIN')
  qnas(@Query('answered') answered?: string) {
    const db = getDb();
    const rows = db.select({
      id: schema.qnas.id, question: schema.qnas.question, answer: schema.qnas.answer,
      isSecret: schema.qnas.isSecret, answeredAt: schema.qnas.answeredAt, createdAt: schema.qnas.createdAt,
      productName: schema.products.name, userName: schema.users.name, productId: schema.qnas.productId,
    }).from(schema.qnas).innerJoin(schema.products, eq(schema.qnas.productId, schema.products.id))
      .innerJoin(schema.users, eq(schema.qnas.userId, schema.users.id))
      .orderBy(desc(schema.qnas.createdAt)).all();
    if (answered === 'false') return rows.filter((r) => !r.answer);
    if (answered === 'true') return rows.filter((r) => !!r.answer);
    return rows;
  }

  @Patch('admin/qnas/:id')
  @Auth('ADMIN')
  answerQna(@Param('id') id: number, @Body() body: unknown) {
    const dto = parse(z.object({ answer: z.string() }), body);
    const db = getDb();
    const q = db.select().from(schema.qnas).where(eq(schema.qnas.id, id)).get();
    if (!q) throw new NotFoundException('Q&A 없음');
    db.update(schema.qnas).set({ answer: dto.answer, answeredAt: nowISO() }).where(eq(schema.qnas.id, id)).run();
    notify(q.userId, 'QNA', 'Q&A 답변 등록', '문의하신 질문에 답변이 등록되었습니다.', `/products/${q.productId}`);
    return { ok: true };
  }
}
