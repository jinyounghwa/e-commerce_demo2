import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, Order } from '../../api';
import { Spinner, Empty, StatusBadge } from '../../components/ui';
import { won, date, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '../../lib/format';

export default function MyOrders() {
  const { data, isLoading } = useQuery({ queryKey: ['orders'], queryFn: () => api('/orders').get<Order[]>() });
  if (isLoading) return <Spinner />;
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">주문 내역</h1>
      {!data?.length ? <Empty text="주문 내역이 없습니다." /> : (
        <div className="space-y-3">
          {data.map((o) => (
            <Link key={o.id} to={`/my/orders/${o.id}`} className="card p-4 block hover:shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{o.orderNo}</span>
                  <StatusBadge label={ORDER_STATUS_LABEL[o.status]} color={ORDER_STATUS_COLOR[o.status]} />
                </div>
                <span className="text-sm text-gray-400">{date(o.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2 mt-3">
                {o.items?.slice(0, 3).map((it: any) => (
                  <img key={it.id} src={it.thumbnailUrl} className="w-12 h-12 object-cover rounded" alt="" />
                ))}
                <div className="text-sm text-gray-500">{o.items?.[0]?.productName}{(o.items?.length ?? 0) > 1 && ` 외 ${o.items!.length - 1}건`}</div>
              </div>
              <div className="text-right mt-2 font-bold text-brand-600">{won(o.payAmount)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
