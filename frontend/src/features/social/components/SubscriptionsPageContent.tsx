"use client";

// Страница подписчиков и подписок: списки, сортировка, поиск и быстрые действия с пользователями.
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Loader2,
  MessageCircle,
  Search,
  User,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { socialApi } from "../api/social.api";
import {
  useSocialActionMutation,
  useSubscriptionsQuery,
} from "../api/social.queries";
import type {
  SubscriptionItem,
  SubscriptionsSort,
  SubscriptionsTab,
} from "../types/social.types";
import { Pagination } from "./Pagination";
import { UserAvatar } from "./UserAvatar";
import { getProfileHref } from "@/shared/utils/assets";

const sortLabels: Record<SubscriptionsSort, string> = {
  new: "Сначала новые",
  active: "Сначала активные",
};

function getInitialTab(value: string | null): SubscriptionsTab {
  if (value === "following") {
    return "following";
  }

  return "followers";
}

function getInitialSort(value: string | null): SubscriptionsSort {
  if (value === "active") {
    return "active";
  }

  return "new";
}

function getInitialPage(value: string | null) {
  const page = Number(value ?? 1);

  if (Number.isNaN(page) || page < 1) {
    return 1;
  }

  return page;
}

function CountBadge({
  children,
  active,
}: {
  children: number;
  active: boolean;
}) {
  return (
    <span
      className={
        active
          ? "ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700"
          : "ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500"
      }
    >
      {children}
    </span>
  );
}

