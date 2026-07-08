// 정적(데모) 모드 목 API 스모크 테스트 — node 환경(localStorage 없음)에서 동작
import { describe, it, expect } from 'vitest';
import { mockRequest } from './handlers';

const req = <T = any>(method: string, path: string, body?: unknown, token?: string | null) =>
  mockRequest<T>(method, path, body, token);

describe('mock API (정적 데모 모드)', () => {
  let userToken = '';
  let adminToken = '';

  it('로그인: 데모 계정', async () => {
    const u = await req('POST', '/auth/login', { email: 'user1@demo.com', password: 'demo1234' });
    expect(u.user.role).toBe('USER');
    expect(u.user.grade).toBe('VIP');
    userToken = u.token;
    const a = await req('POST', '/auth/login', { email: 'admin@demo.com', password: 'demo1234' });
    expect(a.user.role).toBe('ADMIN');
    adminToken = a.token;
    await expect(req('POST', '/auth/login', { email: 'user1@demo.com', password: 'wrong' })).rejects.toThrow();
  });

  it('카테고리 트리 3-depth', async () => {
    const cats = await req('GET', '/categories');
    expect(cats.length).toBe(3);
    const leaf = cats.flatMap((c: any) => c.children.flatMap((cc: any) => cc.children));
    expect(leaf.length).toBeGreaterThan(0);
  });

  it('상품 목록/검색/정렬/상세', async () => {
    const list = await req('GET', '/products?page=1&limit=12&sort=latest');
    expect(list.items.length).toBe(12);
    expect(list.totalPages).toBeGreaterThan(1);
    const asc = await req('GET', '/products?sort=priceAsc&limit=50');
    const prices = asc.items.map((p: any) => p.salePrice);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    const d = await req('GET', '/products/1');
    expect(d.skus.length).toBeGreaterThan(0);
    expect(d.options.length).toBe(1);
    expect(typeof d.totalStock).toBe('number');
    await req('GET', '/products/1/reviews');
    await req('GET', '/products/1/qnas');
    const pc = await req('GET', '/products/1/coupons');
    expect(pc.some((c: any) => c.scope === 'PRODUCT')).toBe(true);
  });

  it('장바구니 → 견적 → 주문 → 주문상세', async () => {
    const d = await req('GET', '/products/21'); // 옵션 없는 상품
    const sku = d.skus[0];
    await req('POST', '/cart', { skuId: sku.id, quantity: 2 }, userToken);
    const cart = await req('GET', '/cart', undefined, userToken);
    expect(cart.length).toBeGreaterThan(0);
    const items = cart.map((c: any) => ({ skuId: c.skuId, quantity: c.quantity }));

    const quote = await req('POST', '/orders/quote', { items, userCouponId: null, pointsUsed: 1000 }, userToken);
    expect(quote.payAmount).toBe(quote.itemsTotal - quote.gradeDiscount - quote.couponDiscount - quote.pointsUsed + quote.shippingFee);
    expect(quote.gradeDiscount).toBe(Math.floor(quote.itemsTotal * 0.03)); // VIP 3%

    const addrs = await req('GET', '/me/addresses', undefined, userToken);
    const before = sku.stock;
    const o = await req('POST', '/orders', { items, addressId: addrs[0].id, userCouponId: null, pointsUsed: 1000, paymentMethod: 'MOCK_CARD' }, userToken);
    expect(o.status).toBe('PAID');
    const od = await req('GET', `/orders/${o.orderId}`, undefined, userToken);
    expect(od.items.length).toBe(items.length);
    const d2 = await req('GET', '/products/21');
    expect(d2.skus[0].stock).toBe(before - 2);
    const cart2 = await req('GET', '/cart', undefined, userToken);
    expect(cart2.length).toBe(0);
  });

  it('결제 실패 시뮬레이션은 재고를 차감하지 않는다', async () => {
    const d = await req('GET', '/products/22');
    const sku = d.skus[0];
    await req('POST', '/cart', { skuId: sku.id, quantity: 1 }, userToken);
    const addrs = await req('GET', '/me/addresses', undefined, userToken);
    const o = await req('POST', '/orders', { items: [{ skuId: sku.id, quantity: 1 }], addressId: addrs[0].id, simulateFail: true }, userToken);
    expect(o.status).toBe('PAYMENT_FAILED');
    const d2 = await req('GET', '/products/22');
    expect(d2.skus[0].stock).toBe(sku.stock);
    await req('DELETE', `/cart/${(await req('GET', '/cart', undefined, userToken))[0].id}`, undefined, userToken);
  });

  it('쿠폰존 발급 + 견적 반영', async () => {
    const avail = await req('GET', '/coupons/available', undefined, userToken);
    const c = avail.find((x: any) => x.name.startsWith('10%'));
    if (!c.isIssued) await req('POST', `/coupons/${c.id}/download`, {}, userToken);
    await expect(req('POST', `/coupons/${c.id}/download`, {}, userToken)).rejects.toThrow('이미');
    const mine = await req('GET', '/me/coupons/?status=UNUSED', undefined, userToken);
    const uc = mine.find((x: any) => x.couponId === c.id);
    const d = await req('GET', '/products/23');
    const quote = await req('POST', '/orders/quote', { items: [{ skuId: d.skus[0].id, quantity: 1 }], userCouponId: uc.id, pointsUsed: 0 }, userToken);
    expect(quote.couponDiscount).toBeGreaterThan(0);
  });

  it('구매확정 → 포인트 적립', async () => {
    const orders = await req('GET', '/orders', undefined, userToken);
    const delivered = orders.find((x: any) => x.status === 'DELIVERED');
    expect(delivered).toBeTruthy();
    const me1 = await req('GET', '/me', undefined, userToken);
    const r = await req('POST', `/orders/${delivered.id}/confirm`, {}, userToken);
    expect(r.earnedPoints).toBe(Math.floor(delivered.payAmount * 0.05)); // VIP 5%
    const me2 = await req('GET', '/me', undefined, userToken);
    expect(me2.pointBalance).toBe(me1.pointBalance + r.earnedPoints);
  });

  it('클레임: 반품 접수 → 관리자 처리(승인→회수→검수→환불)', async () => {
    const orders = await req('GET', '/orders', undefined, userToken);
    const claims0 = await req('GET', '/claims', undefined, userToken);
    const target = orders.find((o: any) => o.status === 'CONFIRMED' && !claims0.some((c: any) => c.orderId === o.id));
    expect(target).toBeTruthy();
    await req('POST', '/claims', { orderId: target.id, orderItemId: target.items[0].id, type: 'RETURN', reason: '상품 불량', detail: '' }, userToken);
    const claims = await req('GET', '/claims', undefined, userToken);
    const cl = claims.find((c: any) => c.orderId === target.id);
    expect(cl.status).toBe('REQUESTED');
    for (const action of ['APPROVE', 'COLLECT', 'INSPECT']) {
      await req('PATCH', `/admin/claims/${cl.id}`, { action }, adminToken);
    }
    await req('PATCH', `/admin/claims/${cl.id}`, { action: 'RESTOCK', inspectionResult: 'RESTOCK' }, adminToken);
    const done = (await req('GET', '/admin/claims', undefined, adminToken)).find((c: any) => c.id === cl.id);
    expect(done.status).toBe('REFUNDED');
    expect(done.refundAmount).toBeGreaterThan(0);
  });

  it('관리자: 대시보드/주문 상태 전이/배송 진행', async () => {
    const dash = await req('GET', '/admin/dashboard', undefined, adminToken);
    expect(dash.chart.length).toBe(7);
    expect(dash.totalSales).toBeGreaterThan(0);

    const orders = await req('GET', '/admin/orders?status=PAID', undefined, adminToken);
    const o = orders[0];
    await req('PATCH', `/admin/orders/${o.id}/status`, { status: 'PREPARING' }, adminToken);
    await expect(req('PATCH', `/admin/orders/${o.id}/status`, { status: 'DELIVERED' }, adminToken)).rejects.toThrow();
    const ships = await req('GET', '/admin/shipments', undefined, adminToken);
    const s = ships.find((x: any) => x.orderId === o.id);
    expect(s.status).toBe('READY');
    for (let i = 0; i < 4; i++) await req('POST', `/admin/shipments/${s.id}/advance`, {}, adminToken);
    const after = (await req('GET', '/admin/shipments', undefined, adminToken)).find((x: any) => x.id === s.id);
    expect(after.status).toBe('DELIVERED');
    expect(after.orderStatus).toBe('DELIVERED');
    const shipView = await req('GET', `/orders/${o.id}/shipment`, undefined, `mock-token-${o.userId}`);
    expect(shipView.events.length).toBe(5);
  });

  it('관리자: 상품 등록(옵션 데카르트 곱) / SKU 수정 / 회원 포인트', async () => {
    await req('POST', '/admin/products', { name: '테스트 상품', categoryId: 3, basePrice: 20000, salePrice: 18000, options: [{ name: '색상', values: ['블랙', '화이트'] }, { name: '사이즈', values: ['S', 'M', 'L'] }] }, adminToken);
    const list = await req('GET', '/admin/products', undefined, adminToken);
    const p = list.find((x: any) => x.name === '테스트 상품');
    const detail = await req('GET', `/admin/products/${p.id}`, undefined, adminToken);
    expect(detail.skus.length).toBe(6);
    await req('PATCH', `/admin/skus/${detail.skus[0].id}`, { stock: 99 }, adminToken);
    expect((await req('GET', `/admin/products/${p.id}`, undefined, adminToken)).skus[0].stock).toBe(99);

    const users = await req('GET', '/admin/users', undefined, adminToken);
    const u = users.find((x: any) => x.email === 'user6@demo.com');
    await req('POST', `/admin/users/${u.id}/points`, { amount: 5000, memo: '테스트' }, adminToken);
    expect((await req('GET', '/admin/users', undefined, adminToken)).find((x: any) => x.id === u.id).pointBalance).toBe(u.pointBalance + 5000);
  });

  it('회원가입 → 가입쿠폰 자동 발급', async () => {
    const r = await req('POST', '/auth/signup', { email: 'new@demo.com', password: 'demo1234', name: '신규' });
    const mine = await req('GET', '/me/coupons', undefined, r.token);
    expect(mine.some((c: any) => c.name.startsWith('가입축하'))).toBe(true);
    await expect(req('POST', '/auth/signup', { email: 'new@demo.com', password: 'demo1234', name: '중복' })).rejects.toThrow('이미');
  });

  it('위시리스트 / 리뷰 / Q&A / 알림', async () => {
    await req('POST', '/wishlist', { productId: 5 }, userToken);
    expect((await req('GET', '/wishlist', undefined, userToken)).some((w: any) => w.productId === 5)).toBe(true);
    await req('DELETE', '/wishlist/5', undefined, userToken);
    expect((await req('GET', '/wishlist', undefined, userToken)).some((w: any) => w.productId === 5)).toBe(false);

    await req('POST', '/qnas', { productId: 5, question: '데모 문의입니다' }, userToken);
    const qnas = await req('GET', '/admin/qnas?answered=false', undefined, adminToken);
    const q = qnas.find((x: any) => x.question === '데모 문의입니다');
    await req('PATCH', `/admin/qnas/${q.id}`, { answer: '답변입니다' }, adminToken);
    const pq = await req('GET', '/products/5/qnas');
    expect(pq.find((x: any) => x.id === q.id).answer).toBe('답변입니다');

    const notis = await req('GET', '/me/notifications', undefined, userToken);
    expect(notis.length).toBeGreaterThan(0);
    await req('PATCH', `/me/notifications/${notis[0].id}/read`, {}, userToken);

    const pts = await req('GET', '/me/points', undefined, userToken);
    expect(pts.balance).toBeGreaterThan(0);
    expect(pts.ledger.length).toBeGreaterThan(0);
  });

  it('인증 가드: 토큰 없이 보호 API 호출 시 에러', async () => {
    await expect(req('GET', '/cart')).rejects.toThrow('로그인');
    await expect(req('GET', '/admin/dashboard', undefined, userToken)).rejects.toThrow('관리자');
  });
});
