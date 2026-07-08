# SPRINT 완료 보고 — MallDemo

> CLAUDE.md 마일스톤(S1~S6) 전 스프린트 구현 완료. 모든 성공 지표 검증됨.

## 실행 방법

```bash
bash scripts/install.sh   # 보안 설치 (postinstall 차단, better-sqlite3만 빌드)
npm run seed              # DB 초기화 + 시드 (멱등)
npm run dev:api           # NestJS :3000
npm run dev:web           # Vite :5173 (프록시 → :3000)
npm test                  # vitest 단위 테스트 (52개)
```

**데모 계정**: `admin@demo.com` / `user1~10@demo.com` (비밀번호 `demo1234`)

---

## 스프린트별 구현 현황

| Sprint | 범위 | 상태 | 비고 |
|---|---|---|---|
| S1 | DB 스키마 + 시드 + 인증 + 상품 | ✅ | Drizzle 스키마 18테이블, 시드(상품50/회원10/주문30), JWT 인증, 상품 목록/필터/정렬/상세 |
| S2 | 장바구니 + 주문/Mock결제 + PriceCalculator | ✅ | 트랜잭션 재고차감, Mock 결제(성공/실패), quote 단일 소스 계산 |
| S3 | 쿠폰 + 포인트 + 회원등급 | ✅ | 다운로드/자동/관리발급, lazy 만료, 등급별 할인/적립, 원장 방식 |
| S4 | 관리자(상품/주문/배송 시뮬레이터) | ✅ | SKU 카테시안 자동생성, 상태머신 주문 전이, 시간 가속 시뮬레이터+자동진행 |
| S5 | CS(취소/반품/교환/양품화) + 리뷰/Q&A + 알림 | ✅ | 검수→RESTOCK(재고복원)/DISPOSE 분기, 환불 안분, 인앱 알림 |
| S6 | 대시보드 + 폴리싱 | ✅ | 7일 매출 차트, 취소율, 재고부족 알림, 전 화면 Tailwind UI |

## 성공 지표 검증 (CLAUDE.md §6)

- [x] 시드 후 5분 내 "가입→쿠폰→장바구니→주문→출고→배송완료→리뷰" 전 과정 시연 (E2E 자동화 검증 완료)
- [x] 반품 신청 → 검수 → 양품화(재고 복원) / 폐기 분기 동작 (재고 15→17 복원 검증)
- [x] 쿠폰+포인트+등급할인 조합 금액 계산 서버/프론트 일치 (quote API 단일 소스, 21개 단위테스트)
- [x] 불허 상태 전이 시도 시 API 409 차단 (CONFIRMED→SHIPPED 등 409 검증)
- [x] 전체 의존성 30개 이하 (프로덕션 15개: API 10 + Web 5)

## 핵심 설계 원칙 구현 (CLAUDE.md §5)

1. **상태머신 중심** — `common/state-machine.ts`에 주문/배송/클레임 전이표 명시, `assertTransition`으로 불허 전이 409 차단 (31개 전이 테스트)
2. **금액 계산 단일 소스** — `orders/price-calculator.ts`의 `PriceCalculator`가 서버에서만 계산, 프론트는 `/orders/quote` 응답 표시만
3. **재고 정합성** — `UPDATE skus SET stock=stock-? WHERE id=? AND stock>=?` 패턴 + 트랜잭션, 주문 차감/취소·양품화 복원
4. **시드 데이터 완비** — `npm run seed` 1회로 즉시 시연 가능 (멱등: DB 삭제 후 재생성)
5. **시간 가속 시뮬레이터** — `[다음 단계 ▶]` 버튼 + `[자동 진행]` 토글(10초 간격)

## 테스트 (SKILL.md §13)

- `price-calculator.test.ts` — 21개: 등급×쿠폰(정액/정률/카테고리/최소주문)×포인트 조합, 원단위 오차 0, 환불 안분 합계=원결제액
- `state-machine.test.ts` — 31개: 주문/배송/클레임 허용·불허 전이 전수

## API 엔드포인트 (SKILL.md §9)

Auth/Account · Store(products/cart/wishlist/coupons/orders/claims/reviews/qna) · Admin(dashboard/catalog/orders/shipping/coupons/claims/users/reviews/qnas) — 총 50+ 엔드포인트 구현.

## 화면 (SKILL.md §10)

- **Store**: 홈, 카테고리/목록, 상세(옵션→SKU/리뷰/Q&A탭), 장바구니, 주문서(quote 실시간), 주문완료, 마이페이지(주문/배송추적/클레임/쿠폰/포인트/배송지/알림), 찜, 쿠폰존, 로그인/가입
- **Admin**: 대시보드, 상품관리(등록/SKU자동생성/재고), 카테고리, 주문(상태전이), 배송 시뮬레이터, 쿠폰, CS(검수 분기 UI), 회원, 리뷰, Q&A
