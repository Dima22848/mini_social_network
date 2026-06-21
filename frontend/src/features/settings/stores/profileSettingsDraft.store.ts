'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ProfileDraft = {
  username: string
  email: string
  age: string
  city: string
  country: string
  bio: string
  avatarUrl: string | null
}

type ProfileSettingsDraftStore = {
  draft: ProfileDraft | null
  setInitialDraft: (draft: ProfileDraft) => void
  updateDraft: (patch: Partial<ProfileDraft>) => void
  resetDraft: (draft: ProfileDraft) => void
  clearDraft: () => void
}

export const useProfileSettingsDraftStore = create<ProfileSettingsDraftStore>()(
  persist(
    (set, get) => ({
      draft: null,
      setInitialDraft: (draft) => {
        if (!get().draft) {
          set({ draft })
        }
      },
      updateDraft: (patch) => set((state) => ({ draft: { ...(state.draft ?? defaultDraft), ...patch } })),
      resetDraft: (draft) => set({ draft }),
      clearDraft: () => set({ draft: null }),
    }),
    { name: 'social.profile-settings-draft' },
  ),
)

export const defaultDraft: ProfileDraft = {
  username: '',
  email: '',
  age: '',
  city: '',
  country: '',
  bio: '',
  avatarUrl: null,
}

export type { ProfileDraft }
