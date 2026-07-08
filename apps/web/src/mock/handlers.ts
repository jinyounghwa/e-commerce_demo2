// 정적(데모) 모드 API 핸들러 — apps/api 의 엔드포인트를 브라우저에서 재현
import {
  getDb, saveDb, nextId, nowISO, addDays, makeOrderNo, trackingNo,
  gradeRule, gradeFromSpent, SHIP_SEQ, SHIP_LOC,
  DbOrder, DbSku, DbUser, DbCoupon,
} from './db';

class ApiError extends Error { status: number; constructor(msg: string, status = 400) { super(msg); this.status = status; } }

const floor = Math.floor;

function authUser(token?: string | null): DbUser {
  const m = /^mock-token-(\d+)$/.exec(token ?? '');
  const user = m ? getDb().users.find((u) => u.id === Number(m[1])) : undefined;
  if (!user) throw new ApiError('로그인이 필요합니다.', 401);
  return user;
}
function authAdmin(token?: string | null): DbUser {
  const u = authUser(token);
  if (u.role !== 'ADMIN') throw new ApiError('관리자 권한이 필요합니다.', 403);
  return u;
}
const publicUser = (u: DbUser) => ({ id: u.id, email: u.email, name: u.name, role: u.role, grade: u.grade, pointBalance: u.pointBalance });

// ── 카테고리 트리 ──
function categoryTree() {
  const db = getDb();
  const byParent = (pid: number | null): any[] =>
    db.categories.filter((c) => c.parentId === pid).sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({ ...c, children: byParent(c.id) }));
  return byParent(null);
}
function subtreeCategoryIds(rootId: number): number[] {
  const db = getDb();
  const out = [rootId];
  for (let i = 0; i < out.length; i++) out.push(...db.categories.filter((c) => c.parentId === out[i]).map((c) => c.id));
  return out;
}

// ── 상품 조회 헬퍼 ──
function productStock(pid: number) {
  return getDb().skus.filter((s) => s.productId === pid && s.isActive).reduce((sum, s) => sum + s.stock, 0);
}
function productReviewStats(pid: number) {
  const rs = getDb().reviews.filter((r) => r.productId === pid && r.isVisible);
  const avg = rs.length ? rs.reduce((s, r) => s + r.rating, 0) / rs.length : 0;
  return { reviewAvg: avg, reviewCount: rs.length };
}

// ── 금액 계산 (apps/api price-calculator.ts 와 동일 순서) ──
function calcQuote(user: DbUser, items: { skuId: number; quantity: number }[], userCouponId: number | null, requestedPoints: number) {
  const db = getDb();
  if (!items.length) throw new ApiError('주문 상품이 없습니다.');
  const detail = items.map((it) => {
    const sku = db.skus.find((s) => s.id === it.skuId);
    if (!sku) throw new ApiError('존재하지 않는 SKU입니다.');
    const prod = db.products.find((p) => p.id === sku.productId)!;
    return { sku, prod, quantity: it.quantity };
  });
  const itemsTotal = detail.reduce((s, d) => s + (d.prod.salePrice + d.sku.extraPrice) * d.quantity, 0);
  const gRate = gradeRule(user.grade).gradeRate;
  const gradeDiscount = floor(itemsTotal * gRate);

  let couponDiscount = 0;
  let coupon: DbCoupon | null = null;
  if (userCouponId) {
    const uc = db.userCoupons.find((x) => x.id === userCouponId && x.userId === user.id);
    if (!uc || uc.status !== 'UNUSED') throw new ApiError('사용할 수 없는 쿠폰입니다.');
    if (new Date(uc.expiresAt) < new Date()) throw new ApiError('만료된 쿠폰입니다.');
    coupon = db.coupons.find((c) => c.id === uc.couponId) ?? null;
  }
  if (coupon) {
    let scopeBase: number, checkBase: number;
    if (coupon.scope === 'CATEGORY' && coupon.scopeCategoryId) {
      const ids = subtreeCategoryIds(coupon.scopeCategoryId);
      const catBase = detail.filter((d) => ids.includes(d.prod.categoryId)).reduce((s, d) => s + (d.prod.salePrice + d.sku.extraPrice) * d.quantity, 0);
      checkBase = catBase; scopeBase = catBase - floor(catBase * gRate);
    } else if (coupon.scope === 'PRODUCT' && coupon.scopeProductId) {
      const prodBase = detail.filter((d) => d.prod.id === coupon!.scopeProductId).reduce((s, d) => s + (d.prod.salePrice + d.sku.extraPrice) * d.quantity, 0);
      checkBase = prodBase; scopeBase = prodBase - floor(prodBase * gRate);
    } else {
      checkBase = itemsTotal - gradeDiscount; scopeBase = itemsTotal - gradeDiscount;
    }
    if (checkBase < coupon.minOrderAmount) throw new ApiError('쿠폰 최소주문금액 미달입니다.');
    if (coupon.discountType === 'FIXED') couponDiscount = Math.min(coupon.discountValue, scopeBase);
    else {
      const d = floor((scopeBase * coupon.discountValue) / 100);
      couponDiscount = coupon.maxDiscount != null ? Math.min(d, coupon.maxDiscount) : d;
    }
    couponDiscount = Math.max(0, Math.min(couponDiscount, scopeBase));
  }

  const discountedTotal = itemsTotal - gradeDiscount - couponDiscount;
  const maxByBalance = Math.min(user.pointBalance, discountedTotal);
  const pointsUsed = Math.max(0, floor(Math.min(requestedPoints || 0, maxByBalance) / 100) * 100);
  const afterPoint = discountedTotal - pointsUsed;
  const shippingFee = afterPoint >= 50000 ? 0 : 3000;
  const payAmount = discountedTotal - pointsUsed + shippingFee;
  return { itemsTotal, gradeDiscount, couponDiscount, pointsUsed, shippingFee, payAmount, discountedTotal, grade: user.grade, _detail: detail };
}

