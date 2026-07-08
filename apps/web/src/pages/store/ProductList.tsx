import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api, Product } from '../../api';
import { Spinner, Empty } from '../../components/ui';
import { ProductCard } from '../../components/ProductCard';

const SORTS = [
  { v: 'latest', l: '신상품순' }, { v: 'priceAsc', l: '낮은가격순' },
  { v: 'priceDesc', l: '높은가격순' }, { v: 'rating', l: '평점순' },
];

export default function ProductList() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || '';
  const q = params.get('q') || '';
  const sort = params.get('sort') || 'latest';
  const page = Number(params.get('page') || 1);

  const { data: cats } = useQuery({ queryKey: ['categories'], queryFn: () => api('/categories').get<any[]>() });
  const { data, isLoading } = useQuery({
    queryKey: ['products', category, q, sort, page],
    queryFn: () => api('/products').get<{ items: Product[]; total: number; totalPages: number }>(
      `?category=${category}&q=${q}&sort=${sort}&page=${page}&limit=12`,
    ),
  });

  const set = (k: string, v: string) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); p.set('page', '1'); setParams(p); };
  const leafCats = (cats ?? []).flatMap((c: any) => (c.children ?? []).flatMap((cc: any) => cc.children ?? []).map((ccc: any) => ccc));

  return (
    <div className="flex gap-6">
      <aside className="w-48 hidden md:block">
        <h3 className="font-bold mb-3">카테고리</h3>
        <div className="space-y-1 text-sm">
          <button onClick={() => set('category', '')} className={`block w-full text-left px-2 py-1 rounded ${!category ? 'bg-brand-50 text-brand-600 font-medium' : 'hover:bg-gray-100'}`}>전체</button>
          {leafCats.map((c: any) => (
            <button key={c.id} onClick={() => set('category', String(c.id))} className={`block w-full text-left px-2 py-1 rounded ${category === String(c.id) ? 'bg-brand-50 text-brand-600 font-medium' : 'hover:bg-gray-100'}`}>{c.name}</button>
          ))}
        </div>
      </aside>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">{q ? `"${q}" 검색 결과` : '상품 목록'}</h1>
          <div className="flex gap-2">
            {SORTS.map((s) => (
              <button key={s.v} onClick={() => set('sort', s.v)} className={`btn-sm ${sort === s.v ? 'btn-primary' : 'btn-outline'}`}>{s.l}</button>
            ))}
          </div>
        </div>
        {isLoading ? <Spinner /> : !data?.items.length ? <Empty text="상품이 없습니다." /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {data.items.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
            {data.totalPages > 1 && (
              <div className="flex justify-center gap-1 mt-8">
                {Array.from({ length: data.totalPages }, (_, i) => (
                  <button key={i} onClick={() => set('page', String(i + 1))} className={`btn-sm ${page === i + 1 ? 'btn-primary' : 'btn-outline'}`}>{i + 1}</button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
