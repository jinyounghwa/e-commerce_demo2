import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser { id: number; email: string; name: string; role: 'USER' | 'ADMIN'; grade: string; pointBalance: number; }
interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  updateUser: (u: Partial<AuthUser>) => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      updateUser: (u) => set({ user: get().user ? { ...get().user!, ...u } : null }),
    }),
    { name: 'malldemo-auth' },
  ),
);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
