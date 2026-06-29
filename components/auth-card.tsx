import type { ReactNode } from 'react'
import GoogleButton from '@/components/google-button'
import { SubmitButton } from '@/components/submit-button'
import { getDictionary, getLocale } from '@/lib/i18n'
import { Card } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Input, Field } from '@/components/ui/input'
import { buttonClasses } from '@/components/ui/button'

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
export async function AuthCard({ title, action, submitLabel, error, footer, next }: AuthCardProps) {
  const t = getDictionary(await getLocale())
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">{t.auth.tagline}</p>

        {error ? (
          <Alert variant="danger" className="mt-4">
            {error}
          </Alert>
        ) : null}

        <form action={action} className="mt-6 flex flex-col gap-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <Field label={t.auth.email}>
            <Input
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
            />
          </Field>
          <Field label={t.auth.password}>
            <Input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
            />
          </Field>
          <SubmitButton className={buttonClasses('primary', 'md', 'mt-2 w-full')}>
            {submitLabel}
          </SubmitButton>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-border" />
          {t.auth.or}
          <span className="h-px flex-1 bg-border" />
        </div>

        <GoogleButton next={next} />

        <div className="mt-4 text-center text-sm text-muted">{footer}</div>
      </Card>
    </div>
  )
}
