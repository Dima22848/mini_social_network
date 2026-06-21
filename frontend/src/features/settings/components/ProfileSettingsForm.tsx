'use client'

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Edit3, Loader2, MailCheck, X } from 'lucide-react'
import { useAuth } from '@/features/auth/providers/AuthProvider'
import {
  useRequestEmailVerificationMutation,
  useUpdateMeMutation,
  useUploadAvatarMutation,
} from '@/features/auth/api/auth.queries'
import { getAssetUrl } from '@/shared/utils/assets'
import {
  defaultDraft,
  type ProfileDraft,
  useProfileSettingsDraftStore,
} from '../stores/profileSettingsDraft.store'

type FieldName = keyof ProfileDraft

type EditableFieldProps = {
  name: FieldName
  label: string
  value: string
  multiline?: boolean
  type?: string
  onConfirm: (name: FieldName, value: string) => void
}

function buildDraftFromUser(user: NonNullable<ReturnType<typeof useAuth>['user']>): ProfileDraft {
  return {
    username: user.username ?? '',
    email: user.email ?? '',
    age: user.profile?.age ? String(user.profile.age) : '',
    city: user.profile?.city ?? '',
    country: user.profile?.country ?? '',
    bio: user.profile?.bio ?? '',
    avatarUrl: user.profile?.avatarUrl ?? null,
  }
}

function EditableField({ name, label, value, multiline = false, type = 'text', onConfirm }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    if (!isEditing) {
      setLocalValue(value)
    }
  }, [isEditing, value])

  function confirm() {
    onConfirm(name, localValue)
    setIsEditing(false)
  }

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-slate-900">{label}</span>
        {isEditing ? (
          <span className="flex gap-1">
            <button type="button" onClick={confirm} className="rounded-xl p-2 text-emerald-600 hover:bg-emerald-50" aria-label="Подтвердить изменение"><Check size={17} /></button>
            <button type="button" onClick={() => setIsEditing(false)} className="rounded-xl p-2 text-red-500 hover:bg-red-50" aria-label="Отменить изменение"><X size={17} /></button>
          </span>
        ) : (
          <button type="button" onClick={() => setIsEditing(true)} className="rounded-xl p-2 text-violet-600 hover:bg-violet-50" aria-label="Редактировать"><Edit3 size={17} /></button>
        )}
      </div>

      {isEditing ? (
        multiline ? (
          <textarea value={localValue} onChange={(event) => setLocalValue(event.target.value)} rows={4} className="w-full resize-none rounded-xl border border-violet-200 px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-violet-100" />
        ) : (
          <input type={type} value={localValue} onChange={(event) => setLocalValue(event.target.value)} className="h-10 w-full rounded-xl border border-violet-200 px-3 text-sm outline-none focus:ring-4 focus:ring-violet-100" />
        )
      ) : (
        <p className="min-h-6 whitespace-pre-wrap break-words text-sm text-zinc-600">{value || 'Не указано'}</p>
      )}
    </div>
  )
}

