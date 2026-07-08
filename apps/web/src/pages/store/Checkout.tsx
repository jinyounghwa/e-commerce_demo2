import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, CartItem, Quote, UserCoupon } from '../../api';
import { useAuth } from '../../stores/auth';
import { Spinner, Empty, ErrorMsg } from '../../components/ui';
import { won, GRADE_LABEL } from '../../lib/format';

export default function Checkout() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: cart } = useQuery({ queryKey: ['cart'], queryFn: () => api('/cart').get<CartItem[]>() });
  const { data: addrs } = useQuery({ queryKey: ['addresses'], queryFn: () => api('/me/addresses').get<any[]>() });
  const { data: coupons } = useQuery({ queryKey: ['myCoupons', 'UNUSED'], queryFn: () => api('/me/coupons').get<UserCoupon[]>('/?status=UNUSED') });

  const [addrId, setAddrId] = useState<number | null>(null);
  const [couponId, setCouponId] = useState<number | null>(null);
  const [points, setPoints] = useState(0);
  const [method, setMethod] = useState<'MOCK_CARD' | 'MOCK_BANK'>('MOCK_CARD');
  const [fail, setFail] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (addrs?.length && !addrId) setAddrId(addrs.find((a) => a.isDefault)?.id ?? addrs[0].id); }, [addrs]);

  const items = useMemo(() => (cart ?? []).filter((i) => !i.isSoldOut), [cart]);
  const quoteBody = useMemo(() => ({
    items: items.map((i) => ({ skuId: i.skuId, quantity: i.quantity })),
    userCouponId: couponId, pointsUsed: Math.floor(points / 100) * 100,
  }), [items, couponId, points]);

  const { data: quote, isLoading: qLoading } = useQuery({
    queryKey: ['quote', quoteBody],
    queryFn: () => api('/orders/quote').post<Quote>(quoteBody),
    enabled: items.length > 0,
  });

  const orderMut = useMutation({
    mutationFn: (b: any) => api('/orders').post<any>(b),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ['cart'] }); qc.invalidateQueries({ queryKey: ['orders'] }); nav(`/orders/${d.orderId}/complete`, { state: d }); },
    onError: (e: any) => setErr(e.message),
  });

  if (!cart) return <Spinner />;
  if (!items.length) return <Empty text="주문할 상품이 없습니다." />;

  const submit = () => {
    setErr('');
    if (!addrId) { setErr('배송지를 선택하세요.'); return; }
    orderMut.mutate({ items: items.map((i) => ({ skuId: i.skuId, quantity: i.quantity })), addressId: addrId, userCouponId: couponId, pointsUsed: Math.floor(points / 100) * 100, paymentMethod: method, simulateFail: fail });
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <h1 className="text-xl font-bold">주문서</h1>
        {/* 배송지 */}
        <div className="card p-4">
          <h2 className="font-medium mb-2">배송지</h2>
          {addrs?.map((a) => (
            <label key={a.id} className="flex items-start gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
              <input type="radio" checked={addrId === a.id} onChange={() => setAddrId(a.id)} />
              <div className="text-sm">
                <span className="font-medium">{a.label}</span> {a.isDefault ? '<기본>' : ''} · {a.receiver} · {a.phone}
                <div className="text-gray-500">({a.zipcode}) {a.addr1} {a.addr2}</div>
              </div>
            </label>
          ))}
        </div>
        {/* 주문 상품 */}
        <div className="card p-4">
          <h2 className="font-medium mb-2">주문 상품</h2>
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 py-2 border-b last:border-0">
              <img src={i.thumbnailUrl} className="w-12 h-12 object-cover rounded" alt="" />
              <div className="flex-1 text-sm"><div className="font-medium">{i.productName}</div><div className="text-gray-500">{i.optionLabel} × {i.quantity}</div></div>
              <div className="font-medium">{won(i.unitPrice * i.quantity)}</div>
            </div>
          ))}
        </div>
        {/* 할인 */}
        <div className="card p-4 space-y-3">
          <h2 className="font-medium">할인 적용</h2>
          <div>
            <label className="text-sm text-gray-600">쿠폰 (주문당 1장)</label>
            <select className="input mt-1" value={couponId ?? ''} onChange={(e) => setCouponId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">쿠폰 미사용</option>
              {coupons?.filter((c) => {
                // 상품 전용 쿠폰은 해당 상품이 장바구니에 있을 때만 노출
                if (c.scope === 'PRODUCT' && c.scopeProductId) return items.some((i) => i.productId === c.scopeProductId);
                return true;
              }).map((c) => {
                const tag = c.scope === 'PRODUCT' ? '[상품전용] ' : c.scope === 'CATEGORY' ? '[카테고리] ' : '';
                return <option key={c.id} value={c.id}>{tag}{c.name} {c.discountType === 'FIXED' ? `${c.discountValue}원` : `${c.discountValue}%`}{c.minOrderAmount ? ` (최소 ${won(c.minOrderAmount)})` : ''}</option>;
              })}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-600">포인트 (100P 단위, 보유 {won(user?.pointBalance ?? 0)}P)</label>
            <input type="number" className="input mt-1" value={points} min={0} max={user?.pointBalance ?? 0} step={100} onChange={(e) => setPoints(Math.max(0, Number(e.target.value)))} />
            <div className="flex gap-2 mt-1">
              <button className="btn-outline btn-sm" onClick={() => setPoints(1000)}>1,000P</button>
              <button className="btn-outline btn-sm" onClick={() => setPoints(Math.floor((user?.pointBalance ?? 0) / 100) * 100)}>전액</button>
              <button className="btn-outline btn-sm" onClick={() => setPoints(0)}>초기화</button>
            </div>
          </div>
          <div className="text-xs text-gray-400">등급: {GRADE_LABEL[user?.grade ?? 'BRONZE']} ({user?.grade === 'VIP' ? '3%' : user?.grade === 'GOLD' ? '2%' : user?.grade === 'SILVER' ? '1%' : '0%'} 할인 자동적용)</div>
        </div>
      </div>

      {/* 결제 요약 */}
      <div>
        <div className="card p-4 sticky top-20">
          <h2 className="font-bold mb-3">결제 금액</h2>
          {qLoading || !quote ? <Spinner /> : (
            <div className="space-y-2 text-sm">
              <Row l="상품금액" v={won(quote.itemsTotal)} />
              {quote.gradeDiscount > 0 && <Row l="등급할인" v={`-${won(quote.gradeDiscount)}`} green />}
              {quote.couponDiscount > 0 && <Row l="쿠폰할인" v={`-${won(quote.couponDiscount)}`} green />}
              {quote.pointsUsed > 0 && <Row l="포인트" v={`-${won(quote.pointsUsed)}`} green />}
              <Row l="배송비" v={quote.shippingFee === 0 ? '무료' : won(quote.shippingFee)} />
              <div className="border-t pt-2 mt-2">
                <Row l="결제금액" v={won(quote.payAmount)} bold />
              </div>
              {quote.shippingFee > 0 && <div className="text-xs text-amber-600">{won(50000 - (quote.discountedTotal - quote.pointsUsed))} 더 구매 시 무료배송</div>}
            </div>
          )}
          <div className="mt-4 space-y-2">
            <div>
              <label className="text-sm">결제수단</label>
              <select className="input mt-1" value={method} onChange={(e) => setMethod(e.target.value as any)}>
                <option value="MOCK_CARD">가상 신용카드</option>
                <option value="MOCK_BANK">가상 계좌이체</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-500">
              <input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} /> 결제 실패 시뮬레이션
            </label>
          </div>
          <ErrorMsg msg={err} />
          <button className="btn-primary w-full mt-3" onClick={submit} disabled={orderMut.isPending}>{won(quote?.payAmount ?? 0)} 결제하기</button>
        </div>
      </div>
    </div>
  );
}

const Row = ({ l, v, bold, green }: { l: string; v: string; bold?: boolean; green?: boolean }) => (
  <div className={`flex justify-between ${bold ? 'text-lg font-bold text-brand-600' : ''} ${green ? 'text-green-600' : ''}`}>
    <span>{l}</span><span>{v}</span>
  </div>
);
