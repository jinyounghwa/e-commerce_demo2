import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './stores/auth';
import StoreLayout from './components/StoreLayout';
import AdminLayout from './components/AdminLayout';

import Home from './pages/store/Home';
import ProductList from './pages/store/ProductList';
import ProductDetail from './pages/store/ProductDetail';
import Cart from './pages/store/Cart';
import Checkout from './pages/store/Checkout';
import OrderComplete from './pages/store/OrderComplete';
import Login from './pages/store/Login';
import Signup from './pages/store/Signup';
import CouponZone from './pages/store/CouponZone';
import Wishlist from './pages/store/Wishlist';
import MyPage from './pages/store/MyPage';
import MyOrders from './pages/store/MyOrders';
import MyOrderDetail from './pages/store/MyOrderDetail';
import MyClaims from './pages/store/MyClaims';
import MyCoupons from './pages/store/MyCoupons';
import MyPoints from './pages/store/MyPoints';
import MyAddresses from './pages/store/MyAddresses';
import MyNotifications from './pages/store/MyNotifications';

import Dashboard from './pages/admin/Dashboard';
import AdminProducts from './pages/admin/AdminProducts';
import AdminProductEdit from './pages/admin/AdminProductEdit';
import AdminCategories from './pages/admin/AdminCategories';
import AdminOrders from './pages/admin/AdminOrders';
import AdminShipping from './pages/admin/AdminShipping';
import AdminCoupons from './pages/admin/AdminCoupons';
import AdminClaims from './pages/admin/AdminClaims';
import AdminUsers from './pages/admin/AdminUsers';
import AdminReviews from './pages/admin/AdminReviews';
import AdminQnas from './pages/admin/AdminQnas';

function RequireUser({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (user.role !== 'ADMIN') return <Navigate to="/" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<StoreLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/category/:id" element={<ProductList />} />
        <Route path="/products" element={<ProductList />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/cart" element={<RequireUser><Cart /></RequireUser>} />
        <Route path="/checkout" element={<RequireUser><Checkout /></RequireUser>} />
        <Route path="/orders/:id/complete" element={<RequireUser><OrderComplete /></RequireUser>} />
        <Route path="/coupons" element={<RequireUser><CouponZone /></RequireUser>} />
        <Route path="/wishlist" element={<RequireUser><Wishlist /></RequireUser>} />
        <Route path="/my" element={<RequireUser><MyPage /></RequireUser>} />
        <Route path="/my/orders" element={<RequireUser><MyOrders /></RequireUser>} />
        <Route path="/my/orders/:id" element={<RequireUser><MyOrderDetail /></RequireUser>} />
        <Route path="/my/claims" element={<RequireUser><MyClaims /></RequireUser>} />
        <Route path="/my/coupons" element={<RequireUser><MyCoupons /></RequireUser>} />
        <Route path="/my/points" element={<RequireUser><MyPoints /></RequireUser>} />
        <Route path="/my/addresses" element={<RequireUser><MyAddresses /></RequireUser>} />
        <Route path="/my/notifications" element={<RequireUser><MyNotifications /></RequireUser>} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Route>
      <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="products/new" element={<AdminProductEdit />} />
        <Route path="products/:id" element={<AdminProductEdit />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="shipping" element={<AdminShipping />} />
        <Route path="coupons" element={<AdminCoupons />} />
        <Route path="claims" element={<AdminClaims />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="reviews" element={<AdminReviews />} />
        <Route path="qnas" element={<AdminQnas />} />
      </Route>
    </Routes>
  );
}
