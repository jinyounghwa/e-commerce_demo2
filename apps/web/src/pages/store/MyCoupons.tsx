import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { Spinner, Empty } from '../../components/ui';
import { dateOnly, won } from '../../lib/format';

export default function MyCoupons() {
  const { data, isLoading } = useQuery({ queryKey: ['myCoupons'], queryFn: () => api('/me/coupons').get<any[]>() });
  if (isLoading) return <Spinner />;
  const color = (s: string) => s === 'UNUSED' ? 'border-green-500' : s === 'USED' ? 'border-gray-300 opacity-60' : 'border-red-300 opacity-60';
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">내 쿠폰</h1>
      {!data?.length ? <Empty text="보유한 쿠폰이 없습니다." /> : (
        <div className="grid md:grid-cols-2 gap-3">
          {data.map((c) => (
            <div key={c.id} className={`card p-4 border-l-4 ${color(c.status)}`}>
              <div className="flex justify-between">
                <div className="text-lg font-bold text-brand-600">{c.discountType === 'FIXED' ? won(c.discountValue) : `${c.discountValue}%`}{c.maxDiscount ? ` (최대 ${won(c.maxDiscount)})` : ''}</div>
                <span className="badge bg-gray-100 text-gray-600 text-xs">{c.status === 'UNUSED' ? '사용가능' : c.status === 'USED' ? '사용완료' : '만료'}</span>
              </div>
              <div className="font-medium mt-1">{c.name}</div>
              <div className="text-xs text-gray-400 mt-1">{c.minOrderAmount ? `최소 ${won(c.minOrderAmount)} ` : ''}· ~{dateOnly(c.expiresAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
