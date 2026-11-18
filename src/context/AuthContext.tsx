import React, { createContext, useContext, useState } from 'react';
import { AuthUser, AuthorizedAccount } from '../types';

// Display profile only. Authentication is enforced by the Node server on every route.
const initialUser: AuthUser = { id: 'private-owner', name: 'Private User', email: 'owner@localhost', plan: 'pro', role: 'member', provider: 'guest', expiresAt: null, durationLabel: 'Self-hosted' };
interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authorizedUsers: AuthorizedAccount[];
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password?: string) => Promise<void>;
  addAuthorizedAccount: (account: Omit<AuthorizedAccount, 'id' | 'createdAt'> & { id?: string }) => AuthorizedAccount;
  deleteAuthorizedAccount: (idOrEmail: string) => void;
  extendUserDuration: (idOrEmail: string, additionalDays: number) => void;
  logout: () => void;
  updateUser: (updates: Partial<AuthUser>) => void;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const disabled = () => { throw new Error('Account management is disabled in this private instance'); };
  const logout = () => {
    fetch(`${import.meta.env.BASE_URL}api/logout`, { method: 'POST' }).finally(() => window.location.reload());
  };
  return <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false, authorizedUsers: [], loginWithGoogle: async () => disabled(), loginWithEmail: async () => disabled(), addAuthorizedAccount: disabled, deleteAuthorizedAccount: disabled, extendUserDuration: disabled, logout, updateUser: updates => setUser(prev => ({ ...initialUser, ...prev, ...updates })) }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
