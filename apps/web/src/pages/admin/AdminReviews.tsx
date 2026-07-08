import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Spinner, Empty, Modal, Stars } from '../../components/ui';
import { date } from '../../lib/format';

export default function AdminReviews() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-reviews'], queryFn: () => api('/admin/reviews').get<any[]>() });
  const [reply, setReply] = useState<number | null>(null);
  const [text, setText] = useState('');
  const upd = useMutation({ mutationFn: (b: { id: number; body: any }) => api(`/admin/reviews/${b.id}`).patch(b.body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-reviews'] }); setReply(null); } });

  if (isLoading) return <Spinner />;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">리뷰 관리</h1>
      {!data?.length ? <Empty text="리뷰가 없습니다." /> : (
        <div className="space-y-3">
          {data.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div><Stars rating={r.rating} /> <span className="text-sm ml-2">{r.productName}</span></div>
                <span className={`badge ${r.isVisible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{r.isVisible ? '노출' : '블라인드'}</span>
              </div>
              <p className="text-sm mt-1">{r.content}</p>
              <div className="text-xs text-gray-400">{r.userName} · {date(r.createdAt)}</div>
              {r.adminReply && <div className="mt-2 bg-amber-50 p-2 rounded text-sm"><b>판매자 답변:</b> {r.adminReply}</div>}
              <div className="flex gap-2 mt-2">
                <button className="btn-outline btn-sm" onClick={() => { setReply(r.id); setText(r.adminReply ?? ''); }}>답변</button>
                <button className="btn-outline btn-sm" onClick={() => upd.mutate({ id: r.id, body: { isVisible: r.isVisible ? 0 : 1 } })}>{r.isVisible ? '블라인드' : '노출'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={reply !== null} onClose={() => setReply(null)} title="답변 작성">
        <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn-primary w-full mt-2" onClick={() => upd.mutate({ id: reply!, body: { adminReply: text } })}>등록</button>
      </Modal>
    </div>
  );
}
