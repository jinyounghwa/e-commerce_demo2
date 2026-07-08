import { ReactNode } from 'react';

export function Spinner({ label }: { label?: string }) {
  return <div className="flex items-center justify-center py-10 text-gray-400">
    <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
    {label ?? '불러오는 중...'}
  </div>;
}

export function Empty({ text }: { text: string }) {
  return <div className="text-center py-16 text-gray-400">{text}</div>;
}

export function StatusBadge({ label, color }: { label: string; color: string }) {
  return <span className={`badge ${color}`}>{label}</span>;
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function ErrorMsg({ msg }: { msg?: string | null }) {
  if (!msg) return null;
  return <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-3">{msg}</div>;
}

export function Stars({ rating, size = 'text-sm' }: { rating: number; size?: string }) {
  return <span className={size}>{'★'.repeat(Math.round(rating))}<span className="text-gray-300">{'★'.repeat(5 - Math.round(rating))}</span></span>;
}
