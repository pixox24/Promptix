import { createContext, useContext, type ReactNode } from 'react';
import { useUserLibrary, type UserLibrary } from '../hooks/useUserLibrary';

const UserLibraryContext = createContext<UserLibrary | null>(null);

export function UserLibraryProvider({ children }: { children: ReactNode }) {
  const library = useUserLibrary();
  return (
    <UserLibraryContext.Provider value={library}>
      {children}
    </UserLibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(UserLibraryContext);
  if (!ctx) {
    throw new Error('useLibrary must be used within UserLibraryProvider');
  }
  return ctx;
}
