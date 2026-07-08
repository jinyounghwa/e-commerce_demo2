import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Spinner, Modal } from '../../components/ui';

export default function AdminCategories() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['categories'], queryFn: () => api('/admin/categories').get<any[]>() });
  const add = useMutation({ mutationFn: (b: any) => api('/admin/categories').post(b), onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }) });
  const del = useMutation({ mutationFn: (id: number) => api(`/admin/categories/${id}`).del(), onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }) });
  const [open, setOpen] = useState<number | 'root' | null>(null);
  const [name, setName] = useState('');

  const submit = () => { add.mutate({ name, parentId: open === 'root' ? null : open }); setOpen(null); setName(''); };

  const render = (cats: any[], depth = 0) => cats.map((c) => (
    <div key={c.id}>
      <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: depth * 20 }}>
        <span className="font-medium">{c.name}</span>
        <span className="text-xs text-gray-400">depth {c.depth}</span>
        <button className="text-brand-600 text-xs" onClick={() => setOpen(c.id)}>+ 하위</button>
        <button className="text-red-400 text-xs" onClick={() => del.mutate(c.id)}>삭제</button>
      </div>
      {c.children?.length > 0 && render(c.children, depth + 1)}
    </div>
  ));

  if (isLoading) return <Spinner />;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">카테고리 관리 (3-depth)</h1>
        <button className="btn-primary btn-sm" onClick={() => setOpen('root')}>+ 최상위 추가</button>
      </div>
      <div className="card p-4">{render(data ?? [])}</div>
      <Modal open={open !== null} onClose={() => setOpen(null)} title="카테고리 추가">
        <div className="space-y-3">
          <input className="input" placeholder="카테고리명" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn-primary w-full" disabled={!name} onClick={submit}>추가</button>
        </div>
      </Modal>
    </div>
  );
}
