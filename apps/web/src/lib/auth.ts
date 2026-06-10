import { createServerFn } from '@tanstack/react-start'
import { getCookies } from '@tanstack/react-start/server'
import createClient from 'openapi-fetch'
import type { paths } from '../api/schema'
import type { components } from '../api/schema'

export type User = components['schemas']['UserResponse']

export const getUser = createServerFn().handler(async (): Promise<User | null> => {
  const cookies = getCookies()
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')

  const client = createClient<paths>({
    baseUrl: globalThis.process?.env.SERVER_URL ?? 'http://localhost:8080',
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  })

  const { data } = await client.GET('/v1/auth/me')
  return data ?? null
})
