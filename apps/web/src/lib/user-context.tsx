import { createContext, useContext } from 'react'
import type { User } from './auth'

const UserContext = createContext<User | null>(null)

export const UserProvider = UserContext.Provider

export function useUser(): User | null {
  return useContext(UserContext)
}
