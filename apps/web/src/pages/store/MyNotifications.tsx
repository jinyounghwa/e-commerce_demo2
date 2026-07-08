import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Spinner, Empty } from '../../components/ui';
import { date } from '../../lib/format';

const ICON: Record<string, string> = { ORDER: '📦', COUPON: '🎟️', QNA: '💬', CLAIM: '↩️' };

export default function MyNotifications() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['notis'], queryFn: () => api('/me/notifications').get<any[]>() });
  const read = useMutation({ mutationFn: (id: number) => api('/me/notifications').patch({}, `/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notis'] }) });
  if (isLoading) return <Spinner />;
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">알림</h1>
      {!data?.length ? <Empty text="알림이 없습니다." /> : (
        <div className="space-y-2">
          {data.map((n) => (
            <div key={n.id} className={`card p-3 flex items-center gap-3 ${!n.isRead ? 'border-l-4 border-brand-500' : ''}`}>
              <span className="text-xl">{ICON[n.type] ?? '🔔'}</span>
              <div className="flex-1">
                <div className="font-medium text-sm">{n.title} {!n.isRead && <span className="badge bg-brand-100 text-brand-600 text-xs">NEW</span>}</div>
                <div className="text-sm text-gray-500">{n.body}</div>
                <div className="text-xs text-gray-400">{date(n.createdAt)}</div>
              </div>
              {n.link && <Link to={n.link} className="btn-outline btn-sm" onClick={() => read.mutate(n.id)}>보기</Link>}
              {!n.isRead && <button className="text-xs text-gray-400" onClick={() => read.mutate(n.id)}>읽음</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
