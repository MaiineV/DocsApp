import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { locales, defaultLocale, LOCALE_COOKIE, type Locale } from './config'
import { es, type Dictionary } from './dictionaries/es'
import { en } from './dictionaries/en'

const dictionaries: Record<Locale, Dictionary> = { es, en }

export type { Locale } from './config'
export type { Dictionary } from './dictionaries/es'

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale]
}

function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

// "en-US,en;q=0.9,es;q=0.8" → ordena por q y devuelve el primer idioma soportado.
export function parseAcceptLanguage(header: string | null): Locale {
  if (!header) return defaultLocale
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=')
      return { base: tag.split('-')[0].toLowerCase(), q: q ? parseFloat(q) : 1 }
    })
    .sort((a, b) => b.q - a.q)
  for (const { base } of ranked) {
    if (isLocale(base)) return base
  }
  return defaultLocale
}

// Locale activo: cookie (para un switcher futuro) → Accept-Language → default.
// `cache` deduplica dentro del mismo render pass.
export const getLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies()
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value
  if (fromCookie && isLocale(fromCookie)) return fromCookie

  const headerStore = await headers()
  return parseAcceptLanguage(headerStore.get('accept-language'))
})