export function SubscriptionsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<SubscriptionsTab>(() =>
    getInitialTab(searchParams.get("tab")),
  );
  const [sort, setSort] = useState<SubscriptionsSort>(() =>
    getInitialSort(searchParams.get("sort")),
  );
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [page, setPage] = useState(() =>
    getInitialPage(searchParams.get("page")),
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const queryParams = useMemo(
    () => ({ tab, search, sort, page, limit: 5 }),
    [tab, search, sort, page],
  );

  const { data, isLoading, error, refetch } =
    useSubscriptionsQuery(queryParams);

  const actionMutation = useSocialActionMutation();

  const visibleErrorMessage =
    errorMessage ?? (error instanceof Error ? error.message : null);

  const titleMeta = useMemo(() => {
    if (!data) {
      return "Загрузка...";
    }

    return `${
      tab === "followers" ? data.counters.followers : data.counters.following
    } профилей`;
  }, [data, tab]);

  function updateUrl(nextState: {
    tab?: SubscriptionsTab;
    sort?: SubscriptionsSort;
    search?: string;
    page?: number;
  }) {
    const params = new URLSearchParams(searchParams.toString());

    const nextTab = nextState.tab ?? tab;
    const nextSort = nextState.sort ?? sort;
    const nextSearch = nextState.search ?? search;
    const nextPage = nextState.page ?? page;

    params.set("tab", nextTab);
    params.set("sort", nextSort);

    if (nextSearch.trim()) {
      params.set("search", nextSearch.trim());
    } else {
      params.delete("search");
    }

    if (nextPage > 1) {
      params.set("page", String(nextPage));
    } else {
      params.delete("page");
    }

    router.replace(`${pathname}?${params.toString()}`, {
      scroll: false,
    });
  }

  async function reloadSubscriptions() {
    await refetch();
  }

  function changeTab(nextTab: SubscriptionsTab) {
    setTab(nextTab);
    setPage(1);
    updateUrl({ tab: nextTab, page: 1 });
  }

  function changeSort(nextSort: SubscriptionsSort) {
    setSort(nextSort);
    setPage(1);
    setIsSortOpen(false);
    updateUrl({ sort: nextSort, page: 1 });
  }

  function changeSearch(nextSearch: string) {
    setSearch(nextSearch);
    setPage(1);
    updateUrl({ search: nextSearch, page: 1 });
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    updateUrl({ page: nextPage });
  }

  async function runAction(
    actionId: string,
    action: (accessToken: string) => Promise<unknown>,
  ) {
    try {
      setPendingActionId(actionId);
      setErrorMessage(null);
      await actionMutation.mutateAsync(action);
      await reloadSubscriptions();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось выполнить действие",
      );
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleAcceptIncomingRequest(requestId: string) {
    await runAction(`accept-request-${requestId}`, (accessToken) =>
      socialApi.acceptFriendRequest(accessToken, requestId),
    );
  }

  async function handleSendFriendRequest(userId: string) {
    await runAction(`send-request-${userId}`, (accessToken) =>
      socialApi.sendFriendRequest(accessToken, userId),
    );
  }

  async function handleRemoveFollower(userId: string) {
    await runAction(`remove-follower-${userId}`, (accessToken) =>
      socialApi.removeFollower(accessToken, userId),
    );
  }

  async function handleUnfollow(userId: string) {
    await runAction(`unfollow-${userId}`, (accessToken) =>
      socialApi.unfollowUser(accessToken, userId),
    );
  }

  return (
    <section className="min-w-0 rounded-[2rem] border border-zinc-100 bg-white/80 p-7 shadow-sm max-md:p-4">
      <div className="mb-5">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-950 max-md:text-3xl">
          Подписки
        </h1>
        <p className="mt-1 text-sm font-medium text-zinc-500">{titleMeta}</p>
      </div>

      <div className="mb-5 flex items-center gap-4 max-md:flex-col">
        <label className="flex h-12 flex-1 items-center gap-3 rounded-2xl border border-zinc-100 bg-white px-4 text-zinc-400 shadow-sm transition focus-within:border-violet-200 max-md:w-full">
          <input
            value={search}
            onChange={(event) => changeSearch(event.target.value)}
            placeholder="Поиск по подпискам..."
            className="h-full w-full bg-transparent text-sm font-medium text-zinc-800 outline-none placeholder:text-zinc-400"
          />
          <Search size={19} />
        </label>

        <div className="relative w-[260px] shrink-0 max-md:w-full">
          <button
            type="button"
            onClick={() => setIsSortOpen((value) => !value)}
            className="flex h-12 w-full items-center justify-between rounded-2xl border border-zinc-100 bg-white px-4 text-sm font-bold text-zinc-700 shadow-sm transition hover:border-violet-200"
          >
            {sortLabels[sort]}
            <ChevronDown
              size={18}
              className={
                isSortOpen
                  ? "rotate-180 text-violet-600 transition"
                  : "transition"
              }
            />
          </button>

          {isSortOpen && (
            <div className="absolute right-0 z-20 mt-2 w-full overflow-hidden rounded-2xl border border-zinc-100 bg-white p-2 shadow-[0_18px_60px_rgba(88,64,120,0.16)]">
              <button
                type="button"
                onClick={() => changeSort("new")}
                className={
                  sort === "new"
                    ? "flex w-full items-center justify-between rounded-xl bg-violet-50 px-3 py-2.5 text-left text-sm font-bold text-violet-700"
                    : "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-zinc-600 transition hover:bg-violet-50 hover:text-violet-700"
                }
              >
                Сначала новые
                {sort === "new" && <Check size={16} />}
              </button>

              <button
                type="button"
                onClick={() => changeSort("active")}
                className={
                  sort === "active"
                    ? "flex w-full items-center justify-between rounded-xl bg-violet-50 px-3 py-2.5 text-left text-sm font-bold text-violet-700"
                    : "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-zinc-600 transition hover:bg-violet-50 hover:text-violet-700"
                }
              >
                Сначала активные
                {sort === "active" && <Check size={16} />}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 flex gap-2 border-b border-zinc-100 max-md:grid max-md:grid-cols-2">
        <button
          type="button"
          onClick={() => changeTab("followers")}
          className={
            tab === "followers"
              ? "inline-flex items-center justify-center border-b-2 border-violet-600 px-7 py-4 text-sm font-bold text-violet-700"
              : "inline-flex items-center justify-center px-7 py-4 text-sm font-bold text-zinc-500 transition hover:text-violet-700"
          }
        >
          Мои подписчики
          {data && (
            <CountBadge active={tab === "followers"}>
              {data.counters.followers}
            </CountBadge>
          )}
        </button>

        <button
          type="button"
          onClick={() => changeTab("following")}
          className={
            tab === "following"
              ? "inline-flex items-center justify-center border-b-2 border-violet-600 px-7 py-4 text-sm font-bold text-violet-700"
              : "inline-flex items-center justify-center px-7 py-4 text-sm font-bold text-zinc-500 transition hover:text-violet-700"
          }
        >
          Мои подписки
          {data && (
            <CountBadge active={tab === "following"}>
              {data.counters.following}
            </CountBadge>
          )}
        </button>
      </div>

      {visibleErrorMessage && (
        <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {visibleErrorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-white">
          <Loader2 className="animate-spin text-violet-600" size={32} />
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="space-y-4">
            {data.items.map((item) => (
              <SubscriptionCard
                key={item.user.id}
                item={item}
                tab={tab}
                pendingActionId={pendingActionId}
                onAcceptIncomingRequest={() => {
                  if (item.incomingRequestId) {
                    handleAcceptIncomingRequest(item.incomingRequestId);
                  }
                }}
                onSendFriendRequest={() =>
                  handleSendFriendRequest(item.user.id)
                }
                onRemoveFollower={() => handleRemoveFollower(item.user.id)}
                onUnfollow={() => handleUnfollow(item.user.id)}
              />
            ))}
          </div>

          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPageChange={changePage}
          />
        </>
      ) : (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-white px-6 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-50 text-violet-600">
            <Users size={28} />
          </div>

          <h3 className="text-lg font-bold text-zinc-950">Пока пусто</h3>

          <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
            Здесь появятся ваши подписчики или профили, на которые вы подписаны.
          </p>
        </div>
      )}
    </section>
  );
}

function SubscriptionCard({
  item,
  tab,
  pendingActionId,
  onAcceptIncomingRequest,
  onSendFriendRequest,
  onRemoveFollower,
  onUnfollow,
}: {
  item: SubscriptionItem;
  tab: SubscriptionsTab;
  pendingActionId: string | null;
  onAcceptIncomingRequest: () => void;
  onSendFriendRequest: () => void;
  onRemoveFollower: () => void;
  onUnfollow: () => void;
}) {
  const { user } = item;

  const isAccepting = item.incomingRequestId
    ? pendingActionId === `accept-request-${item.incomingRequestId}`
    : false;

  const isSendingRequest = pendingActionId === `send-request-${user.id}`;
  const isRemovingFollower = pendingActionId === `remove-follower-${user.id}`;
  const isUnfollowing = pendingActionId === `unfollow-${user.id}`;

  return (
    <article className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5 rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm max-xl:grid-cols-1 max-md:p-4">
      <div className="flex min-w-0 items-center gap-4">
        <UserAvatar user={user} showOnline />

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-bold text-zinc-950">
              {user.username}
            </h3>

            {item.isFriend && (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700">
                друг
              </span>
            )}
          </div>

          <p className="mt-0.5 truncate text-sm font-medium text-zinc-400">
            {user.handle}
          </p>

          <p className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-zinc-500">
            {user.bio}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 max-xl:justify-start">
        <Link
          href={getProfileHref(user.username)}
          className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
        >
          <User size={17} />
          Профиль
        </Link>

        {tab === "followers" &&
          !item.isFriend &&
          (item.incomingRequestId ? (
            <button
              type="button"
              disabled={isAccepting}
              onClick={onAcceptIncomingRequest}
              className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAccepting ? (
                <Loader2 className="animate-spin" size={17} />
              ) : (
                <UserPlus size={17} />
              )}
              Принять в друзья
            </button>
          ) : (
            <button
              type="button"
              disabled={isSendingRequest}
              onClick={onSendFriendRequest}
              className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSendingRequest ? (
                <Loader2 className="animate-spin" size={17} />
              ) : (
                <UserPlus size={17} />
              )}
              Принять в друзья
            </button>
          ))}

        <Link
          href={`/messages/${encodeURIComponent(user.username)}`}
          className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
        >
          <MessageCircle size={17} />
          Сообщение
        </Link>

        {tab === "followers" ? (
          <button
            type="button"
            disabled={isRemovingFollower}
            onClick={onRemoveFollower}
            className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-bold text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRemovingFollower ? (
              <Loader2 className="animate-spin" size={17} />
            ) : (
              <UserMinus size={17} />
            )}
            Убрать из подписчиков
          </button>
        ) : (
          <button
            type="button"
            disabled={isUnfollowing}
            onClick={onUnfollow}
            className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-bold text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUnfollowing ? (
              <Loader2 className="animate-spin" size={17} />
            ) : (
              <UserMinus size={17} />
            )}
            Отписаться
          </button>
        )}
      </div>
    </article>
  );
}
