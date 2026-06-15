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

  const baseUrl = globalThis.process?.env.SERVER_URL ?? 'http://localhost:8080'
  console.log('[getUser] baseUrl:', baseUrl, '| cookies:', Object.keys(cookies).join(', ') || '(none)')

  const client = createClient<paths>({
    baseUrl,
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  })

  try {
    const { data, error, response } = await client.GET('/v1/auth/me')
    console.log('[getUser] status:', response?.status, '| data:', !!data, '| error:', error)
    return data ?? null
  } catch (e) {
    console.error('[getUser] fetch error:', e)
    return null
  }
})
