'use client'

import { useMemo, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { updateProfile, updateAvatar, changePassword } from '@/app/(app)/profile/actions'
import { useI18n } from '@/components/i18n-provider'
import Avatar from '@/components/avatar'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024

export default function ProfileEditor({
  userId,
  email,
  initialNickname,
  initialAvatarUrl,
  canChangePassword,
}: {
  userId: string
  email: string
  initialNickname: string
  initialAvatarUrl: string | null
  canChangePassword: boolean
}) {
  const { t } = useI18n()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [nickname, setNickname] = useState(initialNickname)
  const [nickMsg, setNickMsg] = useState('')
  const [savingNick, startNick] = useTransition()

  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl)
  const [uploading, setUploading] = useState(false)
  const [avatarErr, setAvatarErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [pw, setPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [changingPw, startPw] = useTransition()

  const emailPrefix = email.split('@')[0]
  const display = nickname.trim() || emailPrefix

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-subir el mismo archivo
    if (!file) return
    setAvatarErr('')
    if (!file.type.startsWith('image/')) return setAvatarErr(t.profile.avatarType)
    if (file.size > MAX_AVATAR_BYTES) return setAvatarErr(t.profile.avatarTooBig)

    setUploading(true)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `${userId}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) {
      setUploading(false)
      return setAvatarErr(upErr.message)
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(path)
    const res = await updateAvatar(publicUrl)
    setUploading(false)
    if (!res.ok) return setAvatarErr(res.error ?? '')
    setAvatarUrl(publicUrl)
    router.refresh()
  }

  function onSaveNick(e: FormEvent) {
    e.preventDefault()
    setNickMsg('')
    startNick(async () => {
      const res = await updateProfile(nickname)
      if (res.ok) {
        setNickMsg(t.profile.saved)
        router.refresh()
      } else {
        setNickMsg(res.error ?? '')
      }
    })
  }

  function onChangePw(e: FormEvent) {
    e.preventDefault()
    setPwMsg('')
    startPw(async () => {
      const res = await changePassword(pw)
      if (res.ok) {
        setPwMsg(t.profile.passwordChanged)
        setPw('')
      } else {
        setPwMsg(res.error ?? '')
      }
    })
  }

  const inputCls =
    'rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40'
  const btnCls =
    'rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200'
  const h2Cls = 'text-xs font-semibold uppercase tracking-wide text-zinc-400'

  return (
    <div className="mt-8 space-y-10">
      <section>
        <h2 className={h2Cls}>{t.profile.photo}</h2>
        <div className="mt-3 flex items-center gap-4">
          <Avatar src={avatarUrl} name={display} seed={userId} size={64} />
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5"
            >
              {uploading ? t.profile.uploading : t.profile.changePhoto}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
            {avatarErr ? <p className="mt-2 text-xs text-red-600">{avatarErr}</p> : null}
          </div>
        </div>
      </section>

      <section>
        <h2 className={h2Cls}>{t.profile.nickname}</h2>
        <form onSubmit={onSaveNick} className="mt-3 flex gap-2">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={50}
            placeholder={emailPrefix}
            className={`flex-1 ${inputCls}`}
          />
          <button type="submit" disabled={savingNick} className={btnCls}>
            {savingNick ? '…' : t.profile.save}
          </button>
        </form>
        {nickMsg ? <p className="mt-2 text-xs text-zinc-500">{nickMsg}</p> : null}
      </section>

      <section>
        <h2 className={h2Cls}>{t.profile.password}</h2>
        {canChangePassword ? (
          <>
            <form onSubmit={onChangePw} className="mt-3 flex gap-2">
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder={t.profile.newPassword}
                autoComplete="new-password"
                className={`flex-1 ${inputCls}`}
              />
              <button type="submit" disabled={changingPw || pw.length < 6} className={btnCls}>
                {changingPw ? '…' : t.profile.changePassword}
              </button>
            </form>
            {pwMsg ? <p className="mt-2 text-xs text-zinc-500">{pwMsg}</p> : null}
          </>
        ) : (
          <p className="mt-3 rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {t.profile.googleAccount}
          </p>
        )}
      </section>
    </div>
  )
}
