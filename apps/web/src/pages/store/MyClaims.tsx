import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { Spinner, Empty, StatusBadge } from '../../components/ui';
import { date, CLAIM_STATUS_LABEL } from '../../lib/format';

const COLOR: Record<string, string> = {
  REQUESTED: 'bg-blue-100 text-blue-700', APPROVED: 'bg-amber-100 text-amber-700',
  REJECTED: 'bg-red-100 text-red-700', INSPECTING: 'bg-purple-100 text-purple-700',
  REFUNDED: 'bg-green-100 text-green-700', COMPLETED: 'bg-emerald-100 text-emerald-700',
};

export default function MyClaims() {
  const { data, isLoading } = useQuery({ queryKey: ['claims'], queryFn: () => api('/claims').get<any[]>() });
  if (isLoading) return <Spinner />;
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">취소 / 반품 / 교환 내역</h1>
      {!data?.length ? <Empty text="접수한 CS 요청이 없습니다." /> : (
        <div className="space-y-3">
          {data.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="badge bg-gray-100 text-gray-700">{c.type === 'CANCEL' ? '취소' : c.type === 'RETURN' ? '반품' : '교환'}</span>
                  <StatusBadge label={CLAIM_STATUS_LABEL[c.status]} color={COLOR[c.status] ?? 'bg-gray-100'} />
                </div>
                <span className="text-sm text-gray-400">{date(c.createdAt)}</span>
              </div>
              <div className="mt-2 text-sm"><Link to={`/my/orders/${c.orderId}`} className="text-brand-600">{c.orderNo}</Link> · {c.reason}</div>
              {c.refundAmount != null && <div className="text-sm text-green-600 mt-1">환불액: {c.refundAmount.toLocaleString()}원 {c.refundPoints ? `+ ${c.refundPoints}P` : ''}</div>}
              {c.inspectionResult && <div className="text-xs text-gray-400 mt-1">검수결과: {c.inspectionResult === 'RESTOCK' ? '양품화(재고복원)' : '폐기'}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
