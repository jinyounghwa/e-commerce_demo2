import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Spinner, ErrorMsg } from '../../components/ui';

export default function AdminProductEdit() {
  const { id } = useParams();
  const isEdit = !!id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: cats } = useQuery({ queryKey: ['categories'], queryFn: () => api('/categories').get<any[]>() });
  const { data: prod } = useQuery({ queryKey: ['admin-product', id], queryFn: () => api(`/admin/products/${id}`).get<any>(), enabled: isEdit });

  const [form, setForm] = useState({ name: '', categoryId: 0, description: '', basePrice: 0, salePrice: 0, thumbnailUrl: 'https://picsum.photos/seed/new/400/400', status: 'ON_SALE', detailImages: '' });
  const [opts, setOpts] = useState<{ name: string; values: string }[]>([{ name: '옵션', values: '' }]);
  const [hasOpt, setHasOpt] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (prod) { const imgs = (() => { try { return (JSON.parse(prod.detailImages) as string[]).join('\n'); } catch { return ''; } })(); setForm({ name: prod.name, categoryId: prod.categoryId, description: prod.description, basePrice: prod.basePrice, salePrice: prod.salePrice, thumbnailUrl: prod.thumbnailUrl, status: prod.status, detailImages: imgs }); setHasOpt(prod.options?.length > 0); } }, [prod]);

  const leafCats = (cats ?? []).flatMap((c: any) => (c.children ?? []).flatMap((cc: any) => cc.children ?? []).map((ccc: any) => ccc)).concat((cats ?? []).filter((c: any) => !c.parentId));

  const save = useMutation({
    mutationFn: async () => {
      const body: any = { ...form };
      if (!isEdit && hasOpt) {
        body.options = opts.filter((o) => o.values.trim()).map((o) => ({ name: o.name, values: o.values.split(',').map((v) => v.trim()).filter(Boolean) }));
        if (!body.options.length) throw new Error('옵션값을 입력하세요');
      }
      if (isEdit) await api(`/admin/products/${id}`).patch(body);
      else await api('/admin/products').post(body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-products'] }); nav('/admin/products'); },
    onError: (e: any) => setErr(e.message),
  });

  const updSku = useMutation({ mutationFn: (b: { id: number; body: any }) => api(`/admin/skus/${b.id}`).patch(b.body), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-product', id] }) });

  if (isEdit && !prod) return <Spinner />;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">{isEdit ? '상품 수정' : '상품 등록'}</h1>
      <ErrorMsg msg={err} />
      <div className="card p-4 space-y-3">
        <div><label className="text-sm">상품명</label><input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className="text-sm">카테고리</label>
          <select className="input mt-1" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: Number(e.target.value) })}>
            <option value={0}>선택</option>
            {leafCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-sm">정가</label><input type="number" className="input mt-1" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })} /></div>
          <div><label className="text-sm">판매가</label><input type="number" className="input mt-1" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })} /></div>
        </div>
        <div><label className="text-sm">썸네일 URL</label><input className="input mt-1" value={form.thumbnailUrl} onChange={(e) => setForm({ ...form, thumbnailUrl: e.target.value })} /></div>
        <div><label className="text-sm">상세 설명 이미지 URL (줄바꿈 또는 쉼표 구분, 비우면 자동 생성)</label><textarea className="input mt-1" rows={3} placeholder={"https://...\nhttps://..."} value={form.detailImages} onChange={(e) => setForm({ ...form, detailImages: e.target.value })} /></div>
        <div><label className="text-sm">설명</label><textarea className="input mt-1" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div><label className="text-sm">진열상태</label>
          <select className="input mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="ON_SALE">판매중</option><option value="HIDDEN">숨김</option><option value="SOLD_OUT">품절</option>
          </select>
        </div>

        {!isEdit && (
          <div className="border-t pt-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hasOpt} onChange={(e) => setHasOpt(e.target.checked)} /> 옵션 사용 (색상×사이즈 등)</label>
            {hasOpt && (
              <div className="space-y-2 mt-2">
                <p className="text-xs text-gray-400">옵션값은 쉼표로 구분. 여러 옵션그룹은 데카르트 곱으로 SKU 자동 생성.</p>
                {opts.map((o, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="input" placeholder="옵션명(예: 색상)" value={o.name} onChange={(e) => setOpts(opts.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                    <input className="input flex-1" placeholder="값(예: 블랙,화이트,네이비)" value={o.values} onChange={(e) => setOpts(opts.map((x, j) => j === i ? { ...x, values: e.target.value } : x))} />
                  </div>
                ))}
                <button className="btn-outline btn-sm" onClick={() => setOpts([...opts, { name: '옵션', values: '' }])}>+ 옵션그룹 추가</button>
              </div>
            )}
            {!hasOpt && <p className="text-xs text-gray-400 mt-1">옵션 미사용 시 단일 SKU(기본) 1개 자동 생성</p>}
          </div>
        )}
        <button className="btn-primary w-full" onClick={() => save.mutate()} disabled={save.isPending}>{isEdit ? '수정' : '등록'}</button>
      </div>

      {/* SKU 관리 (수정 시) */}
      {isEdit && prod?.skus && (
        <div className="card p-4 mt-4">
          <h2 className="font-bold mb-3">SKU / 재고 관리 ({prod.skus.length}개)</h2>
          <div className="space-y-2 max-h-96 overflow-auto">
            {prod.skus.map((s: any) => (
              <div key={s.id} className="flex items-center gap-2 text-sm border-b pb-2">
                <span className="flex-1">{s.optionLabel}</span>
                <input type="number" className="input w-20" defaultValue={s.stock} onBlur={(e) => Number(e.target.value) !== s.stock && updSku.mutate({ id: s.id, body: { stock: Number(e.target.value) } })} />
                <span className="text-xs text-gray-400 w-8">재고</span>
                <input type="number" className="input w-20" defaultValue={s.extraPrice} onBlur={(e) => Number(e.target.value) !== s.extraPrice && updSku.mutate({ id: s.id, body: { extraPrice: Number(e.target.value) } })} />
                <span className="text-xs text-gray-400 w-8">추가금</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
