import { Module } from '@nestjs/common';

import { Body, Controller, Get, Param, Post, Query, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { getDb, getRaw, schema, runTx } from '../../db/client';
import { parse } from '../../common/zod';
import { Auth, CurrentUser } from '../../common/auth.guard';
import { PriceCalculator } from './price-calculator';
import { resolveCouponInput, resolveQuoteItems, ItemInput } from './order-helpers';
import { gradeFromSpent, gradeRule } from '../../common/grade';
import { nowISO, randomTrackingNo } from '../../common/util';
import { SHIPMENT_LOCATIONS } from '../../common/state-machine';
import { notify } from '../../common/notify';

const itemSchema = z.object({ skuId: z.number(), quantity: z.number().int().min(1) });
const quoteSchema = z.object({
  items: z.array(itemSchema).min(1),
  userCouponId: z.number().nullable().optional(),
  pointsUsed: z.number().int().min(0).default(0),
});
const createSchema = z.object({
  items: z.array(itemSchema).min(1).optional(),
  // 배송지: addressId 또는 직접 입력
  addressId: z.number().optional(),
  receiver: z.string().optional(), phone: z.string().optional(),
  zipcode: z.string().optional(), addr1: z.string().optional(), addr2: z.string().optional(),
  userCouponId: z.number().nullable().optional(),
  pointsUsed: z.number().int().min(0).default(0),
  paymentMethod: z.enum(['MOCK_CARD', 'MOCK_BANK']).default('MOCK_CARD'),
  simulateFail: z.boolean().default(false),
});

@Controller('orders')
export class OrdersController {
  // ── 금액 계산 (quote) ──
  @Post('quote')
  @Auth('USER', 'ADMIN')
  quote(@CurrentUser() u: any, @Body() body: unknown) {
    const dto = parse(quoteSchema, body);
    const items = resolveQuoteItems(dto.items);
    const coupon = resolveCouponInput(dto.userCouponId);
    const result = PriceCalculator.calc(items, u.grade, u.pointBalance, dto.pointsUsed, coupon);
    return { ...result, userCouponId: dto.userCouponId };
  }

  // ── 주문 생성 + Mock 결제 ──
  @Post()
  @Auth('USER', 'ADMIN')
  create(@CurrentUser() u: any, @Body() body: unknown) {
    const dto = parse(createSchema, body);
    const db = getDb();
    const raw = getRaw();

    // 아이템: body.items 또는 장바구니 전체
    let itemInputs: ItemInput[] = dto.items ?? [];
    if (itemInputs.length === 0) {
      const cart = db.select().from(schema.cartItems).where(eq(schema.cartItems.userId, u.id)).all();
      itemInputs = cart.map((c) => ({ skuId: c.skuId, quantity: c.quantity }));
    }
    if (itemInputs.length === 0) throw new BadRequestException('주문 상품 없음');

    // 배송지 해석
    let addr: any;
    if (dto.addressId) {
      addr = db.select().from(schema.addresses)
        .where(and(eq(schema.addresses.id, dto.addressId), eq(schema.addresses.userId, u.id))).get();
      if (!addr) throw new NotFoundException('배송지 없음');
    } else {
      if (!dto.receiver || !dto.phone || !dto.zipcode || !dto.addr1) {
        throw new BadRequestException('배송지 정보 누락');
      }
      addr = { receiver: dto.receiver, phone: dto.phone, zipcode: dto.zipcode, addr1: dto.addr1, addr2: dto.addr2 ?? '' };
    }

    const quoteItems = resolveQuoteItems(itemInputs);
    const coupon = resolveCouponInput(dto.userCouponId);
    const calc = PriceCalculator.calc(quoteItems, u.grade, u.pointBalance, dto.pointsUsed, coupon);

    return runTx(() => {
      // 1. 재고 차감 (atomic)
      for (const it of quoteItems) {
        const r = raw.prepare('UPDATE skus SET stock = stock - ? WHERE id = ? AND stock >= ?')
          .run(it.quantity, it.skuId, it.quantity);
        if (r.changes === 0) {
          throw new ConflictException(`재고 부족 (sku ${it.skuId})`);
        }
      }

      // 2. 포인트 차감 검증 (결제 성공 시에만)
      if (calc.pointsUsed > 0) {
        const fresh = db.select().from(schema.users).where(eq(schema.users.id, u.id)).get()!;
        if (fresh.pointBalance < calc.pointsUsed) {
          throw new ConflictException('포인트 잔액 부족');
        }
        if (calc.pointsUsed % 100 !== 0) throw new ConflictException('포인트는 100P 단위');
      }

      // 3. 주문번호
      const today = new Date();
      const prefix = `ORD-${today.toISOString().slice(0, 10).replace(/-/g, '')}-`;
      const seq = this.nextSeq(prefix);

      const order = db.insert(schema.orders).values({
        orderNo: `${prefix}${String(seq).padStart(4, '0')}`,
        userId: u.id, status: 'PENDING_PAYMENT',
        itemsTotal: calc.itemsTotal, couponDiscount: calc.couponDiscount,
        gradeDiscount: calc.gradeDiscount, pointsUsed: calc.pointsUsed,
        shippingFee: calc.shippingFee, payAmount: calc.payAmount,
        usedUserCouponId: dto.userCouponId ?? null,
        receiver: addr.receiver, phone: addr.phone, zipcode: addr.zipcode,
        addr1: addr.addr1, addr2: addr.addr2 ?? '',
        createdAt: nowISO(), paidAt: null,
      }).returning({ id: schema.orders.id, orderNo: schema.orders.orderNo }).get();

      // 4. 주문 아이템
      for (const it of quoteItems) {
        const prod = db.select().from(schema.products).where(eq(schema.products.id, it.productId)).get()!;
        const sku = db.select().from(schema.skus).where(eq(schema.skus.id, it.skuId)).get()!;
        db.insert(schema.orderItems).values({
          orderId: order.id, skuId: it.skuId, productId: it.productId,
          productName: prod.name, optionLabel: sku.optionLabel,
          unitPrice: it.salePrice + it.extraPrice, quantity: it.quantity, status: 'NORMAL',
        }).run();
      }

      // 5. Mock 결제
      if (dto.simulateFail) {
        // 결제 실패: 재고 복원, 쿠폰/포인트 미사용
        for (const it of quoteItems) {
          raw.prepare('UPDATE skus SET stock = stock + ? WHERE id = ?').run(it.quantity, it.skuId);
        }
        db.update(schema.orders).set({ status: 'PAYMENT_FAILED' }).where(eq(schema.orders.id, order.id)).run();
        db.insert(schema.payments).values({
          orderId: order.id, method: dto.paymentMethod, status: 'FAILED',
          failReason: 'MOCK 결제 실패 시뮬레이션', createdAt: nowISO(),
        }).run();
        return { orderId: order.id, orderNo: order.orderNo, status: 'PAYMENT_FAILED' };
      }

      // 결제 성공
      db.update(schema.orders).set({ status: 'PAID', paidAt: nowISO() }).where(eq(schema.orders.id, order.id)).run();
      db.insert(schema.payments).values({
        orderId: order.id, method: dto.paymentMethod, status: 'SUCCESS', createdAt: nowISO(),
      }).run();

      // 쿠폰 사용 처리
      if (dto.userCouponId) {
        db.update(schema.userCoupons).set({ status: 'USED', usedAt: nowISO(), usedOrderId: order.id })
          .where(eq(schema.userCoupons.id, dto.userCouponId)).run();
      }
      // 포인트 차감
      if (calc.pointsUsed > 0) {
        db.update(schema.users).set({ pointBalance: u.pointBalance - calc.pointsUsed })
          .where(eq(schema.users.id, u.id)).run();
        db.insert(schema.pointLedger).values({
          userId: u.id, amount: -calc.pointsUsed, type: 'USE_ORDER', refOrderId: order.id, memo: '주문 사용',
        }).run();
      }
      // 장바구니에서 제거 (사용한 아이템)
      for (const it of quoteItems) {
        const ci = db.select().from(schema.cartItems)
          .where(and(eq(schema.cartItems.userId, u.id), eq(schema.cartItems.skuId, it.skuId))).get();
        if (ci) db.delete(schema.cartItems).where(eq(schema.cartItems.id, ci.id)).run();
      }
      // 배송 READY 생성
      db.insert(schema.shipments).values({
        orderId: order.id, trackingNo: randomTrackingNo(), status: 'READY',
        events: JSON.stringify([{ status: 'READY', location: SHIPMENT_LOCATIONS.READY, at: nowISO() }]),
      }).run();

      notify(u.id, 'ORDER', '주문 완료', `주문번호 ${order.orderNo} 결제가 완료되었습니다.`, '/my/orders');
      return { orderId: order.id, orderNo: order.orderNo, status: 'PAID' };
    });
  }

  private nextSeq(prefix: string): number {
    const db = getDb();
    const rows = db.select().from(schema.orders).all();
    const todayNums = rows
      .filter((r) => r.orderNo.startsWith(prefix))
      .map((r) => Number(r.orderNo.slice(-4)))
      .sort((a, b) => a - b);
    return (todayNums.length ? todayNums[todayNums.length - 1] : 0) + 1;
  }

  // ── 내 주문 목록 ──
  @Get()
  @Auth('USER', 'ADMIN')
  list(@CurrentUser() u: any, @Query('status') status?: string) {
    const db = getDb();
    const conds = [eq(schema.orders.userId, u.id)];
    const orders = db.select().from(schema.orders)
      .where(status ? and(...conds, eq(schema.orders.status, status)) : conds[0])
      .orderBy(desc(schema.orders.createdAt)).all();
    return orders.map((o) => ({
      ...o,
      items: db.select({
        id: schema.orderItems.id, productName: schema.orderItems.productName,
        optionLabel: schema.orderItems.optionLabel, quantity: schema.orderItems.quantity,
        unitPrice: schema.orderItems.unitPrice, thumbnailUrl: schema.products.thumbnailUrl,
      }).from(schema.orderItems).innerJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
        .where(eq(schema.orderItems.orderId, o.id)).all(),
    }));
  }

  @Get(':id')
  @Auth('USER', 'ADMIN')
  detail(@CurrentUser() u: any, @Param('id') id: number) {
    const db = getDb();
    const order = db.select().from(schema.orders).where(eq(schema.orders.id, id)).get();
    if (!order || order.userId !== u.id) throw new NotFoundException('주문 없음');
    const items = db.select({
      id: schema.orderItems.id, productName: schema.orderItems.productName,
      optionLabel: schema.orderItems.optionLabel, quantity: schema.orderItems.quantity,
      unitPrice: schema.orderItems.unitPrice, productId: schema.orderItems.productId,
      status: schema.orderItems.status, thumbnailUrl: schema.products.thumbnailUrl,
    }).from(schema.orderItems).innerJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
      .where(eq(schema.orderItems.orderId, id)).all();
    const payment = db.select().from(schema.payments).where(eq(schema.payments.orderId, id)).get();
    return { ...order, items, payment };
  }

  // ── 구매 확정 ──
  @Post(':id/confirm')
  @Auth('USER', 'ADMIN')
  confirm(@CurrentUser() u: any, @Param('id') id: number) {
    const db = getDb();
    return runTx(() => {
      const order = db.select().from(schema.orders).where(eq(schema.orders.id, id)).get();
      if (!order || order.userId !== u.id) throw new NotFoundException('주문 없음');
      if (order.status !== 'DELIVERED') {
        throw new ConflictException('배송완료 상태에서만 구매확정 가능');
      }
      db.update(schema.orders).set({ status: 'CONFIRMED' }).where(eq(schema.orders.id, id)).run();
      // 포인트 적립
      const rule = gradeRule(u.grade);
      const earn = Math.floor(order.payAmount * rule.pointRate);
      if (earn > 0) {
        db.insert(schema.pointLedger).values({
          userId: u.id, amount: earn, type: 'EARN_ORDER', refOrderId: order.id,
          memo: '구매확정 적립', expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
        }).run();
        db.update(schema.users).set({
          pointBalance: u.pointBalance + earn,
          totalSpent: u.totalSpent + order.payAmount,
        }).where(eq(schema.users.id, u.id)).run();
      } else {
        db.update(schema.users).set({ totalSpent: u.totalSpent + order.payAmount })
          .where(eq(schema.users.id, u.id)).run();
      }
      // 등급 재산정
      const newGrade = gradeFromSpent(u.totalSpent + order.payAmount);
      if (newGrade !== u.grade) {
        db.update(schema.users).set({ grade: newGrade }).where(eq(schema.users.id, u.id)).run();
      }
      notify(u.id, 'ORDER', '구매 확정', `${order.orderNo} 구매확정 처리되어 ${earn}P가 적립되었습니다.`, '/my/points');
      return { ok: true, earnedPoints: earn, grade: newGrade };
    });
  }

  // ── 배송 조회 ──
  @Get(':id/shipment')
  @Auth('USER', 'ADMIN')
  shipment(@CurrentUser() u: any, @Param('id') id: number) {
    const db = getDb();
    const order = db.select().from(schema.orders).where(eq(schema.orders.id, id)).get();
    if (!order || order.userId !== u.id) throw new NotFoundException('주문 없음');
    const s = db.select().from(schema.shipments).where(eq(schema.shipments.orderId, id)).get();
    if (!s) throw new NotFoundException('배송 정보 없음');
    return { ...s, events: JSON.parse(s.events) };
  }
}

@Module({ controllers: [OrdersController] })
export class OrdersModule {}
