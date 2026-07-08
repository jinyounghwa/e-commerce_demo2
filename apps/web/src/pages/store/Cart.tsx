import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, CartItem } from '../../api';
import { Spinner, Empty } from '../../components/ui';
import { won } from '../../lib/format';

export default function Cart() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: cart, isLoading } = useQuery({ queryKey: ['cart'], queryFn: () => api('/cart').get<CartItem[]>() });

  const upd = useMutation({ mutationFn: (b: { id: number; quantity: number }) => api('/cart').patch(b, `/${b.id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }) });
  const del = useMutation({ mutationFn: (id: number) => api('/cart').del(`/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }) });

  if (isLoading) return <Spinner />;
  const total = (cart ?? []).reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">장바구니</h1>
      {!cart?.length ? <Empty text="장바구니가 비었습니다." /> : (
        <>
          <div className="space-y-3">
            {cart.map((i) => (
              <div key={i.id} className="card p-4 flex items-center gap-4">
                <img src={i.thumbnailUrl} alt="" className="w-20 h-20 object-cover rounded" />
                <div className="flex-1">
                  <div className="font-medium">{i.productName}</div>
                  <div className="text-sm text-gray-500">{i.optionLabel}</div>
                  <div className="text-sm text-brand-600 font-medium">{won(i.unitPrice)}</div>
                  {i.isSoldOut && <span className="badge bg-red-100 text-red-600 text-xs">품절</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-outline btn-sm" onClick={() => upd.mutate({ id: i.id, quantity: Math.max(1, i.quantity - 1) })}>-</button>
                  <span className="w-8 text-center">{i.quantity}</span>
                  <button className="btn-outline btn-sm" onClick={() => upd.mutate({ id: i.id, quantity: i.quantity + 1 })}>+</button>
                </div>
                <div className="w-24 text-right font-medium">{won(i.unitPrice * i.quantity)}</div>
                <button className="text-gray-400 hover:text-red-500" onClick={() => del.mutate(i.id)}>✕</button>
              </div>
            ))}
          </div>
          <div className="card p-4 mt-4 flex items-center justify-between">
            <span className="text-lg">총 상품금액</span>
            <span className="text-2xl font-bold text-brand-600">{won(total)}</span>
          </div>
          <div className="flex justify-end mt-4">
            <button className="btn-primary" onClick={() => nav('/checkout')} disabled={!cart.filter((i) => !i.isSoldOut).length}>주문하기</button>
          </div>
        </>
      )}
    </div>
  );
}
