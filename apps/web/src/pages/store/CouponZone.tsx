import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Spinner, Empty } from '../../components/ui';
import { won, date } from '../../lib/format';

export default function CouponZone() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['coupons', 'available'], queryFn: () => api('/coupons/available').get<any[]>() });
  const dl = useMutation({ mutationFn: (id: number) => api(`/coupons/${id}/download`).post({}), onSuccess: () => { qc.invalidateQueries({ queryKey: ['coupons', 'available'] }); qc.invalidateQueries({ queryKey: ['myCoupons'] }); alert('쿠폰이 발급되었습니다.'); } });

  if (isLoading) return <Spinner />;
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">쿠폰존</h1>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.map((c) => (
          <div key={c.id} className="card p-4 border-l-4 border-brand-500">
            <div className="text-lg font-bold text-brand-600">{c.discountType === 'FIXED' ? won(c.discountValue) : `${c.discountValue}%`}{c.maxDiscount ? ` (최대 ${won(c.maxDiscount)})` : ''}</div>
            <div className="font-medium mt-1">{c.name}</div>
            <div className="text-xs text-gray-500 mt-1">
              {c.minOrderAmount ? `최소 ${won(c.minOrderAmount)} ` : ''}{c.scope === 'CATEGORY' ? '특정카테고리 ' : '전체 '}
              · {c.validDays}일
              {c.totalQuantity != null && ` · 남은수량 ${c.remaining}`}
            </div>
            <button className={`btn-sm mt-3 w-full ${c.isIssued ? 'btn-outline' : 'btn-primary'}`} disabled={c.isIssued || (c.totalQuantity != null && c.remaining === 0)} onClick={() => dl.mutate(c.id)}>
              {c.isIssued ? '발급완료' : c.totalQuantity != null && c.remaining === 0 ? '수량소진' : '발급받기'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