function cartView(userId: number) {
  const db = getDb();
  return db.cart.filter((c) => c.userId === userId).map((c) => {
    const sku = db.skus.find((s) => s.id === c.skuId)!;
    const prod = db.products.find((p) => p.id === sku.productId)!;
    return {
      id: c.id, quantity: c.quantity, skuId: sku.id, stock: sku.stock, extraPrice: sku.extraPrice,
      optionLabel: sku.optionLabel, productId: prod.id, productName: prod.name, salePrice: prod.salePrice,
      thumbnailUrl: prod.thumbnailUrl, unitPrice: prod.salePrice + sku.extraPrice,
      isSoldOut: sku.stock <= 0 || prod.status !== 'ON_SALE',
    };
  });
}

function orderView(o: DbOrder, withUser = false) {
  const db = getDb();
  const items = db.orderItems.filter((it) => it.orderId === o.id).map((it) => ({
    ...it, thumbnailUrl: db.products.find((p) => p.id === it.productId)?.thumbnailUrl ?? '',
  }));
  const user = db.users.find((u) => u.id === o.userId);
  return { ...o, items, ...(withUser ? { user: user ? { id: user.id, name: user.name, email: user.email } : null } : {}) };
}

function notify(userId: number, type: string, title: string, body: string, link: string | null) {
  getDb().notifications.unshift({ id: nextId('notifications'), userId, type, title, body, link, isRead: 0, createdAt: nowISO() });
}

function issueCoupon(user: DbUser, couponId: number) {
  const db = getDb();
  const c = db.coupons.find((x) => x.id === couponId && x.isActive);
  if (!c) throw new ApiError('존재하지 않는 쿠폰입니다.', 404);
  if (db.userCoupons.some((uc) => uc.userId === user.id && uc.couponId === c.id)) throw new ApiError('이미 발급받은 쿠폰입니다.');
  if (c.totalQuantity != null && c.issuedCount >= c.totalQuantity) throw new ApiError('쿠폰 수량이 모두 소진되었습니다.');
  c.issuedCount++;
  const uc = { id: nextId('userCoupons'), userId: user.id, couponId: c.id, status: 'UNUSED', issuedAt: nowISO(), expiresAt: addDays(nowISO(), c.validDays) };
  db.userCoupons.push(uc);
  return uc;
}

function userCouponView(userId: number, status?: string | null) {
  const db = getDb();
  return db.userCoupons.filter((uc) => uc.userId === userId)
    .map((uc) => {
      const c = db.coupons.find((x) => x.id === uc.couponId)!;
      const expired = uc.status === 'UNUSED' && new Date(uc.expiresAt) < new Date();
      return {
        id: uc.id, status: expired ? 'EXPIRED' : uc.status, issuedAt: uc.issuedAt, expiresAt: uc.expiresAt,
        couponId: c.id, name: c.name, discountType: c.discountType, discountValue: c.discountValue,
        maxDiscount: c.maxDiscount, minOrderAmount: c.minOrderAmount, scope: c.scope, scopeProductId: c.scopeProductId,
      };
    })
    .filter((v) => !status || v.status === status)
    .sort((a, b) => b.id - a.id);
}

// ── 배송 진행 ──
function advanceShipment(shipId: number) {
  const db = getDb();
  const s = db.shipments.find((x) => x.id === shipId);
  if (!s) throw new ApiError('배송 정보를 찾을 수 없습니다.', 404);
  const idx = SHIP_SEQ.indexOf(s.status);
  if (idx >= SHIP_SEQ.length - 1) throw new ApiError('이미 배송이 완료되었습니다.');
  const nextStatus = SHIP_SEQ[idx + 1];
  s.status = nextStatus;
  s.events.push({ status: nextStatus, location: SHIP_LOC[nextStatus], at: nowISO() });
  const order = db.orders.find((o) => o.id === s.orderId);
  if (order) {
    if (nextStatus === 'DELIVERED') order.status = 'DELIVERED';
    else if (nextStatus === 'PICKED_UP') order.status = 'SHIPPED';
    else order.status = 'DELIVERING';
    if (nextStatus === 'DELIVERED') notify(order.userId, 'ORDER', '배송 완료', `${order.orderNo} 상품이 배송 완료되었습니다.`, `/my/orders/${order.id}`);
  }
  return s;
}
function maybeAutoRunShipments() {
  const db = getDb();
  if (!db.shipAutoRun) return;
  const now = Date.now();
  if (now - db.shipAutoLastTick < 10000) return;
  db.shipAutoLastTick = now;
  for (const s of db.shipments) {
    if (s.status !== 'DELIVERED') { try { advanceShipment(s.id); } catch { /* 완료 건 무시 */ } }
  }
  saveDb();
}

// ── 재고 복원 ──
function restoreStock(orderId: number) {
  const db = getDb();
  for (const it of db.orderItems.filter((x) => x.orderId === orderId)) {
    const sku = db.skus.find((s) => s.id === it.skuId);
    if (sku) sku.stock += it.quantity;
  }
}

type Handler = (ctx: { parts: string[]; qs: URLSearchParams; body: any; token?: string | null }) => any;

