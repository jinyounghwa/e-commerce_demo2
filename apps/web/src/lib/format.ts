export const won = (n: number) => (n ?? 0).toLocaleString('ko-KR') + '원';
export const num = (n: number) => (n ?? 0).toLocaleString('ko-KR');
export const date = (s?: string) => (s ? new Date(s).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-');
export const dateOnly = (s?: string) => (s ? new Date(s).toLocaleDateString('ko-KR') : '-');

export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: '결제대기', PAID: '결제완료', PAYMENT_FAILED: '결제실패',
  PREPARING: '상품준비', SHIPPED: '배송중', DELIVERING: '배송중', DELIVERED: '배송완료',
  CONFIRMED: '구매확정', CANCELED: '취소',
};
export const ORDER_STATUS_COLOR: Record<string, string> = {
  PENDING_PAYMENT: 'bg-gray-100 text-gray-700', PAID: 'bg-blue-100 text-blue-700',
  PAYMENT_FAILED: 'bg-red-100 text-red-700', PREPARING: 'bg-amber-100 text-amber-700',
  SHIPPED: 'bg-indigo-100 text-indigo-700', DELIVERING: 'bg-indigo-100 text-indigo-700',
  DELIVERED: 'bg-green-100 text-green-700', CONFIRMED: 'bg-emerald-100 text-emerald-700',
  CANCELED: 'bg-red-100 text-red-700',
};
export const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  READY: '상품준비', PICKED_UP: '상품인수', IN_TRANSIT: '이동중', OUT_FOR_DELIVERY: '배송출발', DELIVERED: '배송완료',
};
export const CLAIM_STATUS_LABEL: Record<string, string> = {
  REQUESTED: '접수', APPROVED: '승인', REJECTED: '거절', COLLECTING: '회수중',
  INSPECTING: '검수중', REFUNDED: '환불완료', RESHIPPING: '교환출고', COMPLETED: '완료',
};
export const GRADE_LABEL: Record<string, string> = { BRONZE: '브론즈', SILVER: '실버', GOLD: '골드', VIP: 'VIP' };
