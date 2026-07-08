import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Spinner, Empty, StatusBadge } from '../../components/ui';
import { won, date, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '../../lib/format';

const NEXT: Record<string, string[]> = {
  PAID: ['PREPARING', 'CANCELED'], PREPARING: ['SHIPPED', 'CANCELED'],
  SHIPPED: ['DELIVERING'], DELIVERING: ['DELIVERED'], DELIVERED: ['CONFIRMED'],
};

export default function AdminOrders() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['admin-orders', filter], queryFn: () => api('/admin/orders').get<any[]>(filter ? `?status=${filter}` : '') });
  const upd = useMutation({ mutationFn: (b: { id: number; status: string }) => api(`/admin/orders/${b.id}/status`).patch({ status: b.status }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-orders'] }), onError: (e: any) => alert(e.message) });

  if (isLoading) return <Spinner />;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">주문 관리</h1>
      <div className="flex gap-2 mb-4 flex-wrap">
        <button className={`btn-sm ${!filter ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('')}>전체</button>
        {Object.keys(ORDER_STATUS_LABEL).map((s) => (
          <button key={s} className={`btn-sm ${filter === s ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(s)}>{ORDER_STATUS_LABEL[s]}</button>
        ))}
      </div>
      <div className="space-y-3">
        {data?.map((o) => (
          <div key={o.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">{o.orderNo}</span>
                <StatusBadge label={ORDER_STATUS_LABEL[o.status]} color={ORDER_STATUS_COLOR[o.status]} />
                <span className="text-sm text-gray-400">{o.user?.name} · {date(o.createdAt)}</span>
              </div>
              <span className="font-bold text-brand-600">{won(o.payAmount)}</span>
            </div>
            <div className="text-sm text-gray-500 mt-1">{o.items?.map((i: any) => `${i.productName}(${i.optionLabel})×${i.quantity}`).join(', ')}</div>
            <div className="flex gap-2 mt-2">
              {(NEXT[o.status] ?? []).map((st) => (
                <button key={st} className={`btn-sm ${st === 'CANCELED' ? 'btn-danger' : 'btn-primary'}`} onClick={() => upd.mutate({ id: o.id, status: st })}>
                  {st === 'CANCELED' ? '취소' : ORDER_STATUS_LABEL[st] + ' ▶'}
                </button>
              ))}
              {!NEXT[o.status]?.length && <span className="text-sm text-gray-400">최종 상태</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
