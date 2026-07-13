import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { Button } from './ui/button'

type ThemeMode = 'light' | 'dark'

function getInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  // 未設定・旧 'auto' はシステム設定から初期値を解決する
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeMode(mode: ThemeMode) {
  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(mode)
  document.documentElement.setAttribute('data-theme', mode)
  document.documentElement.style.colorScheme = mode
}

const icons: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
}

const labels: Record<ThemeMode, string> = {
  light: 'ライトモード',
  dark: 'ダークモード',
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('light')

  useEffect(() => {
    const initialMode = getInitialMode()
    setMode(initialMode)
    applyThemeMode(initialMode)
  }, [])

  function toggleMode() {
    const next: ThemeMode = mode === 'light' ? 'dark' : 'light'
    setMode(next)
    applyThemeMode(next)
    window.localStorage.setItem('theme', next)
  }

  const Icon = icons[mode]

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleMode}
      title={labels[mode]}
      aria-label={labels[mode]}
    >
      <Icon className="size-4" />
    </Button>
  )
}
