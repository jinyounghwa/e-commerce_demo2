// 클레임 전이 + 환불/재고 처리 — SKILL.md §3-3, §4-3, §7
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { getDb, getRaw, schema, runTx } from '../../db/client';
import { assertTransition, CLAIM_TRANSITIONS } from '../../common/state-machine';
import { PriceCalculator } from '../orders/price-calculator';
import { notify } from '../../common/notify';
import { nowISO } from '../../common/util';

export interface ClaimAction {
  action: 'APPROVE' | 'REJECT' | 'COLLECT' | 'INSPECT' | 'RESTOCK' | 'DISPOSE' | 'RESHIP';
  inspectionResult?: 'RESTOCK' | 'DISPOSE';
  exchangeSkuId?: number;
}

/** 관리자 클레임 처리 */
export function processClaim(claimId: number, act: ClaimAction) {
  const db = getDb();
  const raw = getRaw();
  return runTx(() => {
    const claim = db.select().from(schema.claims).where(eq(schema.claims.id, claimId)).get();
    if (!claim) throw new NotFoundException('클레임 없음');
    const map = CLAIM_TRANSITIONS[claim.type];

    let toStatus = claim.status;
    if (act.action === 'APPROVE') toStatus = claim.type === 'CANCEL' ? 'APPROVED' : 'APPROVED';
    if (act.action === 'REJECT') toStatus = 'REJECTED';
    if (act.action === 'COLLECT') toStatus = 'COLLECTING';
    if (act.action === 'INSPECT') toStatus = 'INSPECTING';
    if (act.action === 'RESTOCK' || act.action === 'DISPOSE') {
      // 검수 분기 → RETURN: REFUNDED, EXCHANGE: RESHIPPING (또는 COMPLETED)
      if (claim.type === 'RETURN') toStatus = 'REFUNDED';
      else toStatus = 'RESHIPPING';
    }
    if (act.action === 'RESHIP') toStatus = 'COMPLETED';

    assertTransition(map, claim.status, toStatus, `클레임(${claim.type})`);

    const order = db.select().from(schema.orders).where(eq(schema.orders.id, claim.orderId)).get()!;
    const item = db.select().from(schema.orderItems).where(eq(schema.orderItems.id, claim.orderItemId)).get()!;
    const user = db.select().from(schema.users).where(eq(schema.users.id, claim.userId)).get()!;

    const update: any = { status: toStatus };
    let refundAmount = 0;
    let refundPoints = 0;

    if (toStatus === 'APPROVED' && claim.type === 'CANCEL') {
      // 출고 전 취소: 전액 환불 + 재고복원 + 포인트/쿠폰 복원 + 주문 CANCELED
      refundAmount = order.payAmount;
      refundPoints = order.pointsUsed;
      // 재고 복원
      restoreStock(item.skuId, item.quantity);
      // 주문 취소
      db.update(schema.orders).set({ status: 'CANCELED' }).where(eq(schema.orders.id, order.id)).run();
      // 쿠폰 복원 (전체 취소)
      if (order.usedUserCouponId) {
        db.update(schema.userCoupons).set({ status: 'UNUSED', usedAt: null, usedOrderId: null })
          .where(eq(schema.userCoupons.id, order.usedUserCouponId)).run();
      }
      // 아이템 상태
      db.update(schema.orderItems).set({ status: 'CLAIMED' }).where(eq(schema.orderItems.id, item.id)).run();
      applyRefund(user.id, refundAmount, refundPoints, order.id, '취소 환불');
    }

    if ((act.action === 'RESTOCK' || act.action === 'DISPOSE') && toStatus === 'REFUNDED') {
      // 반품 검수 완료 → 환불 안분 (§4-3)
      const isLast = !hasOtherActiveItems(order.id, item.id);
      const r = PriceCalculator.itemRefund(
        order.payAmount, order.pointsUsed, order.itemsTotal,
        item.unitPrice, item.quantity, isLast,
      );
      refundAmount = r.refundAmount;
      refundPoints = r.refundPoints;
      update.inspectionResult = act.inspectionResult ?? (act.action === 'RESTOCK' ? 'RESTOCK' : 'DISPOSE');
      update.refundAmount = refundAmount;
      update.refundPoints = refundPoints;
      update.resolvedAt = nowISO();
      // 양품화 시 재고 복원
      if (update.inspectionResult === 'RESTOCK') {
        restoreStock(item.skuId, item.quantity);
      }
      db.update(schema.orderItems).set({ status: 'CLAIMED' }).where(eq(schema.orderItems.id, item.id)).run();
      applyRefund(user.id, refundAmount, refundPoints, order.id, '반품 환불');
    }

    if (toStatus === 'RESHIPPING' && claim.type === 'EXCHANGE') {
      // 교환품 출고: 교환 SKU 재고 차감
      const exSkuId = act.exchangeSkuId ?? claim.exchangeSkuId;
      if (!exSkuId) throw new BadRequestException('교환 대상 SKU 필요');
      const exSku = db.select().from(schema.skus).where(eq(schema.skus.id, exSkuId)).get();
      if (!exSku) throw new NotFoundException('교환 SKU 없음');
      const r = raw.prepare('UPDATE skus SET stock = stock - ? WHERE id = ? AND stock >= ?')
        .run(item.quantity, exSkuId, item.quantity);
      if (r.changes === 0) throw new ConflictException('교환품 재고 부족');
      update.exchangeSkuId = exSkuId;
      update.inspectionResult = act.inspectionResult ?? 'RESTOCK';
      // 회수품 양품화 시 재고 복원
      if (update.inspectionResult === 'RESTOCK') restoreStock(item.skuId, item.quantity);
    }

    if (toStatus === 'COMPLETED') {
      update.resolvedAt = nowISO();
      db.update(schema.orderItems).set({ status: 'CLAIMED' }).where(eq(schema.orderItems.id, item.id)).run();
    }

    if (toStatus === 'REJECTED') {
      update.resolvedAt = nowISO();
    }

    db.update(schema.claims).set(update).where(eq(schema.claims.id, claimId)).run();
    notify(user.id, 'CLAIM', 'CS 처리 안내', `클레임이 ${toStatus} 상태로 처리되었습니다.`, '/my/claims');
    return { ok: true, status: toStatus, refundAmount, refundPoints };
  });
}

function restoreStock(skuId: number, qty: number) {
  getDb().update(schema.skus).set({
    stock: sql`stock + ${qty}` as any,
  }).where(eq(schema.skus.id, skuId)).run();
}

function hasOtherActiveItems(orderId: number, exceptItemId: number): boolean {
  const db = getDb();
  const others = db.select().from(schema.orderItems)
    .where(and(eq(schema.orderItems.orderId, orderId), eq(schema.orderItems.status, 'NORMAL'))).all();
  return others.some((o) => o.id !== exceptItemId);
}

function applyRefund(userId: number, amount: number, points: number, orderId: number, memo: string) {
  const db = getDb();
  if (amount > 0) {
    // 환불액은 외부(Mock)로 처리 — 포인트만 원장 복원
  }
  if (points > 0) {
    const u = db.select().from(schema.users).where(eq(schema.users.id, userId)).get()!;
    db.update(schema.users).set({ pointBalance: u.pointBalance + points })
      .where(eq(schema.users.id, userId)).run();
    db.insert(schema.pointLedger).values({
      userId, amount: points, type: 'REFUND', refOrderId: orderId, memo,
    }).run();
  }
}
