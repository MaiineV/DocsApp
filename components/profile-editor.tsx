'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile, changePassword } from '@/app/(app)/profile/actions'
import { useI18n } from '@/components/i18n-provider'
import Avatar from '@/components/avatar'
import { Input, controlClasses } from '@/components/ui/input'
import { buttonClasses } from '@/components/ui/button'

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
  const [nickIsError, setNickIsError] = useState(false)
  const [savingNick, startNick] = useTransition()

  const [pw, setPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwIsError, setPwIsError] = useState(false)
  const [changingPw, startPw] = useTransition()

  const emailPrefix = email.split('@')[0]
  const display = nickname.trim() || emailPrefix

  function onSaveNick(e: FormEvent) {
    e.preventDefault()
    setNickMsg('')
    setNickIsError(false)
    startNick(async () => {
      const res = await updateProfile(nickname)
      if (res.ok) {
        setNickMsg(t.profile.saved)
        setNickIsError(false)
        router.refresh()
      } else {
        setNickMsg(res.error ?? '')
        setNickIsError(true)
      }
    })
  }

  function onChangePw(e: FormEvent) {
    e.preventDefault()
    setPwMsg('')
    setPwIsError(false)
    startPw(async () => {
      const res = await changePassword(pw)
      if (res.ok) {
        setPwMsg(t.profile.passwordChanged)
        setPwIsError(false)
        setPw('')
      } else {
        setPwMsg(res.error ?? '')
        setPwIsError(true)
      }
    })
  }

  const h2Cls = 'text-xs font-semibold uppercase tracking-wide text-muted'

  return (
    <div className="mt-8 space-y-10">
      <div className="flex items-center gap-3">
        <Avatar name={display} seed={userId} size={56} />
        <div className="min-w-0">
          <p className="truncate font-medium">{display}</p>
          <p className="truncate text-sm text-muted">{email}</p>
        </div>
      </div>

      <section>
        <h2 className={h2Cls}>{t.profile.nickname}</h2>
        <form onSubmit={onSaveNick} className="mt-3 flex gap-2">
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={50}
            placeholder={emailPrefix}
            className="flex-1"
            aria-describedby={nickMsg ? 'nick-msg' : undefined}
          />
          <button type="submit" disabled={savingNick} className={buttonClasses('primary', 'md')}>
            {savingNick ? '…' : t.profile.save}
          </button>
        </form>
        {nickMsg ? (
          <p
            id="nick-msg"
            role={nickIsError ? 'alert' : undefined}
            className={`mt-2 text-xs ${nickIsError ? 'text-danger-fg' : 'text-success'}`}
          >
            {nickMsg}
          </p>
        ) : null}
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
                aria-describedby={pwMsg ? 'pw-msg' : undefined}
                className={`flex-1 ${controlClasses}`}
              />
              <button
                type="submit"
                disabled={changingPw || pw.length < 6}
                className={buttonClasses('primary', 'md')}
              >
                {changingPw ? '…' : t.profile.changePassword}
              </button>
            </form>
            {pwMsg ? (
              <p
                id="pw-msg"
                role={pwIsError ? 'alert' : undefined}
                className={`mt-2 text-xs ${pwIsError ? 'text-danger-fg' : 'text-success'}`}
              >
                {pwMsg}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-3 rounded-md bg-surface-sunken px-3 py-2 text-sm text-muted">
            {t.profile.googleAccount}
          </p>
        )}
      </section>
    </div>
  )
}
