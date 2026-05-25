import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export interface AdminProfile {
  id: string;
  email: string;
  displayName?: string;
  role: 'admin' | 'super_admin';
  isActive: boolean;
}

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: AdminProfile | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
