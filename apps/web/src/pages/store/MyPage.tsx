import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { useAuth } from '../../stores/auth';
import { num, GRADE_LABEL } from '../../lib/format';

const menu = [
  { to: '/my/orders', label: '주문 내역' }, { to: '/my/claims', label: '취소/반품/교환' },
  { to: '/my/coupons', label: '내 쿠폰' }, { to: '/my/points', label: '포인트' },
  { to: '/my/addresses', label: '배송지 관리' }, { to: '/my/notifications', label: '알림' },
  { to: '/wishlist', label: '찜 목록' },
];

export default function MyPage() {
  const { user } = useAuth();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api('/me').get<any>() });
  const u = me ?? user;
  return (
    <div>
      <div className="card p-6 mb-6 bg-gradient-to-r from-brand-600 to-brand-700 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold">{u?.name}님</div>
            <div className="text-brand-100 mt-1">{u?.email}</div>
          </div>
          <div className="text-right">
            <div className="badge bg-white/20 text-white">{GRADE_LABEL[u?.grade ?? 'BRONZE']} 등급</div>
            <div className="mt-2 text-3xl font-bold">{num(u?.pointBalance ?? 0)}<span className="text-sm">P</span></div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {menu.map((m) => (
          <Link key={m.to} to={m.to} className="card p-6 text-center hover:border-brand-500 hover:text-brand-600">
            <div className="font-medium">{m.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
