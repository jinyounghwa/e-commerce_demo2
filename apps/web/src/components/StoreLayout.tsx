import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, authApi } from '../api';
import { useAuth } from '../stores/auth';
import { num } from '../lib/format';

export default function StoreLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: cart } = useQuery({ queryKey: ['cart'], queryFn: () => api('/cart').get<any[]>(), enabled: !!user && user.role === 'USER' });
  const { data: notis } = useQuery({ queryKey: ['noti-count'], queryFn: async () => { const r = await api('/me/notifications').get<any[]>(); return r.filter((n) => !n.isRead).length; }, enabled: !!user && user.role === 'USER', refetchInterval: 15000 });

  const onLogout = () => { logout(); qc.clear(); nav('/'); };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link to="/" className="font-bold text-xl text-brand-600">MallDemo</Link>
          <nav className="hidden md:flex gap-4 text-sm">
            <NavLink to="/" className={({isActive}) => isActive ? 'text-brand-600 font-medium' : 'text-gray-600'} end>홈</NavLink>
            <NavLink to="/coupons" className={({isActive}) => isActive ? 'text-brand-600 font-medium' : 'text-gray-600'}>쿠폰존</NavLink>
            {user && <NavLink to="/my" className={({isActive}) => isActive ? 'text-brand-600 font-medium' : 'text-gray-600'}>마이페이지</NavLink>}
            {user?.role === 'ADMIN' && <Link to="/admin" className="text-gray-600">관리자</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user?.role === 'USER' && (
              <>
                <Link to="/cart" className="relative hover:text-brand-600">장바구니{cart?.length ? <span className="ml-1 badge bg-brand-600 text-white">{cart.length}</span> : null}</Link>
                <Link to="/wishlist" className="hover:text-brand-600">찜</Link>
                <Link to="/my/notifications" className="relative hover:text-brand-600">알림{notis ? <span className="ml-1 badge bg-red-500 text-white">{notis}</span> : null}</Link>
                <span className="text-gray-500">{user.name} · {num(user.pointBalance)}P</span>
                <button onClick={onLogout} className="text-gray-400 hover:text-gray-600">로그아웃</button>
              </>
            )}
            {user?.role === 'ADMIN' && <button onClick={onLogout} className="text-gray-400 hover:text-gray-600">로그아웃</button>}
            {!user && <Link to="/login" className="btn-primary btn-sm">로그인</Link>}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t bg-white py-4 text-center text-xs text-gray-400">
        MallDemo — 쇼핑몰 풀로직 데모 (결제/배송/CS 전부 가상 시뮬레이션)
      </footer>
    </div>
  );
}
