import { HeadContent, Outlet, Scripts, createRootRoute, redirect, useLocation } from '@tanstack/react-router'
import { UserProvider } from '../lib/user-context'
import { getUser } from '../lib/auth'

import appCss from '../globals.css?url'

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'HyperDrive' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  beforeLoad: async ({ location }) => {
    let user = null
    try {
      user = await getUser()
    } catch {
      // バックエンドに接続できない場合は未認証として扱う
    }
    const isPublicPage = location.pathname === '/login' || location.pathname === '/register'
    if (!user && !isPublicPage) {
      throw redirect({ to: '/login' })
    }
    if (user && isPublicPage) {
      throw redirect({ to: '/' })
    }
    return { user }
  },
  shellComponent: RootDocument,
  component: RootLayout,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(79,184,178,0.24)]">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootLayout() {
  const { user } = Route.useRouteContext()
  const location = useLocation()
  const isPublicPage = location.pathname === '/login' || location.pathname === '/register'

  if (isPublicPage || !user) {
    return <Outlet />
  }

  return <UserProvider value={user}><Outlet /></UserProvider>
}
