import Link from 'next/link'
import { AuthCard } from '@/components/auth-card'
import { safeNext } from '@/lib/auth/next'
import { signup } from '@/app/login/actions'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; pending?: string }>
}) {
  const { error, next: rawNext, pending } = await searchParams
  const next = rawNext ? safeNext(rawNext) : undefined
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login'

  // Con "Confirm email" ON, tras registrarse hay que confirmar por mail.
  if (pending) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h1 className="text-2xl font-semibold tracking-tight">Revisá tu email</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Te mandamos un link para confirmar tu cuenta. Al confirmarlo te llevamos de vuelta para
            seguir donde estabas.
          </p>
          <Link
            href={loginHref}
            className="mt-6 inline-block text-sm text-zinc-500 hover:underline"
          >
            Volver a iniciar sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <AuthCard
      title="Crear cuenta"
      action={signup}
      submitLabel="Registrarme"
      error={error}
      next={next}
      footer={
        <>
          ¿Ya tenés cuenta?{' '}
          <Link href={loginHref} className="font-medium underline">
            Iniciar sesión
          </Link>
        </>
      }
    />
  )
}
