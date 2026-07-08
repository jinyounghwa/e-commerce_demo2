// 배송 시뮬레이터 — SKILL.md §8
import { ConflictException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../db/client';
import { assertTransition, SHIPMENT_LOCATIONS, SHIPMENT_TO_ORDER, SHIPMENT_TRANSITIONS } from '../../common/state-machine';
import { nowISO, randomTrackingNo } from '../../common/util';
import { notify } from '../../common/notify';

let autoRunTimer: NodeJS.Timeout | null = null;

/** 출고 처리: 송장 발급, READY 상태 보장 */
export function dispatchOrder(orderId: number) {
  const db = getDb();
  const order = db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).get();
  if (!order) throw new NotFoundException('주문 없음');
  if (!['PAID', 'PREPARING'].includes(order.status)) {
    throw new ConflictException('출고 가능 상태 아님 (PAID/PREPARING)');
  }
  // 주문을 PREPARING → SHIPPED 로 가려면 먼저 PREPARING 이어야. PAID면 먼저 PREPARING
  if (order.status === 'PAID') {
    db.update(schema.orders).set({ status: 'PREPARING' }).where(eq(schema.orders.id, orderId)).run();
  }
  let ship = db.select().from(schema.shipments).where(eq(schema.shipments.orderId, orderId)).get();
  const trackingNo = randomTrackingNo();
  if (!ship) {
    ship = db.insert(schema.shipments).values({
      orderId, trackingNo, status: 'READY',
      events: JSON.stringify([{ status: 'READY', location: SHIPMENT_LOCATIONS.READY, at: nowISO() }]),
    }).returning().get();
  }
  // PREPARING → SHIPPED
  db.update(schema.orders).set({ status: 'SHIPPED' }).where(eq(schema.orders.id, orderId)).run();
  notify(order.userId, 'ORDER', '상품 출고', `${order.orderNo} 상품이 출고되었습니다.`, '/my/orders');
  return { orderId, trackingNo: ship.trackingNo };
}

/** 다음 배송 단계로 진행 */
export function advanceShipment(shipmentId: number) {
  const db = getDb();
  const ship = db.select().from(schema.shipments).where(eq(schema.shipments.id, shipmentId)).get();
  if (!ship) throw new NotFoundException('배송 정보 없음');
  const allowed = SHIPMENT_TRANSITIONS[ship.status];
  if (!allowed || allowed.length === 0) throw new ConflictException('이미 배송완료 상태');
  const next = allowed[0];
  assertTransition(SHIPMENT_TRANSITIONS, ship.status, next, '배송');

  const events = JSON.parse(ship.events) as any[];
  events.push({ status: next, location: SHIPMENT_LOCATIONS[next], at: nowISO() });
  db.update(schema.shipments).set({ status: next, events: JSON.stringify(events) })
    .where(eq(schema.shipments.id, shipmentId)).run();

  // 주문 상태 동기화
  const order = db.select().from(schema.orders).where(eq(schema.orders.id, ship.orderId)).get()!;
  const mapped = SHIPMENT_TO_ORDER[next];
  if (mapped && order.status !== mapped && order.status !== 'CONFIRMED') {
    db.update(schema.orders).set({ status: mapped }).where(eq(schema.orders.id, order.id)).run();
  }
  const user = db.select().from(schema.users).where(eq(schema.users.id, order.userId)).get()!;
  const msgMap: Record<string, string> = {
    PICKED_UP: '상품이 인수되었습니다',
    IN_TRANSIT: '배송 중입니다',
    OUT_FOR_DELIVERY: '배송 출발했습니다',
    DELIVERED: '배송이 완료되었습니다',
  };
  notify(user.id, 'ORDER', '배송 상태 변경', `${order.orderNo} ${msgMap[next] ?? ''}`, '/my/orders');
  return { status: next, events };
}

/** 자동 진행 토글 */
export function toggleAutoRun(on: boolean) {
  if (on && !autoRunTimer) {
    autoRunTimer = setInterval(() => {
      try {
        const db = getDb();
        const ready = db.select().from(schema.shipments)
          .where(eq(schema.shipments.status, 'READY')).all();
        const inTransit = db.select().from(schema.shipments)
          .where(eq(schema.shipments.status, 'IN_TRANSIT')).all();
        const o4 = db.select().from(schema.shipments)
          .where(eq(schema.shipments.status, 'OUT_FOR_DELIVERY')).all();
        const picked = db.select().from(schema.shipments)
          .where(eq(schema.shipments.status, 'PICKED_UP')).all();
        const targets = [...ready, ...picked, ...inTransit, ...o4];
        targets.forEach((s) => { try { advanceShipment(s.id); } catch { /* 완료/불가 무시 */ } });
      } catch { /* ignore */ }
    }, 10_000);
    return { autoRun: true };
  }
  if (!on && autoRunTimer) {
    clearInterval(autoRunTimer);
    autoRunTimer = null;
  }
  return { autoRun: !!autoRunTimer };
}