export function ProfileSettingsForm() {
  const { user } = useAuth()
  const updateMeMutation = useUpdateMeMutation()
  const uploadAvatarMutation = useUploadAvatarMutation()
  const verifyEmailMutation = useRequestEmailVerificationMutation()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { draft, setInitialDraft, updateDraft, resetDraft } = useProfileSettingsDraftStore()
  const [success, setSuccess] = useState(false)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const initialDraft = useMemo(() => user ? buildDraftFromUser(user) : defaultDraft, [user])

  useEffect(() => {
    if (user) {
      setInitialDraft(initialDraft)
    }
  }, [initialDraft, setInitialDraft, user])

  const currentDraft = draft ?? initialDraft
  const avatarUrl = getAssetUrl(currentDraft.avatarUrl)
  const serverError = updateMeMutation.error instanceof Error ? updateMeMutation.error.message : null
  const isDirty = JSON.stringify(currentDraft) !== JSON.stringify(initialDraft)

  function confirmField(name: FieldName, value: string) {
    updateDraft({ [name]: value } as Partial<ProfileDraft>)
    setSuccess(false)
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    try {
      const uploaded = await uploadAvatarMutation.mutateAsync(file)
      updateDraft({ avatarUrl: uploaded.url })
      setSuccess(false)
    } catch {
      // error shown below
    }
  }

  async function saveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSuccess(false)
    setInfoMessage(null)

    const result = await updateMeMutation.mutateAsync({
      username: currentDraft.username.trim(),
      email: currentDraft.email.trim(),
      age: currentDraft.age ? Number(currentDraft.age) : undefined,
      city: currentDraft.city.trim() || undefined,
      country: currentDraft.country.trim() || undefined,
      bio: currentDraft.bio.trim() || undefined,
      avatarUrl: currentDraft.avatarUrl,
    })

    resetDraft(buildDraftFromUser(result.user))
    setSuccess(true)
  }

  async function requestVerification() {
    try {
      setInfoMessage(null)
      const result = await verifyEmailMutation.mutateAsync()
      setInfoMessage(result.verifyLink ? `Письмо создано. Dev-ссылка: ${result.verifyLink}` : result.message ?? 'Письмо отправлено')
    } catch (error) {
      setInfoMessage(error instanceof Error ? error.message : 'Не удалось отправить письмо подтверждения')
    }
  }

  return (
    <form onSubmit={saveChanges} className="max-w-4xl space-y-5">
      {(serverError || uploadAvatarMutation.error instanceof Error) && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {serverError || (uploadAvatarMutation.error instanceof Error ? uploadAvatarMutation.error.message : '')}
        </div>
      )}

      {success && <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">Изменения сохранены.</div>}
      {infoMessage && <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">{infoMessage}</div>}

      <div className="rounded-3xl border border-zinc-100 bg-zinc-50/40 p-5">
        <div className="mb-4 flex items-center justify-between gap-4 max-md:flex-col max-md:items-start">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => avatarUrl && setPreviewOpen(true)} className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-xl font-black text-violet-700 transition hover:ring-4 hover:ring-violet-100">
              {avatarUrl ? <img src={avatarUrl} alt={user?.username ?? 'avatar'} className="h-full w-full object-cover" /> : currentDraft.username.slice(0, 1).toUpperCase()}
            </button>
            <div>
              <p className="text-sm font-bold text-slate-950">Аватар профиля</p>
              <p className="mt-1 text-xs text-zinc-500">Клик по аватару открывает полный просмотр.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-50">Изменить аватар</button>
            {currentDraft.avatarUrl && <button type="button" onClick={() => updateDraft({ avatarUrl: null })} className="rounded-2xl border border-red-100 bg-white px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50">Удалить</button>}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <EditableField name="username" label="Никнейм" value={currentDraft.username} onConfirm={confirmField} />
        <div className="rounded-2xl border border-zinc-100 bg-white px-4 py-3">
          <EditableField name="email" label="E-mail" value={currentDraft.email} type="email" onConfirm={confirmField} />
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-zinc-50 px-3 py-2">
            <span className="text-xs font-bold text-zinc-500">Статус: {user?.isEmailVerified ? 'подтверждён' : 'не подтверждён'}</span>
            {!user?.isEmailVerified && (
              <button type="button" onClick={requestVerification} disabled={verifyEmailMutation.isPending} className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-60">
                {verifyEmailMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MailCheck className="h-3.5 w-3.5" />}
                Подтвердить email
              </button>
            )}
          </div>
        </div>
        <EditableField name="age" label="Возраст" value={currentDraft.age} type="number" onConfirm={confirmField} />
        <EditableField name="city" label="Город" value={currentDraft.city} onConfirm={confirmField} />
        <EditableField name="country" label="Страна" value={currentDraft.country} onConfirm={confirmField} />
        <div className="md:col-span-2"><EditableField name="bio" label="О себе" value={currentDraft.bio} multiline onConfirm={confirmField} /></div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={updateMeMutation.isPending || uploadAvatarMutation.isPending || !isDirty} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-100 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60">
          {updateMeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Сохранить изменения
        </button>
        <button type="button" onClick={() => resetDraft(initialDraft)} disabled={!isDirty} className="rounded-xl border border-zinc-100 bg-white px-6 py-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50">Сбросить черновик</button>
      </div>

      {previewOpen && avatarUrl && (
        <div data-dismissible-ignore="true" className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 px-4 py-6" onMouseDown={() => setPreviewOpen(false)}>
          <div className="relative max-h-[92dvh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white p-3 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setPreviewOpen(false)} className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-slate-700 shadow"><X size={20} /></button>
            <img src={avatarUrl} alt="avatar" className="max-h-[calc(92dvh-1.5rem)] w-full rounded-2xl object-contain" />
          </div>
        </div>
      )}
    </form>
  )
}
