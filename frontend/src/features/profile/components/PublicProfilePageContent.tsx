"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  CircleUserRound,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/features/auth/providers/AuthProvider";
import { PostCard } from "@/features/feed/components/PostCard";
import {
  usePublicProfileQuery,
  useSocialActionMutation,
  useUserPostsQuery,
} from "@/features/social/api/social.queries";
import { socialApi } from "@/features/social/api/social.api";
import { Pagination } from "@/features/social/components/Pagination";
import type { PublicProfileResponse } from "@/features/social/types/social.types";
import { getAssetUrl } from "@/shared/utils/assets";

type PublicProfilePageContentProps = {
  userId: string;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

export function PublicProfilePageContent({
  userId,
}: PublicProfilePageContentProps) {
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const [page, setPage] = useState(1);

  const profileQuery = usePublicProfileQuery(userId);
  const postsQuery = useUserPostsQuery(userId, { page, limit: 6 });
  const socialActionMutation = useSocialActionMutation();

  const profile = profileQuery.data ?? null;
  const posts = postsQuery.data ?? null;
  const errorMessage =
    profileQuery.error instanceof Error
      ? profileQuery.error.message
      : postsQuery.error instanceof Error
        ? postsQuery.error.message
        : socialActionMutation.error instanceof Error
          ? socialActionMutation.error.message
          : null;

  const isSelf =
    currentUser?.id === profile?.user.id || currentUser?.username === userId;

  const title = useMemo(() => {
    if (!profile) {
      return "Профиль";
    }

    return isSelf ? "Мой профиль" : `Профиль ${profile.user.username}`;
  }, [isSelf, profile]);

  useEffect(() => {
    if (!profile) {
      return;
    }

    if (currentUser?.id === profile.user.id) {
      router.replace("/profile");
      return;
    }

    if (userId !== profile.user.username) {
      router.replace(`/profile/${encodeURIComponent(profile.user.username)}`);
    }
  }, [currentUser?.id, profile, router, userId]);

  async function runAction(action: (accessToken: string) => Promise<unknown>) {
    await socialActionMutation.mutateAsync(action);
  }

  async function handleAddFriend() {
    if (!profile) {
      return;
    }

    await runAction((accessToken) =>
      socialApi.sendFriendRequest(accessToken, profile.user.id),
    );
  }

  async function handleAcceptRequest() {
    if (!profile?.relation.incomingRequestId) {
      return;
    }

    await runAction((accessToken) =>
      socialApi.acceptFriendRequest(
        accessToken,
        profile.relation.incomingRequestId!,
      ),
    );
  }

  async function handleRemoveFriend() {
    if (!profile) {
      return;
    }

    await runAction((accessToken) =>
      socialApi.removeFriend(accessToken, profile.user.id),
    );
  }

  async function handleUnfollow() {
    if (!profile) {
      return;
    }

    await runAction((accessToken) =>
      socialApi.unfollowUser(accessToken, profile.user.id),
    );
  }

  async function handleRemoveFollower() {
    if (!profile) {
      return;
    }

    await runAction((accessToken) =>
      socialApi.removeFollower(accessToken, profile.user.id),
    );
  }

  if (profileQuery.isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-white">
        <Loader2 className="animate-spin text-violet-600" size={32} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-3xl border border-red-100 bg-red-50 p-6 text-sm font-semibold text-red-600">
        {errorMessage ?? "Профиль не найден"}
      </div>
    );
  }

  const user = profile.user;
  const userProfile = user.profile;
  const location = [userProfile?.city, userProfile?.country]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="min-w-0 space-y-6">
      {errorMessage && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {errorMessage}
        </div>
      )}

      <div className="rounded-[2rem] border border-zinc-100 bg-white p-7 shadow-sm max-md:p-4">
        <div className="flex items-start justify-between gap-5 max-lg:flex-col">
          <div className="flex min-w-0 items-center gap-5">
            <div className="relative h-24 w-24 shrink-0 overflow-visible rounded-full">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-3xl font-bold text-violet-700">
                {userProfile?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getAssetUrl(userProfile.avatarUrl)}
                    alt={user.username}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  user.username.slice(0, 1).toUpperCase()
                )}
              </div>
              {profile.relation.status !== "self" && user.isOnline && (
                <span className="absolute bottom-2 right-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-500" />
              )}
            </div>

            <div className="min-w-0">
              <p className="text-sm font-bold text-violet-600">{title}</p>
              <h1 className="mt-1 truncate text-4xl font-bold tracking-tight text-zinc-950 max-md:text-3xl">
                {user.username}
              </h1>
              <p className="mt-1 break-all text-sm font-medium text-zinc-400">
                @{user.username}
              </p>
            </div>
          </div>

          <ProfileActions
            profile={profile}
            pendingAction={socialActionMutation.isPending ? "action" : null}
            onAddFriend={handleAddFriend}
            onAcceptRequest={handleAcceptRequest}
            onRemoveFriend={handleRemoveFriend}
            onUnfollow={handleUnfollow}
            onRemoveFollower={handleRemoveFollower}
          />
        </div>

        <div className="mt-7 grid grid-cols-4 gap-3 max-md:grid-cols-2">
          <CounterCard label="Друзья" value={profile.counters.friends} />
          <CounterCard label="Подписчики" value={profile.counters.followers} />
          <CounterCard label="Подписки" value={profile.counters.following} />
          <CounterCard label="Посты" value={profile.counters.posts} />
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-100 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          <InfoItem label="E-mail" value={user.email} icon={Mail} />
          <InfoItem
            label="Дата регистрации"
            value={formatDate(user.createdAt)}
            icon={CalendarDays}
          />
          <InfoItem
            label="Возраст"
            value={userProfile?.age ? `${userProfile.age} лет` : "Не указан"}
            icon={CircleUserRound}
          />
          <InfoItem
            label="Город и страна"
            value={location || "Не указано"}
            icon={MapPin}
          />
        </div>

        <div className="mt-5 border-t border-zinc-100 pt-5">
          <p className="text-sm font-semibold text-zinc-900">О себе</p>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            {userProfile?.bio ||
              "Пользователь пока не добавил информацию о себе."}
          </p>
        </div>
      </div>

      <div className="rounded-[2rem] border border-zinc-100 bg-white/80 p-7 shadow-sm max-md:p-4">
        <h2 className="text-2xl font-bold text-zinc-950">Посты пользователя</h2>
      </div>

      {postsQuery.isLoading ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-white">
          <Loader2 className="animate-spin text-violet-600" size={28} />
        </div>
      ) : posts && posts.items.length > 0 ? (
        <>
          <div className="space-y-5">
            {posts.items.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>

          <Pagination
            page={posts.pagination.page}
            totalPages={posts.pagination.totalPages}
            onPageChange={setPage}
          />
        </>
      ) : (
        <div className="flex min-h-[260px] items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-white px-6 text-center">
          <p className="max-w-md text-sm leading-6 text-zinc-500">
            У пользователя пока нет постов.
          </p>
        </div>
      )}
    </section>
  );
}
function ProfileActions({
  profile,
  pendingAction,
  onAddFriend,
  onAcceptRequest,
  onRemoveFriend,
  onUnfollow,
  onRemoveFollower,
}: {
  profile: PublicProfileResponse;
  pendingAction: string | null;
  onAddFriend: () => void;
  onAcceptRequest: () => void;
  onRemoveFriend: () => void;
  onUnfollow: () => void;
  onRemoveFollower: () => void;
}) {
  const status = profile.relation.status;
  const isPending = Boolean(pendingAction);

  if (status === "self") {
    return (
      <Link
        href="/settings"
        className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700"
      >
        Редактировать профиль
      </Link>
    );
  }

  if (status === "friend") {
    return (
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/messages/${encodeURIComponent(profile.user.username)}`}
          className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
        >
          <MessageCircle size={17} />
          Сообщение
        </Link>

        <button
          type="button"
          disabled={isPending}
          onClick={onRemoveFriend}
          className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-bold text-red-500 transition hover:bg-red-50 disabled:opacity-60"
        >
          {pendingAction === "remove-friend" ? (
            <Loader2 className="animate-spin" size={17} />
          ) : (
            <UserMinus size={17} />
          )}
          Удалить из друзей
        </button>
      </div>
    );
  }

  if (status === "incoming_request" || status === "follower") {
    return (
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={
            status === "incoming_request" ? onAcceptRequest : onAddFriend
          }
          className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:opacity-60"
        >
          {pendingAction === "accept-request" ||
          pendingAction === "add-friend" ? (
            <Loader2 className="animate-spin" size={17} />
          ) : (
            <Check size={17} />
          )}
          Принять в друзья
        </button>

        <button
          type="button"
          disabled={isPending}
          onClick={onRemoveFollower}
          className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-bold text-red-500 transition hover:bg-red-50 disabled:opacity-60"
        >
          <UserMinus size={17} />
          Убрать из подписчиков
        </button>
      </div>
    );
  }

  if (status === "outgoing_request") {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-bold text-violet-700 opacity-80"
      >
        <UserPlus size={17} />
        Заявка отправлена
      </button>
    );
  }

  if (status === "following") {
    return (
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/messages/${encodeURIComponent(profile.user.username)}`}
          className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
        >
          <MessageCircle size={17} />
          Сообщение
        </Link>

        <button
          type="button"
          disabled={isPending}
          onClick={onUnfollow}
          className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-bold text-red-500 transition hover:bg-red-50 disabled:opacity-60"
        >
          {pendingAction === "unfollow" ? (
            <Loader2 className="animate-spin" size={17} />
          ) : (
            <UserMinus size={17} />
          )}
          Отписаться
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={onAddFriend}
      className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:opacity-60"
    >
      {pendingAction === "add-friend" ? (
        <Loader2 className="animate-spin" size={17} />
      ) : (
        <UserPlus size={17} />
      )}
      Добавить в друзья
    </button>
  );
}

function CounterCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3">
      <p className="text-xl font-bold text-zinc-950">{value}</p>
      <p className="mt-1 text-sm font-medium text-zinc-500">{label}</p>
    </div>
  );
}

function InfoItem({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof CircleUserRound;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
        <Icon size={19} />
      </div>

      <div>
        <p className="text-sm font-semibold text-zinc-900">{label}</p>
        <p className="mt-1 text-sm leading-5 text-zinc-500">{value}</p>
      </div>
    </div>
  );
}
