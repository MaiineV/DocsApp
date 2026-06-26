import type { ReactNode } from 'react'
import GoogleButton from '@/components/google-button'

type AuthCardProps = {
  title: string
  action: (formData: FormData) => void
  submitLabel: string
  error?: string
  footer: ReactNode
  next?: string
}

// Card de autenticación (login/signup). Form nativo que postea a una Server
// Action. La validación del server es la fuente de verdad; el `required`/
// `minLength` es solo UX. `next` viaja en un hidden para volver tras loguear.
export function AuthCard({ title, action, submitLabel, error, footer, next }: AuthCardProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-zinc-500">DocsApp — equipo interno</p>

        {error ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <form action={action} className="mt-6 flex flex-col gap-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/15"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Contraseña</span>
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              className="rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/15"
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-md bg-zinc-900 px-4 py-2 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitLabel}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-zinc-400">
          <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />o
          <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        </div>

        <GoogleButton next={next} />

        <div className="mt-4 text-center text-sm text-zinc-500">{footer}</div>
      </div>
    </div>
  )
}
