import { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import type { ProductDetail } from '../../api';
import { useAuth } from '../../stores/auth';
import { Spinner, Empty, Stars, ErrorMsg } from '../../components/ui';
import { won, date } from '../../lib/format';

export default function ProductDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Record<number, number>>({}); // optionId -> valueId
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'reviews' | 'qna'>('reviews');

  const { data: p, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api(`/products/${id}`).get<ProductDetail>(),
    enabled: !!id,
  });
  const { data: reviews } = useQuery({ queryKey: ['reviews', id], queryFn: () => api(`/products/${id}/reviews`).get<any[]>(), enabled: !!id });
  const { data: qnas } = useQuery({ queryKey: ['qnas', id], queryFn: () => api(`/products/${id}/qnas`).get<any[]>(), enabled: !!id });
  const { data: prodCoupons } = useQuery({ queryKey: ['product-coupons', id], queryFn: () => api(`/products/${id}/coupons`).get<any[]>(), enabled: !!id });
  const { data: myCoupons } = useQuery({ queryKey: ['myCoupons', 'UNUSED'], queryFn: () => api('/me/coupons').get<any[]>('/?status=UNUSED'), enabled: !!user });
  const dlCouponMut = useMutation({ mutationFn: (cid: number) => api(`/coupons/${cid}/download`).post({}), onSuccess: () => { qc.invalidateQueries({ queryKey: ['myCoupons'] }); alert('쿠폰이 발급되었습니다.'); } });

  const selectedSku = useMemo(() => {
    if (!p) return null;
    if (!p.options.length) return p.skus[0] ?? null;
    const selectedIds = Object.values(selected);
    if (selectedIds.length < p.options.length) return null;
    const set = new Set(selectedIds);
    return p.skus.find((s) => { const ids = JSON.parse(s.optionValueIds) as number[]; return ids.length === set.size && ids.every((x) => set.has(x)); }) ?? null;
  }, [p, selected]);

  const addCartMut = useMutation({ mutationFn: (b: { skuId: number; quantity: number }) => api('/cart').post(b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['cart'] }); setErr(''); alert('장바구니에 담았습니다.'); } });
  const wishMut = useMutation({ mutationFn: () => api('/wishlist').post({ productId: Number(id) }), onSuccess: () => alert('찜했습니다.') });

  if (isLoading) return <Spinner />;
  if (!p) return <Empty text="상품을 찾을 수 없습니다." />;
  const discount = p.basePrice > p.salePrice ? Math.round((1 - p.salePrice / p.basePrice) * 100) : 0;

  const addToCart = () => {
    if (!user) { nav('/login'); return; }
    if (!selectedSku) { setErr('옵션을 선택하세요.'); return; }
    if (selectedSku.stock <= 0) { setErr('품절된 옵션입니다.'); return; }
    addCartMut.mutate({ skuId: selectedSku.id, quantity: qty });
  };

  const buyNow = async () => {
    if (!user) { nav('/login'); return; }
    if (!selectedSku || selectedSku.stock <= 0) { setErr('옵션을 선택하세요.'); return; }
    await addCartMut.mutateAsync({ skuId: selectedSku.id, quantity: qty });
    nav('/checkout');
  };

  const unitPrice = selectedSku ? p.salePrice + selectedSku.extraPrice : p.salePrice;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
          <img src={p.thumbnailUrl} alt={p.name} className="w-full h-full object-cover" />
        </div>
        <div>
          <div className="text-sm text-gray-400">{p.category?.name}</div>
          <h1 className="text-2xl font-bold mt-1">{p.name}</h1>
          <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
            <Stars rating={p.reviewAvg} /> <span>{p.reviewAvg.toFixed(1)} ({p.reviewCount}개 리뷰)</span>
            <span>· 재고 {p.totalStock}개</span>
          </div>
          <div className="mt-4">
            {discount > 0 && <span className="text-gray-400 line-through mr-2">{won(p.basePrice)}</span>}
            <span className="text-3xl font-bold text-brand-600">{won(unitPrice)}</span>
            {discount > 0 && <span className="ml-2 text-red-500 font-medium">{discount}%</span>}
          </div>
          <p className="mt-4 text-sm text-gray-600 whitespace-pre-line">{p.description}</p>

          {/* 옵션 선택 */}
          <div className="mt-6 space-y-3">
            {p.options.map((opt) => (
              <div key={opt.id}>
                <label className="text-sm font-medium">{opt.name}</label>
                <select className="input mt-1" value={selected[opt.id] ?? ''} onChange={(e) => setSelected({ ...selected, [opt.id]: Number(e.target.value) })}>
                  <option value="">선택하세요</option>
                  {opt.values.map((v: any) => {
                    const vSku = p.skus.find((s) => (JSON.parse(s.optionValueIds) as number[]).includes(v.id));
                    return <option key={v.id} value={v.id} disabled={(vSku?.stock ?? 0) <= 0}>{v.value}{(vSku?.stock ?? 0) <= 0 ? ' (품절)' : ''}</option>;
                  })}
                </select>
              </div>
            ))}
            {selectedSku && (
              <div className="flex items-center gap-3 bg-gray-50 p-3 rounded">
                <span className="text-sm">{selectedSku.optionLabel}</span>
                <span className={`text-xs ${selectedSku.stock <= 0 ? 'text-red-500' : 'text-green-600'}`}>{selectedSku.stock <= 0 ? '품절' : `재고 ${selectedSku.stock}개`}</span>
                <div className="ml-auto flex items-center gap-2">
                  <button className="btn-outline btn-sm" onClick={() => setQty(Math.max(1, qty - 1))}>-</button>
                  <span className="w-8 text-center">{qty}</span>
                  <button className="btn-outline btn-sm" onClick={() => setQty(qty + 1)}>+</button>
                </div>
              </div>
            )}
          </div>

          <ErrorMsg msg={err} />
          <div className="mt-4 flex gap-2">
            <button className="btn-primary flex-1" onClick={addToCart} disabled={addCartMut.isPending}>장바구니</button>
            <button className="btn-primary flex-1" onClick={buyNow}>바로구매</button>
            <button className="btn-outline" onClick={() => { if (!user) { nav('/login'); return; } wishMut.mutate(); }}>♡</button>
          </div>

          {/* 상품 적용 가능 쿠폰 */}
          {prodCoupons && prodCoupons.length > 0 && (
            <div className="mt-4 border rounded-lg p-3 bg-amber-50/60">
              <div className="text-sm font-medium mb-2">🎟️ 이 상품에 적용 가능한 쿠폰</div>
              <div className="space-y-2">
                {prodCoupons.map((c) => {
                  const issued = myCoupons?.some((m) => m.couponId === c.id);
                  const soldOut = c.remaining != null && c.remaining === 0;
                  const label = c.scope === 'PRODUCT' ? '상품전용' : c.scope === 'CATEGORY' ? '카테고리' : '전체';
                  return (
                    <div key={c.id} className="flex items-center justify-between bg-white rounded p-2 border">
                      <div className="min-w-0">
                        <span className="font-bold text-brand-600">{c.discountType === 'FIXED' ? won(c.discountValue) : `${c.discountValue}%`}{c.maxDiscount ? ` (최대 ${won(c.maxDiscount)})` : ''}</span>
                        <span className="ml-2 text-xs text-gray-600 truncate">{c.name}</span>
                        <span className="ml-1 badge bg-gray-100 text-gray-500 text-xs">{label}</span>
                      </div>
                      {user ? (
                        <button className={`btn-sm shrink-0 ${issued || soldOut ? 'btn-outline' : 'btn-primary'}`} disabled={issued || soldOut || dlCouponMut.isPending} onClick={() => dlCouponMut.mutate(c.id)}>
                          {issued ? '발급완료' : soldOut ? '소진' : '발급받기'}
                        </button>
                      ) : (
                        <Link to="/login" className="text-xs text-brand-600 shrink-0">로그인</Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 리뷰 / Q&A 탭 */}
      <div className="card">
        <div className="flex border-b">
          <button onClick={() => setTab('reviews')} className={`px-6 py-3 font-medium ${tab === 'reviews' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-500'}`}>리뷰 ({p.reviewCount})</button>
          <button onClick={() => setTab('qna')} className={`px-6 py-3 font-medium ${tab === 'qna' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-gray-500'}`}>Q&A ({qnas?.length ?? 0})</button>
        </div>
        <div className="p-4">
          {tab === 'reviews' ? (
            <div className="space-y-4">
              {reviews?.length ? reviews.map((r) => (
                <div key={r.id} className="border-b pb-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Stars rating={r.rating} /><span className="text-gray-500">{r.userName}</span><span className="text-gray-400">{date(r.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm">{r.content}</p>
                  {r.adminReply && <div className="mt-2 bg-amber-50 p-2 rounded text-sm"><b>판매자:</b> {r.adminReply}</div>}
                </div>
              )) : <Empty text="아직 리뷰가 없습니다." />}
            </div>
          ) : (
            <div className="space-y-4">
              {qnas?.length ? qnas.map((q) => (
                <div key={q.id} className="border-b pb-3">
                  <div className="text-sm font-medium">Q. {q.question}</div>
                  <div className="text-xs text-gray-400">{q.userName} · {date(q.createdAt)}</div>
                  {q.answer ? <div className="mt-1 text-sm text-gray-600"><b>A.</b> {q.answer}</div> : <div className="mt-1 text-xs text-amber-600">답변 대기중</div>}
                </div>
              )) : <Empty text="아직 문의가 없습니다." />}
              {user && <QnaForm productId={Number(id)} onDone={() => qc.invalidateQueries({ queryKey: ['qnas', id] })} />}
            </div>
          )}
        </div>
      </div>

      {/* 상품 상세 설명 이미지 */}
      {(() => {
        let imgs: string[] = [];
        try { imgs = JSON.parse(p.detailImages) as string[]; } catch { imgs = []; }
        if (!imgs.length) return null;
        return (
          <div className="card overflow-hidden">
            <div className="border-b px-4 py-3 font-bold">상품 상세 정보</div>
            <div className="bg-white">
              {imgs.map((url, i) => (
                <img key={i} src={url} alt={`${p.name} 상세 이미지 ${i + 1}`} className="w-full block" loading="lazy" />
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function QnaForm({ productId, onDone }: { productId: number; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const mut = useMutation({ mutationFn: (b: any) => api('/qnas').post(b), onSuccess: () => { setQ(''); setOpen(false); onDone(); } });
  if (!open) return <button className="btn-outline btn-sm" onClick={() => setOpen(true)}>문의하기</button>;
  return (
    <div className="space-y-2">
      <textarea className="input" rows={2} placeholder="문의 내용" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn-primary btn-sm" disabled={!q || mut.isPending} onClick={() => mut.mutate({ productId, question: q })}>등록</button>
        <button className="btn-outline btn-sm" onClick={() => setOpen(false)}>취소</button>
      </div>
    </div>
  );
}
