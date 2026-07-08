import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Spinner, Empty } from '../../components/ui';
import { won } from '../../lib/format';

export default function AdminProducts() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-products'], queryFn: () => api('/admin/products').get<any[]>() });
  const del = useMutation({ mutationFn: (id: number) => api(`/admin/products/${id}`).del(), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-products'] }) });
  if (isLoading) return <Spinner />;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">상품 관리</h1>
        <Link to="/admin/products/new" className="btn-primary btn-sm">+ 상품 등록</Link>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr><th className="p-3 text-left">상품</th><th className="p-3 text-left">카테고리</th><th className="p-3 text-right">가격</th><th className="p-3 text-center">재고</th><th className="p-3 text-center">상태</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {data?.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3"><div className="flex items-center gap-2"><img src={p.thumbnailUrl} className="w-10 h-10 object-cover rounded" alt="" /><span>{p.name}</span></div></td>
                <td className="p-3 text-gray-500">{p.categoryName}</td>
                <td className="p-3 text-right">{won(p.salePrice)}</td>
                <td className="p-3 text-center">{p.totalStock}</td>
                <td className="p-3 text-center"><span className={`badge ${p.status === 'ON_SALE' ? 'bg-green-100 text-green-700' : p.status === 'SOLD_OUT' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{p.status}</span></td>
                <td className="p-3 text-right">
                  <Link to={`/admin/products/${p.id}`} className="text-brand-600 text-sm mr-2">수정</Link>
                  <button className="text-red-400 text-sm" onClick={() => confirm('삭제?') && del.mutate(p.id)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
