import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Spinner, Empty, Modal, StatusBadge } from '../../components/ui';
import { won, date, CLAIM_STATUS_LABEL } from '../../lib/format';

const COLOR: Record<string, string> = {
  REQUESTED: 'bg-blue-100 text-blue-700', APPROVED: 'bg-amber-100 text-amber-700',
  REJECTED: 'bg-red-100 text-red-700', COLLECTING: 'bg-cyan-100 text-cyan-700',
  INSPECTING: 'bg-purple-100 text-purple-700', REFUNDED: 'bg-green-100 text-green-700',
  RESHIPPING: 'bg-indigo-100 text-indigo-700', COMPLETED: 'bg-emerald-100 text-emerald-700',
};

export default function AdminClaims() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-claims'], queryFn: () => api('/admin/claims').get<any[]>() });
  const act = useMutation({ mutationFn: (b: { id: number; body: any }) => api(`/admin/claims/${b.id}`).patch(b.body), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-claims'] }), onError: (e: any) => alert(e.message) });
  const [inspect, setInspect] = useState<any | null>(null);

  if (isLoading) return <Spinner />;

  const actionFor = (c: any) => {
    if (c.status === 'REQUESTED') return [{ l: '승인', a: 'APPROVE', danger: false }, { l: '거절', a: 'REJECT', danger: true }];
    if (c.status === 'APPROVED') return [{ l: '회수중 전환', a: 'COLLECT', danger: false }];
    if (c.status === 'COLLECTING') return [{ l: '검수 시작', a: 'INSPECT', danger: false }];
    if (c.status === 'INSPECTING') return [{ l: '검수 결과 입력', a: 'INSPECT_MODAL', danger: false }];
    if (c.status === 'RESHIPPING') return [{ l: '교환 완료', a: 'RESHIP', danger: false }];
    return [];
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">CS 관리 (취소/반품/교환)</h1>
      <div className="space-y-3">
        {data?.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="badge bg-gray-100 text-gray-700">{c.type === 'CANCEL' ? '취소' : c.type === 'RETURN' ? '반품' : '교환'}</span>
                <StatusBadge label={CLAIM_STATUS_LABEL[c.status]} color={COLOR[c.status] ?? 'bg-gray-100'} />
                <span className="text-sm text-gray-400">{c.orderNo} · {c.userName} · {date(c.createdAt)}</span>
              </div>
              {c.refundAmount != null && <span className="text-sm text-green-600">환불 {won(c.refundAmount)}{c.refundPoints ? ` +${c.refundPoints}P` : ''}</span>}
            </div>
            <div className="text-sm mt-1">사유: {c.reason} {c.detail && `· ${c.detail}`}</div>
            <div className="text-sm text-gray-500">상품: {c.item?.productName} ({c.item?.optionLabel}) × {c.item?.quantity}</div>
            {c.inspectionResult && <div className="text-xs text-gray-400 mt-1">검수결과: {c.inspectionResult === 'RESTOCK' ? '✅ 양품화 (재고복원)' : '🗑️ 폐기'}</div>}
            <div className="flex gap-2 mt-2">
              {actionFor(c).map((b) => (
                <button key={b.a} className={`btn-sm ${b.danger ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => b.a === 'INSPECT_MODAL' ? setInspect(c) : act.mutate({ id: c.id, body: { action: b.a } })}>
                  {b.l}
                </button>
              ))}
              {!actionFor(c).length && <span className="text-sm text-gray-400">처리 완료</span>}
            </div>
          </div>
        ))}
      </div>

      {inspect && <InspectModal claim={inspect} onClose={() => setInspect(null)} onDone={(body: any) => { act.mutate({ id: inspect.id, body }); setInspect(null); }} />}
    </div>
  );
}

function InspectModal({ claim, onClose, onDone }: any) {
  const [result, setResult] = useState<'RESTOCK' | 'DISPOSE'>('RESTOCK');
  return (
    <Modal open onClose={onClose} title="반품 검수 결과">
      <div className="space-y-3">
        <p className="text-sm text-gray-600">{claim.item?.productName} ({claim.item?.optionLabel}) × {claim.item?.quantity}</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 p-3 border rounded cursor-pointer hover:bg-gray-50">
            <input type="radio" checked={result === 'RESTOCK'} onChange={() => setResult('RESTOCK')} />
            <div><div className="font-medium">양품화 (RESTOCK)</div><div className="text-xs text-gray-500">재고를 복원하여 재판매 가능</div></div>
          </label>
          <label className="flex items-center gap-2 p-3 border rounded cursor-pointer hover:bg-gray-50">
            <input type="radio" checked={result === 'DISPOSE'} onChange={() => setResult('DISPOSE')} />
            <div><div className="font-medium">폐기 (DISPOSE)</div><div className="text-xs text-gray-500">재고 복원 없이 환불만 처리</div></div>
          </label>
        </div>
        <button className="btn-primary w-full" onClick={() => onDone({ action: result, inspectionResult: result })}>검수 완료 · 환불 처리</button>
      </div>
    </Modal>
  );
}
