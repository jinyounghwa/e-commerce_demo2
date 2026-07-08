// 공통 헬퍼
export function nowISO(): string {
  return new Date().toISOString();
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function randomTrackingNo(): string {
  return 'VT' + Math.random().toString().slice(2, 12).padEnd(10, '0').slice(0, 10);
}

// 주문번호: ORD-YYYYMMDD-NNNN
export function makeOrderNo(seq: number, date = new Date()): string {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `ORD-${ymd}-${String(seq).padStart(4, '0')}`;
}

// 0~max 사이 정수 (max 포함)
export function randInt(max: number): number {
  return Math.floor(Math.random() * (max + 1));
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function floor(n: number): number {
  return Math.floor(n);
}
