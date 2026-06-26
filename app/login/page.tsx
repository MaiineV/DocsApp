import Link from 'next/link'
import { AuthCard } from '@/components/auth-card'
import { safeNext } from '@/lib/auth/next'
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next: rawNext } = await searchParams
  const next = rawNext ? safeNext(rawNext) : undefined
  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'

  return (
    <AuthCard
      title="Iniciar sesión"
      action={login}
      submitLabel="Entrar"
      error={error}
      next={next}
      footer={
        <>
          ¿No tenés cuenta?{' '}
          <Link href={signupHref} className="font-medium underline">
            Crear cuenta
          </Link>
        </>
      }
    />
  )
}
