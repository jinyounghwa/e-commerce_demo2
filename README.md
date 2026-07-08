# MallDemo

쇼핑몰 전 도메인(회원 → 상품 → 주문 → 배송 → CS) 로직을 실제 동작으로 시연하는 풀스택 데모 시스템입니다.
모든 결제·배송·CS 흐름은 가상(Mock) 시뮬레이션으로, 상태머신과 서버사이드 가격 계산기를 통해 실제 이커머스 도메인 규칙을 구현했습니다.

## 빠른 시작

```bash
# 1) 보안 설치 (postinstall 차단, better-sqlite3 만 네이티브 빌드)
bash scripts/install.sh

# 2) DB 초기화 + 시드 (멱등: 기존 DB 삭제 후 재생성)
npm run seed

# 3) 백엔드 실행 (NestJS → http://localhost:3000)
npm run dev:api

# 4) 프론트엔드 실행 (Vite → http://localhost:5173) — 새 터미널
npm run dev:web
```

브라우저에서 http://localhost:5173 접속 후 상단 "로그인" → 데모 계정 빠른 로그인 버튼 클릭.

## 데모 계정 (시드)

| 역할 | 이메일 | 비밀번호 |
|------|--------|----------|
| 관리자 | `admin@demo.com` | `demo1234` |
| 일반 회원 | `user1@demo.com` ~ `user10@demo.com` | `demo1234` |

회원 등급 분포: VIP 1명 / GOLD 1명 / SILVER 3명 / BRONZE 5명

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18 + Vite + TypeScript, TanStack Query, Zustand, Tailwind CSS |
| Backend | NestJS + TypeScript |
| Database | SQLite (better-sqlite3) + Drizzle ORM |
| Auth | JWT (`@nestjs/jwt`, USER / ADMIN 권한) |
| Validation | Zod (class-validator 미사용으로 의존성 절감) |

**프로덕션 의존성 15개** (API 10 + Web 5) — `--ignore-scripts` 보안 설치 원칙 적용.

## 모노레포 구조

```
malldemo/
├── apps/
│   ├── api/                      # NestJS 백엔드
│   │   └── src/
│   │       ├── common/           # auth.guard, state-machine, grade, zod, notify, util
│   │       ├── db/               # schema, client, migrate, seed
│   │       └── modules/          # 12 도메인 모듈
│   │           ├── auth/         # 회원가입·로그인 (JWT)
│   │           ├── account/      # 내 정보, 배송지, 쿠폰, 알림
│   │           ├── products/     # 상품·옵션·SKU, 리뷰, Q&A, 상품별 쿠폰
│   │           ├── cart/         # 장바구니
│   │           ├── wishlist/     # 위시리스트
│   │           ├── coupons/      # 쿠폰 발급(다운로드/자동/관리자지급)
│   │           ├── points/       # 포인트 원장
│   │           ├── orders/       # 견적(quote), 주문생성, Mock 결제, PriceCalculator
│   │           ├── claims/       # 취소/반품/교환 CS 엔진
│   │           ├── shipping/     # 배송 시뮬레이터 + 자동진행
│   │           ├── reviews/      # 리뷰 (블라인드/답글)
│   │           ├── qna/          # 상품 Q&A
│   │           └── admin/        # 관리자 (대시보드/카탈로그/운영)
│   └── web/                      # React 프론트엔드
│       └── src/
│           ├── components/       # StoreLayout, AdminLayout, UI 프리미티브, ProductCard
│           ├── pages/store/      # 19개 스토어 페이지
│           ├── pages/admin/      # 11개 관리자 페이지
│           └── stores/           # auth (Zustand)
├── scripts/install.sh            # 보안 설치 스크립트
├── CLAUDE.md                     # 프로젝트 가이드라인
└── SKILL.md                      # 도메인 스펙
```

## 도메인 기능

### 회원
- JWT 회원가입/로그인, 회원등급 자동 승급 (BRONZE→SILVER→GOLD→VIP, 누적결제액 기준)
- 마이페이지: 주문/클레임/쿠폰/포인트/위시리스트/배송지/알림

### 상품
- 50개 상품, 12개 카테고리(3-depth), 350+ SKU (컬러×사이즈 옵션 조합 자동 생성)
- 상품 상세: 옵션→SKU 매핑, 상세 설명 이미지, 리뷰/Q&A 탭, **상품 적용 가능 쿠폰** 섹션
- 관리자: 상품 CRUD, SKU 옵션 카테시안 자동 생성, 상세 이미지 관리, 카테고리 트리 CRUD

### 주문 & 결제 (Mock)
- 실시간 견적(quote) API: 상품금액 → 등급할인 → 쿠폰할인 → 포인트 → 배송비 → 결제금액
- 주문 생성: 트랜잭션 재고 차감, 쿠폰/포인트 소비, **가상 결제** (성공/실패 시뮬레이션)
- 결제 완료 시 배송 READY 자동 생성 + 알림 발송
- **모든 상품이 결제 완료 화면까지 진행 가능** (시드 재고 보장)

