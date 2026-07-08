import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Spinner, Modal, Empty } from '../../components/ui';
import { won } from '../../lib/format';

function flattenCats(cats: any[], prefix = ''): { id: number; name: string }[] {
  const out: { id: number; name: string }[] = [];
  for (const c of cats ?? []) {
    const name = prefix ? `${prefix}/${c.name}` : c.name;
    out.push({ id: c.id, name });
    if (c.children?.length) out.push(...flattenCats(c.children, name));
  }
  return out;
}

export default function AdminCoupons() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-coupons'], queryFn: () => api('/admin/coupons').get<any[]>() });
  const { data: cats } = useQuery({ queryKey: ['categories'], queryFn: () => api('/categories').get<any[]>() });
  const { data: prodList } = useQuery({ queryKey: ['products-list-admin'], queryFn: () => api('/products').get<{ items: any[] }>('/?limit=100') });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', discountType: 'FIXED', discountValue: 0, maxDiscount: '', minOrderAmount: 0, issueType: 'DOWNLOAD', validDays: 14, totalQuantity: '', scope: 'ALL', scopeCategoryId: '', scopeProductId: '' });

  const create = useMutation({ mutationFn: (b: any) => api('/admin/coupons').post(b), onSuccess: () => { setOpen(false); qc.invalidateQueries({ queryKey: ['admin-coupons'] }); } });
  const { data: stats } = useQuery({ queryKey: ['coupon-stats'], queryFn: async () => { const r = await Promise.all((data ?? []).map((c) => api(`/admin/coupons/${c.id}/stats`).get<any>())); return r; }, enabled: !!data });

  if (isLoading) return <Spinner />;
  const allCats = flattenCats(cats ?? []);

  const submit = () => create.mutate({ ...form, discountValue: Number(form.discountValue), maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null, minOrderAmount: Number(form.minOrderAmount), totalQuantity: form.totalQuantity ? Number(form.totalQuantity) : null, scopeCategoryId: form.scope === 'CATEGORY' ? Number(form.scopeCategoryId) : null, scopeProductId: form.scope === 'PRODUCT' ? Number(form.scopeProductId) : null });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">쿠폰 관리</h1>
        <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>+ 쿠폰 생성</button>
      </div>
      {!data?.length ? <Empty text="쿠폰이 없습니다." /> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500"><tr><th className="p-3 text-left">쿠폰명</th><th className="p-3 text-center">할인</th><th className="p-3 text-center">발급/사용</th><th className="p-3 text-center">사용률</th><th className="p-3 text-center">상태</th></tr></thead>
            <tbody>
              {data.map((c, i) => (
                <tr key={c.id} className="border-t">
                  <td className="p-3">{c.name}<div className="text-xs text-gray-400">{c.issueType} · {c.scope === 'PRODUCT' ? `상품전용${c.scopeProductId ? `(${prodList?.items.find((p) => p.id === c.scopeProductId)?.name ?? '#' + c.scopeProductId})` : ''}` : c.scope === 'CATEGORY' ? '카테고리' : '전체'}{c.totalQuantity != null ? ` · 한정${c.totalQuantity}` : ''}</div></td>
                  <td className="p-3 text-center">{c.discountType === 'FIXED' ? won(c.discountValue) : `${c.discountValue}%${c.maxDiscount ? `(최대${c.maxDiscount})` : ''}`}</td>
                  <td className="p-3 text-center">{stats?.[i]?.issuedCount ?? 0} / {stats?.[i]?.usedCount ?? 0}</td>
                  <td className="p-3 text-center">{stats?.[i]?.usageRate ?? 0}%</td>
                  <td className="p-3 text-center"><span className={`badge ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{c.isActive ? '활성' : '비활성'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="쿠폰 생성">
        <div className="space-y-2">
          <input className="input" placeholder="쿠폰명" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}><option value="FIXED">정액</option><option value="RATE">정률(%)</option></select>
            <input type="number" className="input" placeholder="할인값" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })} />
          </div>
          {form.discountType === 'RATE' && <input className="input" placeholder="최대할인액 (선택)" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} />}
          <input type="number" className="input" placeholder="최소주문금액" value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: Number(e.target.value) })} />
          <select className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value, scopeCategoryId: '', scopeProductId: '' })}><option value="ALL">전체 상품</option><option value="CATEGORY">특정 카테고리</option><option value="PRODUCT">특정 상품 전용</option></select>
          {form.scope === 'CATEGORY' && <select className="input" value={form.scopeCategoryId} onChange={(e) => setForm({ ...form, scopeCategoryId: e.target.value })}><option value="">카테고리 선택</option>{allCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          {form.scope === 'PRODUCT' && <select className="input" value={form.scopeProductId} onChange={(e) => setForm({ ...form, scopeProductId: e.target.value })}><option value="">상품 선택</option>{prodList?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          <select className="input" value={form.issueType} onChange={(e) => setForm({ ...form, issueType: e.target.value })}><option value="DOWNLOAD">다운로드형</option><option value="AUTO_SIGNUP">가입자동발급</option><option value="ADMIN">관리자지급</option></select>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" className="input" placeholder="유효일수" value={form.validDays} onChange={(e) => setForm({ ...form, validDays: Number(e.target.value) })} />
            <input className="input" placeholder="총수량(빈=무제한)" value={form.totalQuantity} onChange={(e) => setForm({ ...form, totalQuantity: e.target.value })} />
          </div>
          <button className="btn-primary w-full" disabled={!form.name} onClick={submit}>생성</button>
        </div>
      </Modal>
    </div>
  );
}
