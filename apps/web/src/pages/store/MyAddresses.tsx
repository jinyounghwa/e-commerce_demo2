import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Spinner, Modal, ErrorMsg } from '../../components/ui';

export default function MyAddresses() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['addresses'], queryFn: () => api('/me/addresses').get<any[]>() });
  const del = useMutation({ mutationFn: (id: number) => api('/me/addresses').del(`/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['addresses'] }) });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: '', receiver: '', phone: '', zipcode: '', addr1: '', addr2: '', isDefault: false });

  const add = useMutation({ mutationFn: (b: any) => api('/me/addresses').post(b), onSuccess: () => { setOpen(false); qc.invalidateQueries({ queryKey: ['addresses'] }); } });

  if (isLoading) return <Spinner />;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">배송지 관리</h1>
        <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>+ 추가</button>
      </div>
      <div className="space-y-3">
        {data?.map((a) => (
          <div key={a.id} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{a.label} {a.isDefault ? '<기본>' : ''}</span>
              <button className="text-red-400 text-sm" onClick={() => del.mutate(a.id)}>삭제</button>
            </div>
            <div className="text-sm text-gray-600 mt-1">{a.receiver} · {a.phone}</div>
            <div className="text-sm text-gray-500">({a.zipcode}) {a.addr1} {a.addr2}</div>
          </div>
        ))}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="배송지 추가">
        <div className="space-y-2">
          <input className="input" placeholder="배송지명" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <input className="input" placeholder="받는분" value={form.receiver} onChange={(e) => setForm({ ...form, receiver: e.target.value })} />
          <input className="input" placeholder="연락처" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder="우편번호" value={form.zipcode} onChange={(e) => setForm({ ...form, zipcode: e.target.value })} />
          <input className="input" placeholder="주소" value={form.addr1} onChange={(e) => setForm({ ...form, addr1: e.target.value })} />
          <input className="input" placeholder="상세주소" value={form.addr2} onChange={(e) => setForm({ ...form, addr2: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> 기본 배송지로 설정</label>
          <button className="btn-primary w-full" disabled={!form.label || !form.receiver} onClick={() => add.mutate(form)}>추가</button>
        </div>
      </Modal>
    </div>
  );
}
