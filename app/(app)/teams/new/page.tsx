import Link from 'next/link'
import { createTeam } from '@/app/(app)/teams/actions'
import { getDictionary, getLocale } from '@/lib/i18n'
import { SubmitButton } from '@/components/submit-button'
import { Card } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Input, Field } from '@/components/ui/input'
import { buttonClasses } from '@/components/ui/button'

// Crear un equipo ADICIONAL (a diferencia de /onboarding, que es solo para el
// primero). createTeam deja el nuevo equipo como activo y redirige a /docs.
export default async function NewTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const t = getDictionary(await getLocale())
  // Key de idempotencia por render: un doble-submit reusa el team (la RPC dedupea).
  const idempotencyKey = crypto.randomUUID()

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <Link href="/docs" className="text-sm text-muted hover:underline">
          {t.common.backToDocs}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t.newTeam.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.newTeam.body}</p>

        {error ? (
          <Alert variant="danger" className="mt-4">
            {error}
          </Alert>
        ) : null}

        <form action={createTeam} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="idempotency_key" value={idempotencyKey} />
          <Field label={t.newTeam.teamName}>
            <Input
              name="name"
              type="text"
              required
              maxLength={100}
              placeholder={t.newTeam.teamNamePlaceholder}
              autoFocus
            />
          </Field>
          <SubmitButton className={buttonClasses('primary', 'md', 'mt-2 w-full')}>
            {t.newTeam.submit}
          </SubmitButton>
        </form>
      </Card>
    </div>
  )
}
