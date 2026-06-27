import Link from 'next/link'
import { AuthCard } from '@/components/auth-card'
import { safeNext } from '@/lib/auth/next'
import { getDictionary, getLocale } from '@/lib/i18n'
import { signup } from '@/app/login/actions'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; pending?: string }>
}) {
  const { error, next: rawNext, pending } = await searchParams
  const t = getDictionary(await getLocale())
  const next = rawNext ? safeNext(rawNext) : undefined
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login'

  // Con "Confirm email" ON, tras registrarse hay que confirmar por mail.
  if (pending) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h1 className="text-2xl font-semibold tracking-tight">{t.auth.checkEmailTitle}</h1>
          <p className="mt-2 text-sm text-zinc-500">{t.auth.checkEmailBody}</p>
          <Link href={loginHref} className="mt-6 inline-block text-sm text-zinc-500 hover:underline">
            {t.auth.backToLogin}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <AuthCard
      title={t.auth.signupTitle}
      action={signup}
      submitLabel={t.auth.signupSubmit}
      error={error}
      next={next}
      footer={
        <>
          {t.auth.haveAccount}{' '}
          <Link href={loginHref} className="font-medium underline">
            {t.auth.signIn}
          </Link>
        </>
      }
    />
  )
}
