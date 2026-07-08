// API 클라이언트 + 타입 정의
import { useAuth } from './stores/auth';

const BASE = '/api';

async function request<T>(method: string, path: string, body?: unknown, token?: string | null): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data: any;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!res.ok) {
    const msg = data?.message || (typeof data === 'string' ? data : `HTTP ${res.status}`);
    throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
  }
  return data as T;
}

export function api(path = '') {
  const token = useAuth.getState().token;
  return {
    get: <T = any>(p?: string) => request<T>('GET', path + (p ?? ''), undefined, token),
    post: <T = any>(body?: unknown, p?: string) => request<T>('POST', path + (p ?? ''), body, token),
    patch: <T = any>(body?: unknown, p?: string) => request<T>('PATCH', path + (p ?? ''), body, token),
    del: <T = any>(p?: string) => request<T>('DELETE', path + (p ?? ''), undefined, token),
  };
}

// ── 인증 ──
export const authApi = {
  signup: (b: { email: string; password: string; name: string }) => request<{ token: string; user: any }>('POST', '/auth/signup', b),
  login: (b: { email: string; password: string }) => request<{ token: string; user: any }>('POST', '/auth/login', b),
};

// ── 타입 ──
export interface Product { id: number; name: string; basePrice: number; salePrice: number; thumbnailUrl: string; status: string; categoryId: number; }
export interface Sku { id: number; optionLabel: string; extraPrice: number; stock: number; isActive: number; isSoldOut?: boolean; optionValueIds: string; }
export interface ProductDetail extends Product { description: string; detailImages: string; category: any; options: any[]; skus: Sku[]; totalStock: number; reviewAvg: number; reviewCount: number; }
export interface CartItem { id: number; quantity: number; skuId: number; stock: number; extraPrice: number; optionLabel: string; productId: number; productName: string; salePrice: number; thumbnailUrl: string; unitPrice: number; isSoldOut: boolean; }
export interface Order { id: number; orderNo: string; status: string; itemsTotal: number; couponDiscount: number; gradeDiscount: number; pointsUsed: number; shippingFee: number; payAmount: number; createdAt: string; paidAt?: string; items?: any[]; user?: any; receiver?: string; phone?: string; zipcode?: string; addr1?: string; addr2?: string; }
export interface Quote { itemsTotal: number; gradeDiscount: number; couponDiscount: number; pointsUsed: number; shippingFee: number; payAmount: number; discountedTotal: number; grade: string; }
export interface UserCoupon { id: number; status: string; issuedAt: string; expiresAt: string; couponId: number; name: string; discountType: string; discountValue: number; maxDiscount: number | null; minOrderAmount: number; scope: string; scopeProductId: number | null; }
export interface Shipment { id: number; orderId: number; carrier: string; trackingNo: string; status: string; events: { status: string; location: string; at: string }[]; orderNo?: string; }
