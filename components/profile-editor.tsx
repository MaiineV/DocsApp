'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile, changePassword } from '@/app/(app)/profile/actions'
import { useI18n } from '@/components/i18n-provider'
import Avatar from '@/components/avatar'

export default function ProfileEditor({
  userId,
  email,
  initialNickname,
  canChangePassword,
}: {
  userId: string
  email: string
  initialNickname: string
  canChangePassword: boolean
}) {
  const { t } = useI18n()
  const router = useRouter()

  const [nickname, setNickname] = useState(initialNickname)
  const [nickMsg, setNickMsg] = useState('')
  const [savingNick, startNick] = useTransition()

  const [pw, setPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [changingPw, startPw] = useTransition()

  const emailPrefix = email.split('@')[0]
  const display = nickname.trim() || emailPrefix

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
      <div className="flex items-center gap-3">
        <Avatar name={display} seed={userId} size={56} />
        <div className="min-w-0">
          <p className="truncate font-medium">{display}</p>
          <p className="truncate text-sm text-zinc-500">{email}</p>
        </div>
      </div>

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
