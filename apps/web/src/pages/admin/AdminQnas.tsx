import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Spinner, Empty, Modal } from '../../components/ui';
import { date } from '../../lib/format';

export default function AdminQnas() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['admin-qnas', filter], queryFn: () => api('/admin/qnas').get<any[]>(filter ? `?answered=${filter}` : '') });
  const [ans, setAns] = useState<number | null>(null);
  const [text, setText] = useState('');
  const reply = useMutation({ mutationFn: (b: { id: number; answer: string }) => api(`/admin/qnas/${b.id}`).patch({ answer: b.answer }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-qnas'] }); setAns(null); } });

  if (isLoading) return <Spinner />;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Q&A 관리</h1>
        <div className="flex gap-2">
          <button className={`btn-sm ${!filter ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('')}>전체</button>
          <button className={`btn-sm ${filter === 'false' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('false')}>미답변</button>
        </div>
      </div>
      {!data?.length ? <Empty text="Q&A가 없습니다." /> : (
        <div className="space-y-3">
          {data.map((q) => (
            <div key={q.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">Q. {q.question}</div>
                {q.answer ? <span className="badge bg-green-100 text-green-700">답변완료</span> : <span className="badge bg-amber-100 text-amber-700">미답변</span>}
              </div>
              <div className="text-xs text-gray-400">{q.productName} · {q.userName} · {date(q.createdAt)}</div>
              {q.answer && <div className="mt-2 text-sm text-gray-600"><b>A.</b> {q.answer}</div>}
              {!q.answer && <button className="btn-primary btn-sm mt-2" onClick={() => { setAns(q.id); setText(''); }}>답변하기</button>}
            </div>
          ))}
        </div>
      )}
      <Modal open={ans !== null} onClose={() => setAns(null)} title="답변 작성">
        <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn-primary w-full mt-2" disabled={!text} onClick={() => reply.mutate({ id: ans!, answer: text })}>등록</button>
      </Modal>
    </div>
  );
}
