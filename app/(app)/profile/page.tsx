import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/user'
import { getMyProfile } from '@/lib/profile'
import { getDictionary, getLocale } from '@/lib/i18n'
import ProfileEditor from '@/components/profile-editor'

export default async function ProfilePage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const [profile, t] = await Promise.all([getMyProfile(), getLocale().then(getDictionary)])
  // Cuentas con identidad 'email' pueden cambiar contraseña; las de solo Google no.
  const providers = user.app_metadata?.providers ?? []
  const canChangePassword = providers.includes('email')

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
      <Link href="/docs" className="text-sm text-zinc-500 hover:underline">
        {t.common.backToDocs}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t.profile.title}</h1>
      <p className="mt-1 text-sm text-zinc-500">{user.email}</p>

      <ProfileEditor
        userId={user.id}
        email={user.email ?? ''}
        initialNickname={profile?.nickname ?? ''}
        canChangePassword={canChangePassword}
      />

      <div className="mt-10 border-t border-border pt-6">
        <Link href="/profile/tokens" className="text-sm font-medium text-fg hover:underline">
          {t.tokens.link}
        </Link>
      </div>
    </div>
  )
}
