import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDictionary, getLocale } from '@/lib/i18n'
import { fmt } from '@/lib/i18n/format'
import { SubmitButton } from '@/components/submit-button'
import { acceptInvitation, switchAccount } from './actions'

type Preview = {
  team_name: string
  role: string
  expired: boolean
  email_match: boolean
  masked_email: string
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const [{ token }, { error }] = await Promise.all([params, searchParams])
  const t = getDictionary(await getLocale())

  const supabase = await createClient()
  const { data } = await supabase.rpc('invitation_preview', { p_token: token })
  const preview = ((data as Preview[] | null)?.[0] ?? null) as Preview | null

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        {!preview ? (
          <DeadEnd
            title={t.invite.invalidTitle}
            message={t.invite.invalidBody}
            backLabel={t.common.goToDocs}
          />
        ) : preview.expired ? (
          <DeadEnd
            title={t.invite.expiredTitle}
            message={t.invite.expiredBody}
            backLabel={t.common.goToDocs}
          />
        ) : !preview.email_match ? (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t.invite.mismatchTitle}</h1>
            <p className="mt-2 text-sm text-zinc-500">
              {fmt(t.invite.mismatchBody, { email: preview.masked_email })}
            </p>
            <form action={switchAccount.bind(null, token)} className="mt-6">
              <SubmitButton className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5">
                {t.invite.switchAccount}
              </SubmitButton>
            </form>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {fmt(t.invite.invitedTitle, { team: preview.team_name })}
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              {fmt(t.invite.invitedBody, { role: preview.role })}
            </p>

            {error ? (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            ) : null}

            <form action={acceptInvitation.bind(null, token)} className="mt-6 flex items-center gap-3">
              <SubmitButton className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                {t.invite.accept}
              </SubmitButton>
              <Link href="/docs" className="text-sm text-zinc-500 hover:underline">
                {t.invite.notNow}
              </Link>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

function DeadEnd({
  title,
  message,
  backLabel,
}: {
  title: string
  message: string
  backLabel: string
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-zinc-500">{message}</p>
      <Link href="/docs" className="mt-6 inline-block text-sm text-zinc-500 hover:underline">
        {backLabel}
      </Link>
    </div>
  )
}
