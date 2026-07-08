import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { Spinner, Empty } from '../../components/ui';
import { num, date } from '../../lib/format';

export default function MyPoints() {
  const { data, isLoading } = useQuery({ queryKey: ['points'], queryFn: () => api('/me/points').get<any>() });
  if (isLoading) return <Spinner />;
  return (
    <div>
      <div className="card p-6 mb-4 bg-gradient-to-r from-brand-600 to-brand-700 text-white">
        <div className="text-brand-100">보유 포인트</div>
        <div className="text-4xl font-bold mt-1">{num(data?.balance ?? 0)}P</div>
      </div>
      {data?.expiringSoon?.length > 0 && (
        <div className="card p-4 mb-4 border-l-4 border-amber-400">
          <div className="font-medium text-amber-600">⏰ 소멸 예정 포인트 ({data.expiringSoon.length}건)</div>
          {data.expiringSoon.map((e: any) => <div key={e.id} className="text-sm text-gray-500 mt-1">{num(e.amount)}P · ~{date(e.expiresAt)} {e.memo}</div>)}
        </div>
      )}
      <h2 className="font-bold mb-2">포인트 내역</h2>
      {!data?.ledger?.length ? <Empty text="내역이 없습니다." /> : (
        <div className="card divide-y">
          {data.ledger.map((l: any) => (
            <div key={l.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <div>{l.memo || l.type}</div>
                <div className="text-xs text-gray-400">{date(l.createdAt)} · {l.type}</div>
              </div>
              <div className={l.amount >= 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>{l.amount >= 0 ? '+' : ''}{num(l.amount)}P</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
