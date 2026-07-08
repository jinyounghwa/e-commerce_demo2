import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Spinner, Empty } from '../../components/ui';
import { won } from '../../lib/format';

export default function Wishlist() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['wishlist'], queryFn: () => api('/wishlist').get<any[]>() });
  const del = useMutation({ mutationFn: (pid: number) => api('/wishlist').del(`/${pid}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['wishlist'] }) });
  if (isLoading) return <Spinner />;
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">찜 (위시리스트)</h1>
      {!data?.length ? <Empty text="찜한 상품이 없습니다." /> : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {data.map((w) => (
            <div key={w.id} className="card overflow-hidden">
              <Link to={`/products/${w.productId}`}><img src={w.thumbnailUrl} className="w-full aspect-square object-cover" alt="" /></Link>
              <div className="p-3">
                <Link to={`/products/${w.productId}`} className="text-sm font-medium truncate block">{w.name}</Link>
                <div className="text-brand-600 font-bold mt-1">{won(w.salePrice)}</div>
                <button className="btn-outline btn-sm w-full mt-2" onClick={() => del.mutate(w.productId)}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
