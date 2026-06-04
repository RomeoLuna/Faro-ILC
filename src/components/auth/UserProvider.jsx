// components/auth/UserProvider.jsx
'use client';
import { createContext, useContext } from 'react';

const UserContext = createContext(null);

export function UserProvider({ value, children }) {
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
export function useUser() { return useContext(UserContext); }

export function useCanSignCalibration() {
  const ctx = useUser();
  const role = ctx?.profile?.role;
  return role === 'admin' || role === 'tecnico';
}
export function useHasRole(...allowed) {
  const ctx = useUser();
  return allowed.includes(ctx?.profile?.role);
}