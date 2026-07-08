import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Spinner, Empty } from '../../components/ui';
import { date, SHIPMENT_STATUS_LABEL, ORDER_STATUS_LABEL } from '../../lib/format';

export default function AdminShipping() {
  const qc = useQueryClient();
  const [auto, setAuto] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['admin-shipments'], queryFn: () => api('/admin/shipments').get<any[]>(), refetchInterval: auto ? 2000 : false });
  const dispatch = useMutation({ mutationFn: (oid: number) => api(`/admin/shipments/${oid}/dispatch`).post({}), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-shipments'] }) });
  const advance = useMutation({ mutationFn: (sid: number) => api(`/admin/shipments/${sid}/advance`).post({}), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-shipments'] }), onError: () => {} });
  const autoMut = useMutation({ mutationFn: (on: boolean) => api('/admin/shipments/auto-run').post({ on }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-shipments'] }) });

  const toggleAuto = () => { const n = !auto; setAuto(n); autoMut.mutate(n); };

  if (isLoading) return <Spinner />;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">배송 관리 (시뮬레이터)</h1>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={auto} onChange={toggleAuto} /> 자동 진행 (10초마다)
        </label>
      </div>
      <div className="space-y-3">
        {data?.map((s) => {
          const done = s.status === 'DELIVERED';
          return (
            <div key={s.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{s.orderNo}</span>
                  <span className="ml-2 badge bg-gray-100 text-gray-600">{ORDER_STATUS_LABEL[s.orderStatus] ?? s.orderStatus}</span>
                  <span className="ml-2 badge bg-brand-100 text-brand-700">{SHIPMENT_STATUS_LABEL[s.status] ?? s.status}</span>
                  <span className="ml-2 text-sm text-gray-400">{s.trackingNo}</span>
                </div>
                <div className="flex gap-2">
                  {s.status === 'READY' && <button className="btn-outline btn-sm" onClick={() => advance.mutate(s.id)}>출고시작</button>}
                  {!done && s.status !== 'READY' && <button className="btn-primary btn-sm" onClick={() => advance.mutate(s.id)}>다음 단계 ▶</button>}
                  {done && <span className="text-green-600 text-sm">배송완료</span>}
                </div>
              </div>
              <div className="flex gap-1 mt-3">
                {['READY', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].map((st, i) => {
                  const idx = ['READY', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].indexOf(s.status);
                  return <div key={st} className={`flex-1 text-center text-xs py-1 rounded ${i <= idx ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-400'}`}>{SHIPMENT_STATUS_LABEL[st]}</div>;
                })}
              </div>
              <div className="text-xs text-gray-400 mt-2">{s.receiver} · 마지막: {s.events[s.events.length - 1]?.location} {date(s.events[s.events.length - 1]?.at)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