### 쿠폰
- 3가지 스코프: `ALL`(전체) / `CATEGORY`(특정 카테고리) / `PRODUCT`(특정 상품 전용)
- 발급 방식: DOWNLOAD(다운로드형) / AUTO_SIGNUP(가입자동발급) / ADMIN(관리자지급)
- 정액(FIXED) / 정률(RATE, 최대할인액 제한) / 최소주문금액 조건
- 상품 상세에서 적용 가능 쿠폰 조회 및 다운로드

### 배송 (시뮬레이터)
- 상태 흐름: `READY → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`
- 수동 진행(dispatch) 또는 자동 진행(auto-run, 10초 간격) 토글
- 배송 단계별 위치 시나리오 + 주문 상태 자동 동기화

### CS (클레임 엔진)
- 3가지 타입: 취소(CANCEL) / 반품(RETURN) / 교환(EXCHANGE)
- 반품/교환 검수 분기: **RESTOCK**(재고 복원) / **DISPOSE**(폐기)
- 부분 반품 시 비례 배분 환불 안분 (마지막 항목 잔액 보정으로 합 일치)
- 상태머신: 허용되지 않은 전이 시 409 Conflict

### 관리자
- 대시보드: 7일 매출 차트, 취소율, 재고부족 알림, 오늘 매출/주문수
- 카탈로그 관리: 상품/카테고리/SKU, 쿠폰 CRUD + 발급 통계
- 운영 관리: 주문 상태 전이, 클레임 처리(검수 모달), 배송 시뮬레이터, 회원 등급/포인트, 리뷰 블라인드/답글, Q&A 답변

## 핵심 도메인 규칙

### PriceCalculator (가격 계산 단일 진실 원천)
```
itemsTotal → 등급할인(전체 기준) → 쿠폰할인(스코프 내 기준) → 포인트(100P 단위 floor) → 배송비(5만원 이상 무료) → payAmount
```
- 서버사이드에서만 계산 (클라이언트는 quote API로 조회)
- 쿠폰 스코프별 기준액: ALL=전체, CATEGORY=해당 카테고리 상품, PRODUCT=해당 상품만
- 등급할인 비율을 스코프 기준액에 적용 후 쿠폰 할인 산출
- `itemRefund()`: 부분 반품 환불액 비례 배분 (마지막 잔액 보정)

### 상태머신
- 주문: `PENDING_PAYMENT → PAID → PREPARING → SHIPPED → DELIVERING → DELIVERED → CONFIRMED`
- 배송: `READY → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`
- 클레임: 타입별 전이 맵 (RETURN: `REQUESTED→APPROVED→COLLECTING→INSPECTING→REFUNDED`, EXCHANGE: `...→RESHIPPING→COMPLETED`)
- `assertTransition()`: 허용되지 않은 전이 → 409 Conflict

### 회원 등급 승급
| 등급 | 누적 결제액 | 포인트 적립률 | 등급 할인 |
|------|------------|--------------|----------|
| BRONZE | 기본 | 1% | 0% |
| SILVER | 30만원 | 2% | 1% |
| GOLD | 100만원 | 3% | 2% |
| VIP | 300만원 | 5% | 3% |

## 데이터베이스 스키마

20개 테이블 (SQLite, WAL 모드, 외래키 ON):

```
users, addresses, categories, products, product_options, product_option_values,
skus, cart_items, wishlists, coupons, user_coupons, orders, order_items, payments,
shipments, claims, reviews, qnas, point_ledger, notifications
```

DB 파일: `apps/api/data/malldemo.db` (시드 시 삭제 후 재생성, 멱등 보장)

## API 개요

67개 엔드포인트, 전역 프리픽스 `/api`:

| 도메인 | 주요 엔드포인트 |
|--------|----------------|
| Auth | `POST /auth/signup`, `POST /auth/login` |
| Account | `GET /me`, `GET/POST/PATCH/DELETE /me/addresses`, `GET /me/coupons`, `GET /me/notifications` |
| Products | `GET /products`, `GET /products/:id`, `GET /products/:id/coupons`, `GET /products/:id/reviews`, `GET /products/:id/qnas` |
| Cart | `GET/POST/PATCH/DELETE /cart` |
| Wishlist | `GET/POST/DELETE /wishlist` |
| Coupons | `GET /coupons/available`, `POST /coupons/:id/download` |
| Points | `GET /me/points` |
| Orders | `POST /orders/quote`, `POST /orders`, `GET /orders/:id`, `POST /orders/:id/confirm`, `POST /orders/:orderId/dispatch` |
| Claims | `POST /claims`, `GET /claims/:id`, `POST /claims/:id/advance` |
| Shipping | `POST /admin/shipments/:orderId/dispatch`, `POST /admin/shipments/auto-run` |
| Reviews | `POST /reviews`, `PATCH /admin/reviews/:id` |
| Q&A | `POST /qnas`, `PATCH /admin/qnas/:id` |
| Admin | `/admin/dashboard`, `/admin/products`, `/admin/categories`, `/admin/orders`, `/admin/coupons`, `/admin/claims`, `/admin/users`, `/admin/reviews`, `/admin/qnas`, `/admin/shipments` |

