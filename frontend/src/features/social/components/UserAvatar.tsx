import { getAssetUrl } from '@/shared/utils/assets'
import type { SocialUserCard } from '../types/social.types'

export function UserAvatar({
  user,
  showOnline,
}: {
  user: SocialUserCard
  showOnline?: boolean
}) {
  const avatarUrl = getAssetUrl(user.avatarUrl)

  return (
    <div className="relative h-16 w-16 shrink-0 overflow-visible rounded-full bg-violet-100 text-lg font-semibold text-violet-700">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={user.username}
            className="h-full w-full object-cover"
          />
        ) : (
          user.username.slice(0, 1).toUpperCase()
        )}
      </div>

      {showOnline && user.isOnline && (
        <span className="absolute bottom-1 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
      )}
    </div>
  )
}