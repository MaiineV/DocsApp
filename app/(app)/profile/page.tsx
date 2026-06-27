import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyProfile } from '@/lib/profile'
import { getDictionary, getLocale } from '@/lib/i18n'
import ProfileEditor from '@/components/profile-editor'

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profile, t] = await Promise.all([getMyProfile(), getLocale().then(getDictionary)])
  // Cuentas con identidad 'email' pueden cambiar contraseña; las de solo Google no.
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? []
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
    </div>
  )
}
