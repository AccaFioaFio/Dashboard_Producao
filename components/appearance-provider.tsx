'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  parseAppearance,
  type Appearance,
  type LayoutId,
  type ThemeId,
} from '@/lib/appearance'

type AppearanceContextValue = Appearance & {
  setTheme: (theme: ThemeId) => void
  setLayout: (layout: LayoutId) => void
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)

function readStored(): Appearance {
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY)
    return parseAppearance(raw ? JSON.parse(raw) : null)
  } catch {
    return DEFAULT_APPEARANCE
  }
}

function applyAppearance(next: Appearance) {
  const root = document.documentElement
  root.setAttribute('data-theme', next.theme)
  root.setAttribute('data-layout', next.layout)
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)

  useEffect(() => {
    const stored = readStored()
    setAppearance(stored)
    applyAppearance(stored)
  }, [])

  const commit = useCallback((next: Appearance) => {
    setAppearance(next)
    applyAppearance(next)
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next))
  }, [])

  const value = useMemo<AppearanceContextValue>(
    () => ({
      ...appearance,
      setTheme: (theme) => commit({ ...appearance, theme }),
      setLayout: (layout) => commit({ ...appearance, layout }),
    }),
    [appearance, commit],
  )

  return (
    <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
  )
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext)
  if (!ctx) {
    throw new Error('useAppearance must be used within AppearanceProvider')
  }
  return ctx
}