## 테스트

```bash
npm test    # vitest run
```

**55개 단위 테스트**:
- PriceCalculator (24개): 등급할인, 쿠폰(ALL/CATEGORY/PRODUCT 스코프), 포인트, 배송비, 부분 환불 안분
- 상태머신 (31개): 주문/배송/클레임 전이 허용·거부 검증

## NPM 스크립트

| 스크립트 | 설명 |
|----------|------|
| `npm run install:secure` | 보안 설치 (postinstall 차단, better-sqlite3 만 빌드) |
| `npm run seed` | DB 초기화 + 시드 (멱등) |
| `npm run dev:api` | 백엔드 개발 서버 (nodemon + ts-node, :3000) |
| `npm run dev:web` | 프론트엔드 개발 서버 (Vite, :5173, `/api` → :3000 프록시) |
| `npm run build:api` | 백엔드 빌드 |
| `npm run build:web` | 프론트엔드 빌드 |
| `npm run start:api` | 백엔드 프로덕션 실행 |
| `npm test` | 단위 테스트 실행 |

## 시드 데이터

- 회원: 관리자 1 + 일반 10 (등급 분포)
- 카테고리: 12개 (3-depth)
- 상품: 50개 (20개 옵션상품 → 350 SKU, 30개 단일 SKU)
- 쿠폰: 8종 (ALL 4 + CATEGORY 1 + PRODUCT 3 — 상품 1·2·3 전용)
- 주문: 30건 (다양한 상태 분포)
- 클레임: 3건 (반품 검수중/환불, 교환 완료)
- 리뷰 최대 25개, Q&A 10개 (미답변 3개), 알림
- 재고 보정: 모든 상품이 주문 가능하도록 보장 (품절 상품 자동 충전 + 저재고 데모 데이터)

## 설계 원칙

- **보안 설치**: `--ignore-scripts`로 postinstall 차단, better-sqlite3 네이티브 빌드만 명시 허용
- **의존성 최소화**: 프로덕션 15개 (≤30 예산), class-validator 대신 Zod 사용
- **단일 진실 원천**: 모든 금액 계산은 서버의 PriceCalculator에서만 수행
- **상태머신 기반**: 모든 상태 전이는 허용 맵으로 제어, 위반 시 409
- **멱등 시드**: DB 삭제 후 재생성으로 언제든 즉시 데모 가능
- **Mock 시뮬레이션**: 결제·배송·CS 흐름을 외부 연동 없이 상태머신으로 구현

## 배포 (Deploy)

이 프로젝트는 백엔드(NestJS + better-sqlite3)가 필요한 풀스택 앱입니다.
**Netlify는 정적 호스팅이라 API를 실행할 수 없어 404가 발생**합니다. 아래 두 가지 방법 중 선택하세요.

### 방법 A: Render 단일 배포 (권장) — 하나의 URL로 전체 동작

NestJS가 프론트엔드 빌드까지 함께 서빙하므로 서비스 1개로 끝납니다.

1. https://render.com 가입 후 **New → Web Service** (또는 Blueprint로 `render.yaml` 연결)
2. 레포지토리 연결: `https://github.com/jinyounghwa/e-commerce_demo2.git`
3. 설정:
   - **Build Command**: `npm run build:api && npm run build:web`
   - **Start Command**: `node apps/api/dist/main.js`
   - **Environment**: `Node`, **Plan**: `Free`
4. 배포 완료 후 발급된 URL(예: `https://malldemo.onrender.com`) 접속

> 무료 플랜은 15분 비활성 후 슬립됩니다. 재접속 시 콜드스타트(~30초) 후 자동 재시드되어 즉시 데모 가능합니다.

### 방법 B: Netlify(프론트) + Render(백엔드) 분리 배포

이미 Netlify를 설정한 경우, 백엔드만 별도 배포하고 프론트엔드에서 가리키게 합니다.

1. **백엔드**: 위 방법 A와 동일하게 Render에 배포 (Start Command 동일)
2. **프론트엔드**: Netlify에 배포 — `netlify.toml`이 자동 적용됨
   - Build command: `npm run build:web`
   - Publish directory: `apps/web/dist`
3. **환경변수 연결**: Netlify 대시보드 → Site settings → Environment variables에 추가:
   - `VITE_API_BASE` = `https://malldemo.onrender.com/api` (Render 백엔드 URL + `/api`)
4. Netlify 재배포 → 프론트엔드가 Render 백엔드를 호출

### 로컬 프로덕션 빌드 확인

```bash
npm run build:api && npm run build:web   # 양쪽 빌드
PORT=3000 node apps/api/dist/main.js     # 단일 서버 실행 (API + 프론트)
# → http://localhost:3000 접속 (전체 동작)
```

---

자세한 스펙은 `CLAUDE.md`(프로젝트 가이드라인)와 `SKILL.md`(도메인 스펙) 참조.
