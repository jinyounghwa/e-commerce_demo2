import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Spinner, Empty } from '../../components/ui';
import { won, num } from '../../lib/format';

export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api('/admin/dashboard').get<any>(), refetchInterval: 10000 });
  if (isLoading) return <Spinner />;
  const d = data!;
  const maxSales = Math.max(...d.chart.map((c: any) => c.sales), 1);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">대시보드</h1>
      <div className="grid grid-cols-4 gap-4">
        <Stat label="오늘 매출" value={won(d.todaySales)} />
        <Stat label="오늘 주문" value={num(d.todayOrderCount) + '건'} />
        <Stat label="취소율" value={d.cancelRate + '%'} />
        <Stat label="누적 매출" value={won(d.totalSales)} />
      </div>

      <div className="card p-4">
        <h2 className="font-bold mb-4">최근 7일 매출</h2>
        <div className="flex items-end gap-2 h-40">
          {d.chart.map((c: any) => (
            <div key={c.date} className="flex-1 flex flex-col items-center gap-1">
              <div className="text-xs text-gray-500">{c.sales >= 10000 ? Math.round(c.sales / 1000) + 'k' : c.sales}</div>
              <div className="w-full bg-brand-500 rounded-t" style={{ height: `${(c.sales / maxSales) * 100}%`, minHeight: '2px' }} />
              <div className="text-xs text-gray-400">{c.date.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">재고 부족 알림 ({d.lowStock.length}건)</h2>
          <Link to="/admin/products" className="text-sm text-brand-600">상품관리 →</Link>
        </div>
        {!d.lowStock.length ? <Empty text="재고 부족 상품이 없습니다." /> : (
          <div className="space-y-1 text-sm">
            {d.lowStock.slice(0, 10).map((s: any) => (
              <div key={s.skuId} className="flex justify-between py-1 border-b last:border-0">
                <span>{s.productName} <span className="text-gray-400">({s.optionLabel})</span></span>
                <span className={s.stock === 0 ? 'text-red-500 font-medium' : 'text-amber-600'}>재고 {s.stock}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="card p-4">
    <div className="text-sm text-gray-500">{label}</div>
    <div className="text-2xl font-bold mt-1 text-brand-600">{value}</div>
  </div>
);
