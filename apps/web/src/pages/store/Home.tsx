import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, Product } from '../../api';
import { Spinner, Empty } from '../../components/ui';
import { won } from '../../lib/format';
import { ProductCard } from '../../components/ProductCard';

export default function Home() {
  const { data: cats } = useQuery({ queryKey: ['categories'], queryFn: () => api('/categories').get<any[]>() });
  const { data: latest } = useQuery({ queryKey: ['products', 'latest'], queryFn: () => api('/products').get<{ items: Product[] }>('/?sort=latest&limit=8') });

  const leafCats = (cats ?? []).flatMap((c: any) => (c.children ?? []).flatMap((cc: any) => cc.children ?? []).map((ccc: any) => ccc));

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-brand-600 to-brand-700 text-white rounded-xl p-8">
        <h1 className="text-3xl font-bold mb-2">쇼핑몰의 모든 로직을 한 화면에서</h1>
        <p className="text-brand-100">회원→상품→주문→배송→CS, 실제 동작하는 살아있는 데모</p>
        <div className="flex gap-3 mt-4">
          <Link to="/products" className="btn bg-white text-brand-700 hover:bg-brand-50">전체 상품 보기</Link>
          <Link to="/coupons" className="btn border border-white/40 text-white hover:bg-white/10">쿠폰존</Link>
        </div>
      </div>

      <section>
        <h2 className="text-xl font-bold mb-4">카테고리</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {(leafCats.length ? leafCats : (cats ?? [])).map((c: any) => (
            <Link key={c.id} to={`/category/${c.id}`} className="card p-4 text-center hover:border-brand-500 hover:text-brand-600">
              <div className="text-sm font-medium">{c.name}</div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">신상품</h2>
          <Link to="/products?sort=latest" className="text-sm text-brand-600">더보기 →</Link>
        </div>
        {!latest ? <Spinner /> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {latest.items.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>
    </div>
  );
}
