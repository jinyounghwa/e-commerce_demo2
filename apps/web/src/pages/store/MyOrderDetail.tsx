import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Order } from '../../api';
import { Spinner, Empty, StatusBadge, Modal, Stars, ErrorMsg } from '../../components/ui';
import { won, date, dateOnly, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR, SHIPMENT_STATUS_LABEL, CLAIM_STATUS_LABEL } from '../../lib/format';

export default function MyOrderDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: order, isLoading } = useQuery({ queryKey: ['order', id], queryFn: () => api(`/orders/${id}`).get<Order>(), enabled: !!id });
  const { data: ship } = useQuery({ queryKey: ['shipment', id], queryFn: () => api(`/orders/${id}/shipment`).get<any>(), enabled: !!id, retry: false });
  const { data: claims } = useQuery({ queryKey: ['claims'], queryFn: () => api('/claims').get<any[]>() });
  const [claimModal, setClaimModal] = useState<{ itemId: number; type: string } | null>(null);
  const [reviewModal, setReviewModal] = useState<number | null>(null);

  const confirmMut = useMutation({ mutationFn: () => api(`/orders/${id}/confirm`).post({}), onSuccess: (d) => { qc.invalidateQueries({ queryKey: ['order', id] }); qc.invalidateQueries({ queryKey: ['me'] }); alert(`${d.earnedPoints}P 적립!`); } });

  if (isLoading) return <Spinner />;
  if (!order) return <Empty text="주문을 찾을 수 없습니다." />;

  const canConfirm = order.status === 'DELIVERED';
  const orderClaims = claims?.filter((c) => c.orderId === order.id) ?? [];

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{order.orderNo}</h1>
            <span className="text-sm text-gray-400">{date(order.createdAt)}</span>
          </div>
          <StatusBadge label={ORDER_STATUS_LABEL[order.status]} color={ORDER_STATUS_COLOR[order.status]} />
        </div>
      </div>

      {/* 배송 타임라인 */}
      {ship && (
        <div className="card p-4">
          <h2 className="font-bold mb-3">배송 조회 <span className="text-sm font-normal text-gray-400">({ship.trackingNo})</span></h2>
          <div className="space-y-0">
            {ship.events.map((ev: any, i: number) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${i === ship.events.length - 1 ? 'bg-brand-600' : 'bg-gray-300'}`} />
                  {i < ship.events.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 min-h-[2rem]" />}
                </div>
                <div className="pb-4">
                  <div className="font-medium text-sm">{SHIPMENT_STATUS_LABEL[ev.status] ?? ev.status}</div>
                  <div className="text-xs text-gray-400">{ev.location} · {date(ev.at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 주문 상품 */}
      <div className="card p-4">
        <h2 className="font-bold mb-3">주문 상품</h2>
        {order.items?.map((it: any) => {
          const cl = orderClaims.find((c) => c.orderItemId === it.id);
          return (
            <div key={it.id} className="flex items-center gap-3 py-3 border-b last:border-0">
              <img src={it.thumbnailUrl} className="w-16 h-16 object-cover rounded" alt="" />
              <div className="flex-1">
                <div className="font-medium">{it.productName}</div>
                <div className="text-sm text-gray-500">{it.optionLabel} × {it.quantity} · {won(it.unitPrice)}</div>
                {cl && <span className="badge bg-amber-100 text-amber-700 text-xs mt-1">{cl.type} {CLAIM_STATUS_LABEL[cl.status]}</span>}
              </div>
              <div className="flex flex-col gap-1">
                {(order.status === 'DELIVERED' || order.status === 'CONFIRMED') && !cl && (
                  <>
                    <button className="btn-outline btn-sm" onClick={() => setReviewModal(it.id)}>리뷰작성</button>
                    <button className="btn-outline btn-sm" onClick={() => setClaimModal({ itemId: it.id, type: 'RETURN' })}>반품/교환</button>
                  </>
                )}
                {(order.status === 'PAID' || order.status === 'PREPARING') && !cl && (
                  <button className="btn-outline btn-sm" onClick={() => setClaimModal({ itemId: it.id, type: 'CANCEL' })}>취소신청</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 결제 금액 */}
      <div className="card p-4">
        <h2 className="font-bold mb-3">결제 정보</h2>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span>상품금액</span><span>{won(order.itemsTotal)}</span></div>
          {order.gradeDiscount > 0 && <div className="flex justify-between text-green-600"><span>등급할인</span><span>-{won(order.gradeDiscount)}</span></div>}
          {order.couponDiscount > 0 && <div className="flex justify-between text-green-600"><span>쿠폰할인</span><span>-{won(order.couponDiscount)}</span></div>}
          {order.pointsUsed > 0 && <div className="flex justify-between text-green-600"><span>포인트</span><span>-{won(order.pointsUsed)}</span></div>}
          <div className="flex justify-between"><span>배송비</span><span>{order.shippingFee === 0 ? '무료' : won(order.shippingFee)}</span></div>
          <div className="flex justify-between font-bold text-brand-600 text-lg border-t pt-2 mt-2"><span>결제금액</span><span>{won(order.payAmount)}</span></div>
        </div>
        <div className="text-xs text-gray-400 mt-2">배송지: {order.receiver} · {order.addr1} {order.addr2}</div>
      </div>

      {canConfirm && (
        <button className="btn-primary w-full" onClick={() => confirmMut.mutate()} disabled={confirmMut.isPending}>구매 확정 (포인트 적립)</button>
      )}

      {claimModal && <ClaimForm orderId={order.id} itemId={claimModal.itemId} type={claimModal.type} onClose={() => setClaimModal(null)} onDone={() => { setClaimModal(null); qc.invalidateQueries({ queryKey: ['claims'] }); qc.invalidateQueries({ queryKey: ['order', id] }); }} />}
      {reviewModal && <ReviewForm orderItemId={reviewModal} onClose={() => setReviewModal(null)} onDone={() => { setReviewModal(null); qc.invalidateQueries({ queryKey: ['order', id] }); }} />}
    </div>
  );
}

function ClaimForm({ orderId, itemId, type, onClose, onDone }: any) {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const mut = useMutation({ mutationFn: (b: any) => api('/claims').post(b), onSuccess: () => { alert('접수되었습니다.'); onDone(); } });
  return (
    <Modal open onClose={onClose} title={`${type === 'CANCEL' ? '취소' : type === 'RETURN' ? '반품' : '교환'} 신청`}>
      <div className="space-y-3">
        <div><label className="text-sm">사유</label>
          <select className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">선택</option>
            <option>단순 변심</option><option>상품 불량</option><option>배송 지연</option><option>색상/사이즈 변경</option><option>기타</option>
          </select>
        </div>
        <textarea className="input" rows={3} placeholder="상세 사유" value={detail} onChange={(e) => setDetail(e.target.value)} />
        <button className="btn-primary w-full" disabled={!reason || mut.isPending} onClick={() => mut.mutate({ orderId, orderItemId: itemId, type, reason, detail })}>신청하기</button>
      </div>
    </Modal>
  );
}

function ReviewForm({ orderItemId, onClose, onDone }: any) {
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const mut = useMutation({ mutationFn: (b: any) => api('/reviews').post(b), onSuccess: () => { alert('리뷰 등록!'); onDone(); } });
  return (
    <Modal open onClose={onClose} title="리뷰 작성">
      <div className="space-y-3">
        <div className="flex gap-1 text-2xl">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setRating(n)} className={n <= rating ? 'text-yellow-400' : 'text-gray-300'}>★</button>)}</div>
        <textarea className="input" rows={4} placeholder="리뷰 내용 (5자 이상)" value={content} onChange={(e) => setContent(e.target.value)} />
        <button className="btn-primary w-full" disabled={content.length < 5 || mut.isPending} onClick={() => mut.mutate({ orderItemId, rating, content })}>등록</button>
      </div>
    </Modal>
  );
}
