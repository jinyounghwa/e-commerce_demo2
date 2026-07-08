// 상태머신 정의 — SKILL.md §3
import { ConflictException } from '@nestjs/common';

// §3-1 주문
export const ORDER_TRANSITIONS: Record<string, string[]> = {
  PENDING_PAYMENT: ['PAID', 'PAYMENT_FAILED', 'CANCELED'],
  PAID: ['PREPARING', 'CANCELED'],
  PREPARING: ['SHIPPED', 'CANCELED'],
  SHIPPED: ['DELIVERING'],
  DELIVERING: ['DELIVERED'],
  DELIVERED: ['CONFIRMED'],
};

// §3-2 배송
export const SHIPMENT_TRANSITIONS: Record<string, string[]> = {
  READY: ['PICKED_UP'],
  PICKED_UP: ['IN_TRANSIT'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
};

// 배송 상태 → 주문 상태 매핑
export const SHIPMENT_TO_ORDER: Record<string, string> = {
  READY: 'PAID',
  PICKED_UP: 'SHIPPED',
  IN_TRANSIT: 'SHIPPED',
  OUT_FOR_DELIVERY: 'DELIVERING',
  DELIVERED: 'DELIVERED',
};

// 배송 단계별 location (가상 시나리오)
export const SHIPMENT_LOCATIONS: Record<string, string> = {
  READY: '물류센터',
  PICKED_UP: '서울 물류센터',
  IN_TRANSIT: '옥천 HUB',
  OUT_FOR_DELIVERY: '강남 배송캠프',
  DELIVERED: '배송완료',
};

// §3-3 클레임 (타입별)
export const CLAIM_TRANSITIONS: Record<string, Record<string, string[]>> = {
  CANCEL: { REQUESTED: ['APPROVED', 'REJECTED'] },
  RETURN: {
    REQUESTED: ['APPROVED', 'REJECTED'],
    APPROVED: ['COLLECTING'],
    COLLECTING: ['INSPECTING'],
    INSPECTING: ['REFUNDED'],
  },
  EXCHANGE: {
    REQUESTED: ['APPROVED', 'REJECTED'],
    APPROVED: ['COLLECTING'],
    COLLECTING: ['INSPECTING'],
    INSPECTING: ['RESHIPPING'],
    RESHIPPING: ['COMPLETED'],
  },
};

export function assertTransition(
  map: Record<string, string[]>,
  from: string,
  to: string,
  label = '상태',
) {
  if (!map[from] || !map[from].includes(to)) {
    throw new ConflictException(`불허 전이: ${label} ${from} → ${to}`);
  }
}
