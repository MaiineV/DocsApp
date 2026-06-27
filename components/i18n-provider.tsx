'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionaries/es'

type I18nValue = { locale: Locale; t: Dictionary }

const I18nContext = createContext<I18nValue | null>(null)

// Sembrado en el layout raíz con el locale activo + su diccionario (solo viaja
// al cliente el diccionario del locale activo, no ambos).
export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale
  dict: Dictionary
  children: ReactNode
}) {
  return <I18nContext.Provider value={{ locale, t: dict }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n debe usarse dentro de <I18nProvider>')
  return ctx
}
