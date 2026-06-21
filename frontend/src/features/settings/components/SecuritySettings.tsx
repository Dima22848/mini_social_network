'use client'

import { FormEvent, useState } from 'react'
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/features/auth/providers/AuthProvider'
import { useChangePasswordMutation, useForgotPasswordMutation } from '@/features/auth/api/auth.queries'

function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-800">{label}</span>
      <span className="flex h-12 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 transition focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-50">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
        />
        <button type="button" onClick={() => setVisible((current) => !current)} className="text-zinc-400 hover:text-violet-600">
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  )
}

export function SecuritySettings() {
  const { user } = useAuth()
  const forgotPassword = useForgotPasswordMutation()
  const changePassword = useChangePasswordMutation()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const passwordValid = newPassword.length >= 8 && /[A-ZА-Я]/.test(newPassword) && /[0-9!@#$%^&*(),.?":{}|<>_\-+=/\\]/.test(newPassword)

  async function submitChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setError(null)

    if (newPassword !== confirmPassword) {
      setError('Новый пароль и подтверждение не совпадают')
      return
    }

    if (!passwordValid) {
      setError('Новый пароль не соответствует требованиям')
      return
    }

    try {
      await changePassword.mutateAsync({ oldPassword, newPassword })
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Пароль успешно изменён')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить пароль')
    }
  }

  async function sendReset() {
    if (!user?.email) return
    try {
      setMessage(null)
      setError(null)
      const result = await forgotPassword.mutateAsync({ email: user.email })
      setMessage(result.resetLink ? `Письмо создано. Dev-ссылка: ${result.resetLink}` : 'Письмо для сброса пароля отправлено.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить письмо')
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submitChangePassword} className="rounded-3xl border border-zinc-100 bg-white p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-950">Изменение пароля</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">Используйте надёжный пароль для защиты вашего аккаунта.</p>
          </div>
        </div>

        <div className="space-y-4">
          <PasswordInput label="Старый пароль" value={oldPassword} onChange={setOldPassword} placeholder="Введите текущий пароль" />
          <PasswordInput label="Новый пароль" value={newPassword} onChange={setNewPassword} placeholder="Введите новый пароль" />
          <PasswordInput label="Подтвердите пароль" value={confirmPassword} onChange={setConfirmPassword} placeholder="Повторите новый пароль" />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-700">
            <div className="mb-2 flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" /> Требования к паролю:</div>
            <ul className="space-y-1 text-sm font-medium">
              <li>✓ Минимум 8 символов</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={changePassword.isPending || !oldPassword || !newPassword || !confirmPassword}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-8 text-sm font-bold text-white shadow-lg shadow-violet-100 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Сохранить пароль
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-zinc-100 bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-950">Не помните пароль?</h3>
            <p className="mt-1 text-sm text-zinc-500">Отправим письмо с инструкциями для сброса пароля.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={sendReset}
          disabled={forgotPassword.isPending}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-white px-6 text-sm font-bold text-violet-700 transition hover:bg-violet-50 disabled:opacity-60"
        >
          {forgotPassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Отправить письмо для сброса пароля
        </button>
      </div>

      {message && <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">{message}</div>}
      {error && <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</div>}
    </div>
  )
}
