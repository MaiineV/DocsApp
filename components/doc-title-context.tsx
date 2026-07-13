'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

// Propaga renombres de título client-side (sidebar/índice) sin revalidatePath:
// en Next 16 cualquier revalidatePath desde una Server Action purga TODO el
// Client Cache ("causes all previously visited pages to refresh" —
// revalidatePath.md, comportamiento temporal), lo que mataba el prefetch warm
// de la navegación instantánea en cada pausa de tipeo del título. El Map
// docId→title es un override efímero de sesión sobre los títulos del server;
// se auto-limpia cuando el server los confirma (reconcile), así un rename
// ajeno posterior vuelve a verse y el Map no crece.

type Overrides = ReadonlyMap<string, string>

type Actions = {
  setDocTitle: (id: string, title: string) => void
  reconcileDocTitles: (rows: readonly { id: string; title: string }[]) => void
}

const OverridesContext = createContext<Overrides | null>(null)
const ActionsContext = createContext<Actions | null>(null)

export function DocTitleProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Overrides>(new Map())

  const setDocTitle = useCallback((id: string, title: string) => {
    setOverrides((prev) => new Map(prev).set(id, title))
  }, [])

  // Borra los overrides que el server ya refleja (comparando con trim(): el
  // server persiste title.trim()). Devuelve prev si no hay cambios (bail-out).
  const reconcileDocTitles = useCallback(
    (rows: readonly { id: string; title: string }[]) => {
      setOverrides((prev) => {
        let next: Map<string, string> | null = null
        for (const r of rows) {
          const o = prev.get(r.id)
          if (o !== undefined && o.trim() === r.title) {
            next ??= new Map(prev)
            next.delete(r.id)
          }
        }
        return next ?? prev
      })
    },
    [],
  )

  // Acciones en un contexto separado y de identidad estable: consumirlas no
  // suscribe al Map → un keystroke del título no re-renderiza el árbol DnD
  // entero, solo los labels hoja que leen el override.
  const [actions] = useState<Actions>(() => ({ setDocTitle, reconcileDocTitles }))

  return (
    <ActionsContext.Provider value={actions}>
      <OverridesContext.Provider value={overrides}>{children}</OverridesContext.Provider>
    </ActionsContext.Provider>
  )
}

// Título a mostrar: override de sesión o el del server. Null-safe fuera del
// provider (p. ej. superficies /share) → cae al título del server.
export function useDocTitle(id: string, serverTitle: string): string {
  return useContext(OverridesContext)?.get(id) ?? serverTitle
}

export function useDocTitleActions(): Actions {
  const ctx = useContext(ActionsContext)
  if (!ctx) throw new Error('useDocTitleActions debe usarse dentro de <DocTitleProvider>')
  return ctx
}
