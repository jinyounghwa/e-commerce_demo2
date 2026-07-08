import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, Order } from '../../api';
import { Spinner } from '../../components/ui';
import { won, ORDER_STATUS_LABEL } from '../../lib/format';

export default function OrderComplete() {
  const { id } = useParams();
  const loc = useLocation() as any;
  const { data: order, isLoading } = useQuery({ queryKey: ['order', id], queryFn: () => api(`/orders/${id}`).get<Order>(), enabled: !!id });
  const failed = loc.state?.status === 'PAYMENT_FAILED';

  if (isLoading) return <Spinner />;
  return (
    <div className="max-w-md mx-auto py-12 text-center">
      {failed ? (
        <>
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-2xl font-bold mb-2">결제 실패</h1>
          <p className="text-gray-500 mb-6">결제가 실패하여 주문이 완료되지 않았습니다. (재고는 복원됨)</p>
        </>
      ) : (
        <>
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-2">주문 완료</h1>
          <p className="text-gray-500 mb-6">{order?.orderNo} 주문이 완료되었습니다. ({ORDER_STATUS_LABEL[order?.status ?? '']})</p>
        </>
      )}
      <div className="flex justify-center gap-3">
        <Link to="/my/orders" className="btn-primary">주문 내역 보기</Link>
        <Link to="/" className="btn-outline">쇼핑 계속하기</Link>
      </div>
    </div>
  );
}
