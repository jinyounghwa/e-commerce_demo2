import { describe, it, expect } from 'vitest';
import { assertTransition, ORDER_TRANSITIONS, SHIPMENT_TRANSITIONS, CLAIM_TRANSITIONS } from './state-machine';

describe('주문 상태머신', () => {
  const allowed: [string, string][] = [
    ['PENDING_PAYMENT', 'PAID'], ['PENDING_PAYMENT', 'PAYMENT_FAILED'], ['PENDING_PAYMENT', 'CANCELED'],
    ['PAID', 'PREPARING'], ['PAID', 'CANCELED'],
    ['PREPARING', 'SHIPPED'], ['PREPARING', 'CANCELED'],
    ['SHIPPED', 'DELIVERING'], ['DELIVERING', 'DELIVERED'], ['DELIVERED', 'CONFIRMED'],
  ];
  it.each(allowed)('허용 전이 %s → %s', (from, to) => {
    expect(() => assertTransition(ORDER_TRANSITIONS, from, to)).not.toThrow();
  });

  const forbidden: [string, string][] = [
    ['DELIVERED', 'SHIPPED'], ['DELIVERED', 'PREPARING'], ['DELIVERED', 'PAID'],
    ['CONFIRMED', 'DELIVERED'], ['CONFIRMED', 'CANCELED'],
    ['SHIPPED', 'PAID'], ['SHIPPED', 'CANCELED'], // 출고 후 취소 불가
    ['CANCELED', 'PAID'], ['PAYMENT_FAILED', 'PAID'],
    ['PAID', 'DELIVERED'], ['PREPARING', 'DELIVERED'],
  ];
  it.each(forbidden)('불허 전이 %s → %s 는 409', (from, to) => {
    expect(() => assertTransition(ORDER_TRANSITIONS, from, to)).toThrow();
  });
});

describe('배송 상태머신', () => {
  it.each([
    ['READY', 'PICKED_UP'], ['PICKED_UP', 'IN_TRANSIT'],
    ['IN_TRANSIT', 'OUT_FOR_DELIVERY'], ['OUT_FOR_DELIVERY', 'DELIVERED'],
  ])('허용 전이 %s → %s', (from, to) => {
    expect(() => assertTransition(SHIPMENT_TRANSITIONS, from, to)).not.toThrow();
  });
  it.each([
    ['DELIVERED', 'OUT_FOR_DELIVERY'], ['READY', 'DELIVERED'], ['DELIVERED', 'READY'],
  ])('불허 전이 %s → %s', (from, to) => {
    expect(() => assertTransition(SHIPMENT_TRANSITIONS, from, to)).toThrow();
  });
});

describe('클레임 상태머신', () => {
  it('CANCEL 허용/불허', () => {
    expect(() => assertTransition(CLAIM_TRANSITIONS.CANCEL, 'REQUESTED', 'APPROVED')).not.toThrow();
    expect(() => assertTransition(CLAIM_TRANSITIONS.CANCEL, 'REQUESTED', 'REJECTED')).not.toThrow();
    expect(() => assertTransition(CLAIM_TRANSITIONS.CANCEL, 'REQUESTED', 'INSPECTING')).toThrow();
  });
  it('RETURN 전이 체인', () => {
    expect(() => assertTransition(CLAIM_TRANSITIONS.RETURN, 'REQUESTED', 'APPROVED')).not.toThrow();
    expect(() => assertTransition(CLAIM_TRANSITIONS.RETURN, 'APPROVED', 'COLLECTING')).not.toThrow();
    expect(() => assertTransition(CLAIM_TRANSITIONS.RETURN, 'COLLECTING', 'INSPECTING')).not.toThrow();
    expect(() => assertTransition(CLAIM_TRANSITIONS.RETURN, 'INSPECTING', 'REFUNDED')).not.toThrow();
    expect(() => assertTransition(CLAIM_TRANSITIONS.RETURN, 'APPROVED', 'REFUNDED')).toThrow(); // 검수 생략 불가
  });
  it('EXCHANGE 전이 체인', () => {
    expect(() => assertTransition(CLAIM_TRANSITIONS.EXCHANGE, 'INSPECTING', 'RESHIPPING')).not.toThrow();
    expect(() => assertTransition(CLAIM_TRANSITIONS.EXCHANGE, 'RESHIPPING', 'COMPLETED')).not.toThrow();
    expect(() => assertTransition(CLAIM_TRANSITIONS.EXCHANGE, 'INSPECTING', 'COMPLETED')).toThrow();
  });
});
