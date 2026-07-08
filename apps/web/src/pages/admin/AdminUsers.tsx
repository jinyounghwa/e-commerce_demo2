import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Spinner, Modal } from '../../components/ui';
import { num, won, GRADE_LABEL } from '../../lib/format';

export default function AdminUsers() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: () => api('/admin/users').get<any[]>() });
  const grade = useMutation({ mutationFn: (b: { id: number; grade: string }) => api(`/admin/users/${b.id}/grade`).patch({ grade: b.grade }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }) });
  const [pt, setPt] = useState<{ id: number; name: string } | null>(null);
  const [amt, setAmt] = useState(0);
  const pts = useMutation({ mutationFn: (b: { id: number; amount: number; memo: string }) => api(`/admin/users/${b.id}/points`).post({ amount: b.amount, memo: b.memo }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setPt(null); } });

  if (isLoading) return <Spinner />;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">회원 관리</h1>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500"><tr><th className="p-3 text-left">회원</th><th className="p-3 text-center">등급</th><th className="p-3 text-right">누적결제</th><th className="p-3 text-right">포인트</th><th className="p-3 text-center">관리</th></tr></thead>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-3">{u.name}<div className="text-xs text-gray-400">{u.email} {u.role === 'ADMIN' && '· 관리자'}</div></td>
                <td className="p-3 text-center">
                  <select className="input w-24" value={u.grade} onChange={(e) => grade.mutate({ id: u.id, grade: e.target.value })}>
                    {Object.keys(GRADE_LABEL).map((g) => <option key={g} value={g}>{GRADE_LABEL[g]}</option>)}
                  </select>
                </td>
                <td className="p-3 text-right">{won(u.totalSpent)}</td>
                <td className="p-3 text-right">{num(u.pointBalance)}P</td>
                <td className="p-3 text-center"><button className="btn-outline btn-sm" onClick={() => { setPt({ id: u.id, name: u.name }); setAmt(0); }}>포인트</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!pt} onClose={() => setPt(null)} title={`포인트 조정 - ${pt?.name}`}>
        <div className="space-y-3">
          <p className="text-sm text-gray-500">양수=지급, 음수=차감</p>
          <input type="number" className="input" value={amt} onChange={(e) => setAmt(Number(e.target.value))} />
          <input className="input" placeholder="사유" defaultValue="관리자 조정" id="ptmemo" />
          <button className="btn-primary w-full" onClick={() => pts.mutate({ id: pt!.id, amount: amt, memo: (document.getElementById('ptmemo') as HTMLInputElement)?.value || '관리자 조정' })}>적용</button>
        </div>
      </Modal>
    </div>
  );
}