function route(method: string, parts: string[], qs: URLSearchParams, body: any, token?: string | null): any {
  const db = getDb();
  const [p0, p1, p2, p3] = parts;
  const M = (m: string, ...pat: (string | null)[]) =>
    method === m && pat.length === parts.length && pat.every((x, i) => x === null || x === parts[i]);
  const id = (s: string) => Number(s);

  // ══ 인증 ══
  if (M('POST', 'auth', 'signup')) {
    const { email, password, name } = body ?? {};
    if (!email || !password || password.length < 6 || !name) throw new ApiError('이름/이메일/비밀번호(6자 이상)를 입력하세요.');
    if (db.users.some((u) => u.email === email)) throw new ApiError('이미 가입된 이메일입니다.');
    const user: DbUser = { id: nextId('users'), email, password, name, role: 'USER', grade: 'BRONZE', totalSpent: 0, pointBalance: 0 };
    db.users.push(user);
    const signupCoupon = db.coupons.find((c) => c.issueType === 'AUTO_SIGNUP' && c.isActive);
    if (signupCoupon) { try { issueCoupon(user, signupCoupon.id); } catch { /* 무시 */ } }
    notify(user.id, 'COUPON', '가입을 환영합니다', '가입축하 쿠폰이 발급되었습니다.', '/my/coupons');
    return { token: `mock-token-${user.id}`, user: publicUser(user) };
  }
  if (M('POST', 'auth', 'login')) {
    const { email, password } = body ?? {};
    const user = db.users.find((u) => u.email === email && u.password === password);
    if (!user) throw new ApiError('이메일 또는 비밀번호가 올바르지 않습니다.', 401);
    return { token: `mock-token-${user.id}`, user: publicUser(user) };
  }

  // ══ 카테고리 / 상품 (공개) ══
  if (M('GET', 'categories')) return categoryTree();
  if (M('GET', 'products')) {
    const category = qs.get('category');
    const q = (qs.get('q') ?? '').trim();
    const sort = qs.get('sort') ?? 'latest';
    const page = Math.max(1, Number(qs.get('page') ?? 1));
    const limit = Math.max(1, Number(qs.get('limit') ?? 12));
    let items = db.products.filter((p) => p.status === 'ON_SALE');
    if (category) { const ids = subtreeCategoryIds(Number(category)); items = items.filter((p) => ids.includes(p.categoryId)); }
    if (q) items = items.filter((p) => p.name.includes(q));
    const withStats = items.map((p) => ({ ...p, ...productReviewStats(p.id) }));
    if (sort === 'priceAsc') withStats.sort((a, b) => a.salePrice - b.salePrice);
    else if (sort === 'priceDesc') withStats.sort((a, b) => b.salePrice - a.salePrice);
    else if (sort === 'rating') withStats.sort((a, b) => b.reviewAvg - a.reviewAvg);
    else withStats.sort((a, b) => b.id - a.id);
    const total = withStats.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { items: withStats.slice((page - 1) * limit, page * limit), total, totalPages };
  }
  if (M('GET', 'products', null)) {
    const p = db.products.find((x) => x.id === id(p1));
    if (!p) throw new ApiError('상품을 찾을 수 없습니다.', 404);
    const skus = db.skus.filter((s) => s.productId === p.id && s.isActive).map((s) => ({ ...s, isSoldOut: s.stock <= 0 }));
    return {
      ...p, category: db.categories.find((c) => c.id === p.categoryId) ?? null,
      options: db.options.filter((o) => o.productId === p.id),
      skus, totalStock: productStock(p.id), ...productReviewStats(p.id),
    };
  }
  if (M('GET', 'products', null, 'reviews')) {
    return db.reviews.filter((r) => r.productId === id(p1) && r.isVisible)
      .map((r) => ({ ...r, userName: db.users.find((u) => u.id === r.userId)?.name ?? '탈퇴회원' }))
      .sort((a, b) => b.id - a.id);
  }
  if (M('GET', 'products', null, 'qnas')) {
    return db.qnas.filter((q) => q.productId === id(p1))
      .map((q) => ({ ...q, userName: db.users.find((u) => u.id === q.userId)?.name ?? '탈퇴회원' }))
      .sort((a, b) => b.id - a.id);
  }
  if (M('GET', 'products', null, 'coupons')) {
    const pid = id(p1);
    const prod = db.products.find((x) => x.id === pid);
    if (!prod) return [];
    const catIds = db.coupons.filter((c) => c.scope === 'CATEGORY' && c.scopeCategoryId != null && subtreeCategoryIds(c.scopeCategoryId).includes(prod.categoryId));
    return db.coupons
      .filter((c) => c.isActive && c.issueType === 'DOWNLOAD' && (
        (c.scope === 'PRODUCT' && c.scopeProductId === pid) || catIds.includes(c) || c.scope === 'ALL'))
      .map((c) => ({ ...c, remaining: c.totalQuantity != null ? Math.max(0, c.totalQuantity - c.issuedCount) : null }));
  }

  // ══ 쿠폰 ══
  if (M('GET', 'coupons', 'available')) {
    const user = authUser(token);
    return db.coupons.filter((c) => c.isActive && c.issueType === 'DOWNLOAD' && c.scope !== 'PRODUCT').map((c) => ({
      ...c,
      remaining: c.totalQuantity != null ? Math.max(0, c.totalQuantity - c.issuedCount) : null,
      isIssued: db.userCoupons.some((uc) => uc.userId === user.id && uc.couponId === c.id),
    }));
  }
  if (M('POST', 'coupons', null, 'download')) { const user = authUser(token); issueCoupon(user, id(p1)); return { ok: true }; }

  // ══ 장바구니 ══
  if (M('GET', 'cart')) return cartView(authUser(token).id);
  if (M('POST', 'cart')) {
    const user = authUser(token);
    const { skuId, quantity } = body ?? {};
    const sku = db.skus.find((s) => s.id === skuId);
    if (!sku || !quantity || quantity < 1) throw new ApiError('잘못된 요청입니다.');
    if (sku.stock < quantity) throw new ApiError('재고가 부족합니다.');
    const exist = db.cart.find((c) => c.userId === user.id && c.skuId === skuId);
    if (exist) exist.quantity = Math.min(sku.stock, exist.quantity + quantity);
    else db.cart.push({ id: nextId('cart'), userId: user.id, skuId, quantity });
    return { ok: true };
  }
  if (M('PATCH', 'cart', null)) {
    const user = authUser(token);
    const item = db.cart.find((c) => c.id === id(p1) && c.userId === user.id);
    if (!item) throw new ApiError('장바구니 항목을 찾을 수 없습니다.', 404);
    const sku = db.skus.find((s) => s.id === item.skuId)!;
    const q = Number(body?.quantity ?? 1);
    if (q < 1) throw new ApiError('수량은 1 이상이어야 합니다.');
    if (q > sku.stock) throw new ApiError('재고가 부족합니다.');
    item.quantity = q;
    return { ok: true };
  }
  if (M('DELETE', 'cart', null)) {
    const user = authUser(token);
    db.cart = db.cart.filter((c) => !(c.id === id(p1) && c.userId === user.id));
    return { ok: true };
  }

  // ══ 위시리스트 ══
  if (M('GET', 'wishlist')) {
    const user = authUser(token);
    return db.wishlist.filter((w) => w.userId === user.id).map((w) => {
      const p = db.products.find((x) => x.id === w.productId)!;
      return { id: w.id, productId: p.id, name: p.name, salePrice: p.salePrice, thumbnailUrl: p.thumbnailUrl };
    });
  }
  if (M('POST', 'wishlist')) {
    const user = authUser(token);
    const pid = Number(body?.productId);
    if (!db.products.some((p) => p.id === pid)) throw new ApiError('상품을 찾을 수 없습니다.', 404);
    if (!db.wishlist.some((w) => w.userId === user.id && w.productId === pid))
      db.wishlist.push({ id: nextId('wishlist'), userId: user.id, productId: pid, createdAt: nowISO() });
    return { ok: true };
  }
  if (M('DELETE', 'wishlist', null)) {
    const user = authUser(token);
    db.wishlist = db.wishlist.filter((w) => !(w.userId === user.id && w.productId === id(p1)));
    return { ok: true };
  }

  // ══ 내 정보 ══
  if (M('GET', 'me')) return publicUser(authUser(token));
  if (M('GET', 'me', 'addresses')) return db.addresses.filter((a) => a.userId === authUser(token).id);
  if (M('POST', 'me', 'addresses')) {
    const user = authUser(token);
    const b = body ?? {};
    if (b.isDefault) db.addresses.forEach((a) => { if (a.userId === user.id) a.isDefault = 0; });
    const noDefault = !db.addresses.some((a) => a.userId === user.id && a.isDefault);
    db.addresses.push({ id: nextId('addresses'), userId: user.id, label: b.label ?? '', receiver: b.receiver ?? '', phone: b.phone ?? '', zipcode: b.zipcode ?? '', addr1: b.addr1 ?? '', addr2: b.addr2 ?? '', isDefault: b.isDefault || noDefault ? 1 : 0 });
    return { ok: true };
  }
  if (M('DELETE', 'me', 'addresses', null)) {
    const user = authUser(token);
    db.addresses = db.addresses.filter((a) => !(a.id === id(p2) && a.userId === user.id));
    return { ok: true };
  }
  if (M('GET', 'me', 'coupons')) return userCouponView(authUser(token).id, qs.get('status'));
  if (M('GET', 'me', 'points')) {
    const user = authUser(token);
    const ledger = db.pointLedger.filter((l) => l.userId === user.id).sort((a, b) => b.id - a.id);
    const soon = addDays(nowISO(), 30);
    return {
      balance: user.pointBalance,
      expiringSoon: ledger.filter((l) => l.amount > 0 && l.expiresAt && l.expiresAt < soon && new Date(l.expiresAt) > new Date()),
      ledger,
    };
  }
  if (M('GET', 'me', 'notifications')) return db.notifications.filter((n) => n.userId === authUser(token).id).sort((a, b) => b.id - a.id);
  if (M('PATCH', 'me', 'notifications', null, 'read')) {
    const user = authUser(token);
    const n = db.notifications.find((x) => x.id === id(p2) && x.userId === user.id);
    if (n) n.isRead = 1;
    return { ok: true };
  }

  // ══ 주문 ══
  if (M('POST', 'orders', 'quote')) {
    const user = authUser(token);
    const { _detail, ...quote } = calcQuote(user, body?.items ?? [], body?.userCouponId ?? null, body?.pointsUsed ?? 0);
    return quote;
  }
  if (M('POST', 'orders')) {
    const user = authUser(token);
    const { items, addressId, userCouponId, pointsUsed, simulateFail } = body ?? {};
    const addr = db.addresses.find((a) => a.id === addressId && a.userId === user.id);
    if (!addr) throw new ApiError('배송지를 선택하세요.');
    const q = calcQuote(user, items ?? [], userCouponId ?? null, pointsUsed ?? 0);
    for (const d of q._detail) if (d.sku.stock < d.quantity) throw new ApiError(`재고 부족: ${d.prod.name} (${d.sku.optionLabel})`);

    const orderId = nextId('orders');
    const created = nowISO();
    const order: DbOrder = {
      id: orderId, orderNo: makeOrderNo(orderId), userId: user.id,
      status: simulateFail ? 'PAYMENT_FAILED' : 'PAID',
      itemsTotal: q.itemsTotal, couponDiscount: q.couponDiscount, gradeDiscount: q.gradeDiscount,
      pointsUsed: q.pointsUsed, shippingFee: q.shippingFee, payAmount: q.payAmount,
      receiver: addr.receiver, phone: addr.phone, zipcode: addr.zipcode, addr1: addr.addr1, addr2: addr.addr2,
      createdAt: created, paidAt: simulateFail ? null : created, userCouponId: userCouponId ?? null,
    };
    db.orders.push(order);
    for (const d of q._detail) db.orderItems.push({ id: nextId('orderItems'), orderId, skuId: d.sku.id, productId: d.prod.id, productName: d.prod.name, optionLabel: d.sku.optionLabel, unitPrice: d.prod.salePrice + d.sku.extraPrice, quantity: d.quantity, status: 'NORMAL' });

    if (simulateFail) return { orderId, status: 'PAYMENT_FAILED' };

    for (const d of q._detail) d.sku.stock -= d.quantity;
    if (userCouponId) { const uc = db.userCoupons.find((x) => x.id === userCouponId); if (uc) uc.status = 'USED'; }
    if (q.pointsUsed > 0) {
      user.pointBalance -= q.pointsUsed;
      db.pointLedger.push({ id: nextId('pointLedger'), userId: user.id, amount: -q.pointsUsed, type: 'USE_ORDER', memo: '주문 사용', refOrderId: orderId, createdAt: created });
    }
    const orderedSkuIds = new Set((items ?? []).map((x: any) => x.skuId));
    db.cart = db.cart.filter((c) => !(c.userId === user.id && orderedSkuIds.has(c.skuId)));
    notify(user.id, 'ORDER', '결제 완료', `${order.orderNo} 주문이 결제되었습니다.`, `/my/orders/${orderId}`);
    return { orderId, status: 'PAID' };
  }
  if (M('GET', 'orders')) {
    const user = authUser(token);
    return db.orders.filter((o) => o.userId === user.id && o.status !== 'PAYMENT_FAILED')
      .sort((a, b) => b.id - a.id).map((o) => orderView(o));
  }
  if (M('GET', 'orders', null)) {
    const user = authUser(token);
    const o = db.orders.find((x) => x.id === id(p1) && x.userId === user.id);
    if (!o) throw new ApiError('주문을 찾을 수 없습니다.', 404);
    return orderView(o);
  }
  if (M('GET', 'orders', null, 'shipment')) {
    const user = authUser(token);
    const o = db.orders.find((x) => x.id === id(p1) && x.userId === user.id);
    const s = o ? db.shipments.find((x) => x.orderId === o.id) : undefined;
    if (!s) throw new ApiError('배송 정보가 없습니다.', 404);
    return { ...s, orderNo: o!.orderNo };
  }
  if (M('POST', 'orders', null, 'confirm')) {
    const user = authUser(token);
    const o = db.orders.find((x) => x.id === id(p1) && x.userId === user.id);
    if (!o) throw new ApiError('주문을 찾을 수 없습니다.', 404);
    if (o.status !== 'DELIVERED') throw new ApiError('배송 완료된 주문만 구매확정할 수 있습니다.');
    o.status = 'CONFIRMED';
    const earnedPoints = floor(o.payAmount * gradeRule(user.grade).pointRate);
    if (earnedPoints > 0) {
      user.pointBalance += earnedPoints;
      db.pointLedger.push({ id: nextId('pointLedger'), userId: user.id, amount: earnedPoints, type: 'EARN_ORDER', memo: '구매확정 적립', refOrderId: o.id, expiresAt: addDays(nowISO(), 90), createdAt: nowISO() });
    }
    user.totalSpent += o.payAmount;
    user.grade = gradeFromSpent(user.totalSpent);
    return { earnedPoints };
  }

  // ══ 클레임 ══
  if (M('GET', 'claims')) {
    const user = authUser(token);
    return db.claims.filter((c) => c.userId === user.id).sort((a, b) => b.id - a.id)
      .map((c) => ({ ...c, orderNo: db.orders.find((o) => o.id === c.orderId)?.orderNo ?? '' }));
  }
  if (M('POST', 'claims')) {
    const user = authUser(token);
    const { orderId, orderItemId, type, reason, detail } = body ?? {};
    const o = db.orders.find((x) => x.id === orderId && x.userId === user.id);
    const oi = db.orderItems.find((x) => x.id === orderItemId && x.orderId === orderId);
    if (!o || !oi) throw new ApiError('주문을 찾을 수 없습니다.', 404);
    if (db.claims.some((c) => c.orderItemId === orderItemId && !['REJECTED'].includes(c.status))) throw new ApiError('이미 접수된 항목입니다.');
    if (type === 'CANCEL') {
      if (!['PAID', 'PREPARING'].includes(o.status)) throw new ApiError('취소할 수 없는 상태입니다.');
      // 주문 전체 취소 + 즉시 환불 (데모 단순화: 전체 취소)
      o.status = 'CANCELED';
      restoreStock(o.id);
      if (o.pointsUsed > 0) {
        user.pointBalance += o.pointsUsed;
        db.pointLedger.push({ id: nextId('pointLedger'), userId: user.id, amount: o.pointsUsed, type: 'REFUND', memo: '주문취소 포인트 환급', refOrderId: o.id, createdAt: nowISO() });
      }
      if (o.userCouponId) { const uc = db.userCoupons.find((x) => x.id === o.userCouponId); if (uc) uc.status = 'UNUSED'; }
      db.claims.push({ id: nextId('claims'), orderId: o.id, orderItemId, userId: user.id, type, status: 'REFUNDED', reason, detail, refundAmount: o.payAmount - o.pointsUsed, refundPoints: o.pointsUsed, inspectionResult: null, createdAt: nowISO(), resolvedAt: nowISO() });
      notify(user.id, 'CLAIM', '주문 취소 완료', `${o.orderNo} 주문이 취소되고 환불되었습니다.`, '/my/claims');
    } else {
      if (!['DELIVERED', 'CONFIRMED'].includes(o.status)) throw new ApiError('배송 완료 후 신청할 수 있습니다.');
      db.claims.push({ id: nextId('claims'), orderId: o.id, orderItemId, userId: user.id, type, status: 'REQUESTED', reason, detail, refundAmount: null, refundPoints: null, inspectionResult: null, createdAt: nowISO(), resolvedAt: null });
      notify(user.id, 'CLAIM', `${type === 'RETURN' ? '반품' : '교환'} 접수`, `${o.orderNo} ${type === 'RETURN' ? '반품' : '교환'} 신청이 접수되었습니다.`, '/my/claims');
    }
    return { ok: true };
  }

  // ══ 리뷰 / Q&A ══
  if (M('POST', 'reviews')) {
    const user = authUser(token);
    const { orderItemId, rating, content } = body ?? {};
    const oi = db.orderItems.find((x) => x.id === orderItemId);
    if (!oi) throw new ApiError('주문 항목을 찾을 수 없습니다.', 404);
    if (db.reviews.some((r) => r.orderItemId === orderItemId)) throw new ApiError('이미 리뷰를 작성했습니다.');
    if (!content || content.length < 5) throw new ApiError('리뷰는 5자 이상 입력하세요.');
    db.reviews.push({ id: nextId('reviews'), userId: user.id, orderItemId, productId: oi.productId, rating: Math.min(5, Math.max(1, Number(rating))), content, adminReply: null, isVisible: 1, createdAt: nowISO() });
    return { ok: true };
  }
  if (M('POST', 'qnas')) {
    const user = authUser(token);
    const { productId, question } = body ?? {};
    if (!question) throw new ApiError('문의 내용을 입력하세요.');
    db.qnas.push({ id: nextId('qnas'), userId: user.id, productId: Number(productId), question, answer: null, answeredAt: null, isSecret: 0, createdAt: nowISO() });
    return { ok: true };
  }

  // ══ 관리자 ══
  if (p0 === 'admin') {
    authAdmin(token);

    if (M('GET', 'admin', 'dashboard')) {
      const today = new Date().toISOString().slice(0, 10);
      const paid = db.orders.filter((o) => o.paidAt && o.status !== 'CANCELED' && o.status !== 'PAYMENT_FAILED');
      const todayOrders = paid.filter((o) => (o.paidAt ?? '').slice(0, 10) === today);
      const all = db.orders.filter((o) => o.status !== 'PAYMENT_FAILED');
      const canceled = all.filter((o) => o.status === 'CANCELED');
      const chart: { date: string; sales: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const ds = d.toISOString().slice(0, 10);
        chart.push({ date: ds, sales: paid.filter((o) => (o.paidAt ?? '').slice(0, 10) === ds).reduce((s, o) => s + o.payAmount, 0) });
      }
      const lowStock = db.skus.filter((s) => s.isActive && s.stock <= 5)
        .map((s) => ({ skuId: s.id, productName: db.products.find((p) => p.id === s.productId)?.name ?? '', optionLabel: s.optionLabel, stock: s.stock }))
        .sort((a, b) => a.stock - b.stock);
      return {
        todaySales: todayOrders.reduce((s, o) => s + o.payAmount, 0),
        todayOrderCount: todayOrders.length,
        cancelRate: all.length ? Math.round((canceled.length / all.length) * 1000) / 10 : 0,
        totalSales: paid.reduce((s, o) => s + o.payAmount, 0),
        chart, lowStock,
      };
    }

    if (M('GET', 'admin', 'products')) {
      return db.products.map((p) => ({
        ...p, categoryName: db.categories.find((c) => c.id === p.categoryId)?.name ?? '', totalStock: productStock(p.id),
      })).sort((a, b) => b.id - a.id);
    }
    if (M('GET', 'admin', 'products', null)) {
      const p = db.products.find((x) => x.id === id(p2));
      if (!p) throw new ApiError('상품을 찾을 수 없습니다.', 404);
      return { ...p, options: db.options.filter((o) => o.productId === p.id), skus: db.skus.filter((s) => s.productId === p.id) };
    }
    if (M('POST', 'admin', 'products')) {
      const b = body ?? {};
      if (!b.name || !b.categoryId) throw new ApiError('상품명과 카테고리를 입력하세요.');
      const pid = nextId('products');
      const detailImages = (() => {
        const list = String(b.detailImages ?? '').split(/[\n,]/).map((s: string) => s.trim()).filter(Boolean);
        return JSON.stringify(list.length ? list : [1, 2, 3].map((k) => `https://picsum.photos/seed/mall-d${pid}-${k}/800/1000`));
      })();
      db.products.push({ id: pid, categoryId: Number(b.categoryId), name: b.name, description: b.description ?? '', basePrice: Number(b.basePrice) || 0, salePrice: Number(b.salePrice) || 0, thumbnailUrl: b.thumbnailUrl || `https://picsum.photos/seed/mall${pid}/400/400`, detailImages, status: b.status ?? 'ON_SALE', createdAt: nowISO() });
      const optDefs: { name: string; values: string[] }[] = b.options ?? [];
      if (optDefs.length) {
        const groups = optDefs.map((o) => {
          const optId = nextId('options');
          const values = o.values.map((v) => ({ id: nextId('optionValues'), value: v }));
          db.options.push({ id: optId, productId: pid, name: o.name, values });
          return values;
        });
        let combos: { ids: number[]; label: string }[] = [{ ids: [], label: '' }];
        for (const g of groups) combos = combos.flatMap((c) => g.map((v) => ({ ids: [...c.ids, v.id], label: c.label ? `${c.label} / ${v.value}` : v.value })));
        combos.forEach((c) => db.skus.push({ id: nextId('skus'), productId: pid, optionValueIds: JSON.stringify(c.ids), optionLabel: c.label, extraPrice: 0, stock: 20, isActive: 1 }));
      } else {
        db.skus.push({ id: nextId('skus'), productId: pid, optionValueIds: '[]', optionLabel: '기본', extraPrice: 0, stock: 20, isActive: 1 });
      }
      return { id: pid };
    }
    if (M('PATCH', 'admin', 'products', null)) {
      const p = db.products.find((x) => x.id === id(p2));
      if (!p) throw new ApiError('상품을 찾을 수 없습니다.', 404);
      const b = body ?? {};
      if (b.detailImages !== undefined && typeof b.detailImages === 'string' && !b.detailImages.trim().startsWith('[')) {
        const list = b.detailImages.split(/[\n,]/).map((s: string) => s.trim()).filter(Boolean);
        b.detailImages = JSON.stringify(list);
      }
      for (const k of ['name', 'categoryId', 'description', 'basePrice', 'salePrice', 'thumbnailUrl', 'status', 'detailImages'] as const) {
        if (b[k] !== undefined) (p as any)[k] = b[k];
      }
      return { ok: true };
    }
    if (M('DELETE', 'admin', 'products', null)) {
      const pid = id(p2);
      const p = db.products.find((x) => x.id === pid);
      if (p) p.status = 'HIDDEN'; // 주문 이력 보존을 위해 소프트 삭제
      return { ok: true };
    }
    if (M('PATCH', 'admin', 'skus', null)) {
      const s = db.skus.find((x) => x.id === id(p2));
      if (!s) throw new ApiError('SKU를 찾을 수 없습니다.', 404);
      if (body?.stock !== undefined) s.stock = Math.max(0, Number(body.stock));
      if (body?.extraPrice !== undefined) s.extraPrice = Number(body.extraPrice);
      return { ok: true };
    }

    if (M('GET', 'admin', 'categories')) return categoryTree();
    if (M('POST', 'admin', 'categories')) {
      const { name, parentId } = body ?? {};
      if (!name) throw new ApiError('카테고리명을 입력하세요.');
      const parent = parentId ? db.categories.find((c) => c.id === parentId) : null;
      const depth = parent ? parent.depth + 1 : 1;
      if (depth > 3) throw new ApiError('카테고리는 3단계까지만 지원합니다.');
      db.categories.push({ id: nextId('categories'), name, parentId: parent?.id ?? null, depth, sortOrder: db.categories.length + 1 });
      return { ok: true };
    }
    if (M('DELETE', 'admin', 'categories', null)) {
      const cid = id(p2);
      const ids = subtreeCategoryIds(cid);
      if (db.products.some((p) => ids.includes(p.categoryId) && p.status !== 'HIDDEN')) throw new ApiError('상품이 있는 카테고리는 삭제할 수 없습니다.');
      db.categories = db.categories.filter((c) => !ids.includes(c.id));
      return { ok: true };
    }

    if (M('GET', 'admin', 'orders')) {
      const status = qs.get('status');
      return db.orders.filter((o) => o.status !== 'PAYMENT_FAILED' && (!status || o.status === status))
        .sort((a, b) => b.id - a.id).map((o) => orderView(o, true));
    }
    if (M('PATCH', 'admin', 'orders', null, 'status')) {
      const o = db.orders.find((x) => x.id === id(p2));
      if (!o) throw new ApiError('주문을 찾을 수 없습니다.', 404);
      const NEXT: Record<string, string[]> = {
        PAID: ['PREPARING', 'CANCELED'], PREPARING: ['SHIPPED', 'CANCELED'],
        SHIPPED: ['DELIVERING'], DELIVERING: ['DELIVERED'], DELIVERED: ['CONFIRMED'],
      };
      const to = body?.status;
      if (!(NEXT[o.status] ?? []).includes(to)) throw new ApiError(`${o.status} → ${to} 전이는 허용되지 않습니다.`);
      o.status = to;
      if (to === 'CANCELED') { restoreStock(o.id); notify(o.userId, 'ORDER', '주문 취소', `${o.orderNo} 주문이 취소되었습니다.`, `/my/orders/${o.id}`); }
      if (to === 'PREPARING' && !db.shipments.some((s) => s.orderId === o.id)) {
        db.shipments.push({ id: nextId('shipments'), orderId: o.id, carrier: 'VIRTUAL', trackingNo: trackingNo(o.id), status: 'READY', events: [{ status: 'READY', location: SHIP_LOC.READY, at: nowISO() }] });
      }
      if (to === 'SHIPPED' || to === 'DELIVERING' || to === 'DELIVERED') {
        const s = db.shipments.find((x) => x.orderId === o.id);
        if (s) {
          const target = to === 'SHIPPED' ? 'PICKED_UP' : to === 'DELIVERING' ? 'OUT_FOR_DELIVERY' : 'DELIVERED';
          let idx = SHIP_SEQ.indexOf(s.status);
          const targetIdx = SHIP_SEQ.indexOf(target);
          while (idx < targetIdx) { idx++; s.status = SHIP_SEQ[idx]; s.events.push({ status: s.status, location: SHIP_LOC[s.status], at: nowISO() }); }
        }
      }
      if (to === 'CONFIRMED') {
        const user = db.users.find((u) => u.id === o.userId);
        if (user) { user.totalSpent += o.payAmount; user.grade = gradeFromSpent(user.totalSpent); }
      }
      return { ok: true };
    }

    if (M('GET', 'admin', 'shipments')) {
      maybeAutoRunShipments();
      return db.shipments.map((s) => {
        const o = db.orders.find((x) => x.id === s.orderId);
        return { ...s, orderNo: o?.orderNo ?? '', orderStatus: o?.status ?? '', receiver: o?.receiver ?? '' };
      }).sort((a, b) => b.id - a.id);
    }
    if (M('POST', 'admin', 'shipments', 'auto-run')) {
      db.shipAutoRun = !!body?.on;
      db.shipAutoLastTick = 0;
      return { ok: true };
    }
    if (M('POST', 'admin', 'shipments', null, 'dispatch')) {
      const s = db.shipments.find((x) => x.orderId === id(p2));
      if (!s) throw new ApiError('배송 정보를 찾을 수 없습니다.', 404);
      advanceShipment(s.id);
      return { ok: true };
    }
    if (M('POST', 'admin', 'shipments', null, 'advance')) { advanceShipment(id(p2)); return { ok: true }; }

    if (M('GET', 'admin', 'coupons')) return [...db.coupons].sort((a, b) => b.id - a.id);
    if (M('POST', 'admin', 'coupons')) {
      const b = body ?? {};
      if (!b.name) throw new ApiError('쿠폰명을 입력하세요.');
      db.coupons.push({
        id: nextId('coupons'), name: b.name, discountType: b.discountType ?? 'FIXED', discountValue: Number(b.discountValue) || 0,
        maxDiscount: b.maxDiscount != null ? Number(b.maxDiscount) : null, minOrderAmount: Number(b.minOrderAmount) || 0,
        issueType: b.issueType ?? 'DOWNLOAD', validDays: Number(b.validDays) || 14,
        totalQuantity: b.totalQuantity != null ? Number(b.totalQuantity) : null, issuedCount: 0,
        scope: b.scope ?? 'ALL', scopeCategoryId: b.scopeCategoryId ?? null, scopeProductId: b.scopeProductId ?? null, isActive: 1,
      });
      return { ok: true };
    }
    if (M('GET', 'admin', 'coupons', null, 'stats')) {
      const c = db.coupons.find((x) => x.id === id(p2));
      if (!c) throw new ApiError('쿠폰을 찾을 수 없습니다.', 404);
      const ucs = db.userCoupons.filter((x) => x.couponId === c.id);
      const used = ucs.filter((x) => x.status === 'USED').length;
      return { issuedCount: ucs.length, usedCount: used, usageRate: ucs.length ? Math.round((used / ucs.length) * 1000) / 10 : 0 };
    }

    if (M('GET', 'admin', 'claims')) {
      return db.claims.sort((a, b) => b.id - a.id).map((c) => {
        const o = db.orders.find((x) => x.id === c.orderId);
        const oi = db.orderItems.find((x) => x.id === c.orderItemId);
        return {
          ...c, orderNo: o?.orderNo ?? '', userName: db.users.find((u) => u.id === c.userId)?.name ?? '',
          item: oi ? { productName: oi.productName, optionLabel: oi.optionLabel, quantity: oi.quantity } : null,
        };
      });
    }
    if (M('PATCH', 'admin', 'claims', null)) {
      const c = db.claims.find((x) => x.id === id(p2));
      if (!c) throw new ApiError('클레임을 찾을 수 없습니다.', 404);
      const action = body?.action;
      const flow: Record<string, { from: string[]; to: string }> = {
        APPROVE: { from: ['REQUESTED'], to: 'APPROVED' },
        REJECT: { from: ['REQUESTED'], to: 'REJECTED' },
        COLLECT: { from: ['APPROVED'], to: 'COLLECTING' },
        INSPECT: { from: ['COLLECTING'], to: 'INSPECTING' },
        RESHIP: { from: ['RESHIPPING'], to: 'COMPLETED' },
      };
      if (action === 'RESTOCK' || action === 'DISPOSE') {
        if (c.status !== 'INSPECTING') throw new ApiError('검수중 상태에서만 처리할 수 있습니다.');
        c.inspectionResult = action;
        const oi = db.orderItems.find((x) => x.id === c.orderItemId);
        if (action === 'RESTOCK' && oi) { const sku = db.skus.find((s) => s.id === oi.skuId); if (sku) sku.stock += oi.quantity; }
        if (c.type === 'RETURN') {
          const o = db.orders.find((x) => x.id === c.orderId)!;
          const itemTotal = oi ? oi.unitPrice * oi.quantity : 0;
          const items = db.orderItems.filter((x) => x.orderId === o.id);
          const isLast = items.length === 1;
          const ratio = o.itemsTotal ? itemTotal / o.itemsTotal : 1;
          c.refundAmount = isLast ? o.payAmount : floor(o.payAmount * ratio);
          c.refundPoints = isLast ? o.pointsUsed : floor(o.pointsUsed * ratio);
          c.status = 'REFUNDED';
          const user = db.users.find((u) => u.id === c.userId);
          if (user && c.refundPoints > 0) {
            user.pointBalance += c.refundPoints;
            db.pointLedger.push({ id: nextId('pointLedger'), userId: user.id, amount: c.refundPoints, type: 'REFUND', memo: '반품 포인트 환급', refOrderId: o.id, createdAt: nowISO() });
          }
          notify(c.userId, 'CLAIM', '환불 완료', `${o.orderNo} 반품 환불이 완료되었습니다.`, '/my/claims');
        } else {
          c.status = 'RESHIPPING';
        }
        c.resolvedAt = nowISO();
        return { ok: true };
      }
      const f = flow[action];
      if (!f) throw new ApiError('알 수 없는 처리입니다.');
      if (!f.from.includes(c.status)) throw new ApiError(`${c.status} 상태에서는 처리할 수 없습니다.`);
      c.status = f.to;
      if (f.to === 'COMPLETED' || f.to === 'REJECTED') c.resolvedAt = nowISO();
      return { ok: true };
    }

    if (M('GET', 'admin', 'users')) return db.users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, grade: u.grade, totalSpent: u.totalSpent, pointBalance: u.pointBalance }));
    if (M('PATCH', 'admin', 'users', null, 'grade')) {
      const u = db.users.find((x) => x.id === id(p2));
      if (!u) throw new ApiError('회원을 찾을 수 없습니다.', 404);
      u.grade = body?.grade ?? u.grade;
      return { ok: true };
    }
    if (M('POST', 'admin', 'users', null, 'points')) {
      const u = db.users.find((x) => x.id === id(p2));
      if (!u) throw new ApiError('회원을 찾을 수 없습니다.', 404);
      const amount = Number(body?.amount) || 0;
      if (u.pointBalance + amount < 0) throw new ApiError('차감할 포인트가 잔액보다 큽니다.');
      u.pointBalance += amount;
      db.pointLedger.push({ id: nextId('pointLedger'), userId: u.id, amount, type: 'ADMIN', memo: body?.memo || '관리자 조정', expiresAt: amount > 0 ? addDays(nowISO(), 90) : null, createdAt: nowISO() });
      notify(u.id, 'COUPON', '포인트 지급/차감', `${amount > 0 ? '+' : ''}${amount}P 조정되었습니다.`, '/my/points');
      return { ok: true };
    }

    if (M('GET', 'admin', 'reviews')) {
      return [...db.reviews].sort((a, b) => b.id - a.id).map((r) => ({
        ...r, userName: db.users.find((u) => u.id === r.userId)?.name ?? '',
        productName: db.products.find((p) => p.id === r.productId)?.name ?? '',
      }));
    }
    if (M('PATCH', 'admin', 'reviews', null)) {
      const r = db.reviews.find((x) => x.id === id(p2));
      if (!r) throw new ApiError('리뷰를 찾을 수 없습니다.', 404);
      if (body?.isVisible !== undefined) r.isVisible = Number(body.isVisible);
      if (body?.adminReply !== undefined) r.adminReply = body.adminReply;
      return { ok: true };
    }

    if (M('GET', 'admin', 'qnas')) {
      const answered = qs.get('answered');
      return db.qnas.filter((q) => answered !== 'false' || !q.answer).sort((a, b) => b.id - a.id).map((q) => ({
        ...q, userName: db.users.find((u) => u.id === q.userId)?.name ?? '',
        productName: db.products.find((p) => p.id === q.productId)?.name ?? '',
      }));
    }
    if (M('PATCH', 'admin', 'qnas', null)) {
      const q = db.qnas.find((x) => x.id === id(p2));
      if (!q) throw new ApiError('문의를 찾을 수 없습니다.', 404);
      q.answer = body?.answer ?? q.answer;
      q.answeredAt = nowISO();
      notify(q.userId, 'QNA', '문의 답변 등록', '상품 문의에 답변이 등록되었습니다.', `/products/${q.productId}`);
      return { ok: true };
    }
  }

  throw new ApiError(`알 수 없는 API: ${method} /${parts.join('/')}`, 404);
}

// 네트워크 흉내 (스피너 UX 유지용 최소 지연)
const delay = () => new Promise((r) => setTimeout(r, 80 + Math.random() * 120));

export async function mockRequest<T>(method: string, path: string, body?: unknown, token?: string | null): Promise<T> {
  await delay();
  const url = new URL(path, 'http://mock.local');
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    const result = route(method.toUpperCase(), parts, url.searchParams, body, token);
    if (method.toUpperCase() !== 'GET') saveDb();
    return JSON.parse(JSON.stringify(result)) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw e;
  }
}
