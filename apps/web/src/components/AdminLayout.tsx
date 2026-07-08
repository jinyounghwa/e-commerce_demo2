import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../stores/auth';

const menu = [
  { to: '/admin', label: '대시보드', end: true },
  { to: '/admin/products', label: '상품관리' },
  { to: '/admin/categories', label: '카테고리' },
  { to: '/admin/orders', label: '주문관리' },
  { to: '/admin/shipping', label: '배송관리' },
  { to: '/admin/coupons', label: '쿠폰관리' },
  { to: '/admin/claims', label: 'CS관리' },
  { to: '/admin/users', label: '회원관리' },
  { to: '/admin/reviews', label: '리뷰' },
  { to: '/admin/qnas', label: 'Q&A' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const onLogout = () => { logout(); qc.clear(); nav('/'); };
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-gray-900 text-gray-300 flex flex-col">
        <div className="p-4 font-bold text-white border-b border-gray-700">MallDemo Admin</div>
        <nav className="flex-1 p-2 space-y-0.5 text-sm overflow-y-auto">
          {menu.map((m) => (
            <NavLink key={m.to} to={m.to} end={m.end}
              className={({isActive}) => `block px-3 py-2 rounded ${isActive ? 'bg-brand-600 text-white' : 'hover:bg-gray-800'}`}>
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-700 text-xs">
          <div className="mb-2">{user?.name} ({user?.role})</div>
          <Link to="/" className="block hover:text-white mb-1">← 스토어로</Link>
          <button onClick={onLogout} className="hover:text-white">로그아웃</button>
        </div>
      </aside>
      <main className="flex-1 bg-gray-50 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
