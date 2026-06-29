import { redirect } from 'next/navigation'
import { getMyTeams } from '@/lib/teams'
import { getDictionary, getLocale } from '@/lib/i18n'
import { createTeam } from '@/app/(app)/teams/actions'
import { SubmitButton } from '@/components/submit-button'
import { Card } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Input, Field } from '@/components/ui/input'
import { buttonClasses } from '@/components/ui/button'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const [{ error }, teams] = await Promise.all([searchParams, getMyTeams()])
  if (teams.length > 0) redirect('/docs')
  const t = getDictionary(await getLocale())
  // Key de idempotencia por render: un doble-submit reusa el team (la RPC dedupea).
  const idempotencyKey = crypto.randomUUID()

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">{t.onboarding.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.onboarding.body}</p>

        {error ? (
          <Alert variant="danger" className="mt-4">
            {error}
          </Alert>
        ) : null}

        <form action={createTeam} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="idempotency_key" value={idempotencyKey} />
          <Field label={t.onboarding.teamName}>
            <Input
              name="name"
              type="text"
              required
              maxLength={100}
              placeholder={t.onboarding.teamNamePlaceholder}
              autoFocus
            />
          </Field>
          <SubmitButton className={buttonClasses('primary', 'md', 'mt-2 w-full')}>
            {t.onboarding.submit}
          </SubmitButton>
        </form>
      </Card>
    </div>
  )
}
