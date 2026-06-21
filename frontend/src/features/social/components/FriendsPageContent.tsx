"use client";

// Страница друзей: вкладки всех друзей, online, заявок и поиск новых пользователей.
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
  Users,
  X,
} from "lucide-react";
import { socialApi } from "../api/social.api";
import {
  useDiscoverUsersQuery,
  useFriendsQuery,
  useSocialActionMutation,
} from "../api/social.queries";
import type {
  DiscoverUserCard,
  FriendRequestItem,
  FriendsSort,
  FriendsTab,
  SocialUserCard,
} from "../types/social.types";
import { Pagination } from "./Pagination";
import { UserAvatar } from "./UserAvatar";
import { getProfileHref } from "@/shared/utils/assets";

function isFriendRequestItem(
  item: SocialUserCard | FriendRequestItem,
): item is FriendRequestItem {
  return "requestId" in item;
}

const sortLabels: Record<FriendsSort, string> = {
  name: "По имени",
  interaction: "По взаимодействию",
};

function getInitialTab(value: string | null): FriendsTab {
  if (value === "online" || value === "requests") {
    return value;
  }

  return "all";
}

function getInitialSort(value: string | null): FriendsSort {
  if (value === "interaction") {
    return "interaction";
  }

  return "name";
}

function getInitialPage(value: string | null) {
  const page = Number(value ?? 1);

  if (Number.isNaN(page) || page < 1) {
    return 1;
  }

  return page;
}

function CountBadge({ children }: { children: number }) {
  return (
    <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
      {children}
    </span>
  );
}

function PlainCountBadge({ children }: { children: number }) {
  return (
    <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500">
      {children}
    </span>
  );
}

export function FriendsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<FriendsTab>(() =>
    getInitialTab(searchParams.get("tab")),
  );
  const [sort, setSort] = useState<FriendsSort>(() =>
    getInitialSort(searchParams.get("sort")),
  );
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [page, setPage] = useState(() =>
    getInitialPage(searchParams.get("page")),
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState("");

  const queryParams = useMemo(
    () => ({
      tab,
      search,
      sort,
      page,
      limit: tab === "requests" ? 3 : 6,
    }),
    [tab, search, sort, page],
  );

  const { data, isLoading, error, refetch } = useFriendsQuery(queryParams);
  const discoverQuery = useDiscoverUsersQuery({
    search: discoverSearch,
    limit: 60,
  });
  const actionMutation = useSocialActionMutation();

  const visibleErrorMessage =
    errorMessage ?? (error instanceof Error ? error.message : null);

  const titleMeta = useMemo(() => {
    if (!data) {
      return "Загрузка...";
    }

    if (tab === "online") {
      return `${data.counters.online} онлайн`;
    }

    if (tab === "requests") {
      return `${data.counters.requests} запроса`;
    }

    return `${data.counters.all} друзей`;
  }, [data, tab]);

  function updateUrl(nextState: {
    tab?: FriendsTab;
    sort?: FriendsSort;
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

  async function reloadFriends() {
    await refetch();
  }

  function changeTab(nextTab: FriendsTab) {
    setTab(nextTab);
    setPage(1);
    updateUrl({ tab: nextTab, page: 1 });
  }

  function changeSort(nextSort: FriendsSort) {
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
      await reloadFriends();
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

  async function handleRemoveFriend(friendId: string) {
    await runAction(`remove-friend-${friendId}`, (accessToken) =>
      socialApi.removeFriend(accessToken, friendId),
    );
  }

  async function handleAcceptRequest(requestId: string) {
    await runAction(`accept-request-${requestId}`, (accessToken) =>
      socialApi.acceptFriendRequest(accessToken, requestId),
    );
  }

  async function handleDeclineRequest(requestId: string) {
    await runAction(`decline-request-${requestId}`, (accessToken) =>
      socialApi.declineFriendRequest(accessToken, requestId),
    );
  }

  async function handleSendFriendRequest(userId: string) {
    await runAction(`add-friend-${userId}`, (accessToken) =>
      socialApi.sendFriendRequest(accessToken, userId),
    );
    await discoverQuery.refetch();
  }

  if (isDiscoveryOpen) {
    return (
      <section className="min-w-0 rounded-[2rem] border border-zinc-100 bg-white/80 p-7 shadow-sm max-md:p-4">
        <div className="mb-5 flex items-start justify-between gap-4 max-md:flex-col">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-zinc-950 max-md:text-3xl">
              Найти друзей
            </h1>
            <p className="mt-1 text-sm font-medium text-zinc-500">
              Пользователи без друзей, подписчиков и ваших подписок. С общими
              друзьями идут первыми.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsDiscoveryOpen(false)}
            className="inline-flex items-center gap-2 rounded-2xl border border-zinc-100 bg-white px-5 py-3 text-sm font-bold text-zinc-600 shadow-sm transition hover:border-violet-200 hover:text-violet-700 max-md:w-full max-md:justify-center"
          >
            Вернуться к друзьям
          </button>
        </div>

        <label className="mb-5 flex h-12 items-center gap-3 rounded-2xl border border-zinc-100 bg-white px-4 text-zinc-400 shadow-sm transition focus-within:border-violet-200">
          <Search size={19} />
          <input
            value={discoverSearch}
            onChange={(event) => setDiscoverSearch(event.target.value)}
            placeholder="Поиск всех пользователей по имени или @никнейму"
            className="h-full w-full bg-transparent text-sm font-medium text-zinc-800 outline-none placeholder:text-zinc-400"
          />
        </label>

        {visibleErrorMessage && (
          <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {visibleErrorMessage}
          </div>
        )}

        {discoverQuery.isLoading ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-white">
            <Loader2 className="animate-spin text-violet-600" size={32} />
          </div>
        ) : discoverQuery.data && discoverQuery.data.items.length > 0 ? (
          <div className="space-y-4">
            {discoverQuery.data.items.map((candidate) => (
              <DiscoverUserCardItem
                key={candidate.id}
                user={candidate}
                pendingActionId={pendingActionId}
                onAdd={() => handleSendFriendRequest(candidate.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-white px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-50 text-violet-600">
              <Users size={28} />
            </div>
            <h3 className="text-lg font-bold text-zinc-950">Никого не нашли</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
              Попробуй изменить поисковый запрос или вернуться позже.
            </p>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="min-w-0 rounded-[2rem] border border-zinc-100 bg-white/80 p-7 shadow-sm max-md:p-4">
      <div className="mb-5 flex items-start justify-between gap-4 max-md:flex-col">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-950 max-md:text-3xl">
            Друзья
          </h1>
          <p className="mt-1 text-sm font-medium text-zinc-500">{titleMeta}</p>
        </div>

        <button
          type="button"
          onClick={() => setIsDiscoveryOpen(true)}
          className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 max-md:w-full max-md:justify-center"
        >
          <Users size={18} />
          Найти друзей
        </button>
      </div>

      <div className="mb-5 flex items-center gap-4 max-md:flex-col">
        <label className="flex h-12 flex-1 items-center gap-3 rounded-2xl border border-zinc-100 bg-white px-4 text-zinc-400 shadow-sm transition focus-within:border-violet-200 max-md:w-full">
          <Search size={19} />
          <input
            value={search}
            onChange={(event) => changeSearch(event.target.value)}
            placeholder="Поиск друзей по имени или @никнейму"
            className="h-full w-full bg-transparent text-sm font-medium text-zinc-800 outline-none placeholder:text-zinc-400"
          />
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
                onClick={() => changeSort("name")}
                className={
                  sort === "name"
                    ? "flex w-full items-center justify-between rounded-xl bg-violet-50 px-3 py-2.5 text-left text-sm font-bold text-violet-700"
                    : "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-zinc-600 transition hover:bg-violet-50 hover:text-violet-700"
                }
              >
                По имени
                {sort === "name" && <Check size={16} />}
              </button>

              <button
                type="button"
                onClick={() => changeSort("interaction")}
                className={
                  sort === "interaction"
                    ? "flex w-full items-center justify-between rounded-xl bg-violet-50 px-3 py-2.5 text-left text-sm font-bold text-violet-700"
                    : "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-zinc-600 transition hover:bg-violet-50 hover:text-violet-700"
                }
              >
                По взаимодействию
                {sort === "interaction" && <Check size={16} />}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => changeTab("all")}
          className={
            tab === "all"
              ? "rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-200"
              : "rounded-2xl border border-zinc-100 bg-white px-5 py-3 text-sm font-bold text-zinc-600 transition hover:border-violet-200 hover:text-violet-700"
          }
        >
          Все друзья
          {data &&
            (tab === "all" ? (
              <CountBadge>{data.counters.all}</CountBadge>
            ) : (
              <PlainCountBadge>{data.counters.all}</PlainCountBadge>
            ))}
        </button>

        <button
          type="button"
          onClick={() => changeTab("online")}
          className={
            tab === "online"
              ? "rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-200"
              : "rounded-2xl border border-zinc-100 bg-white px-5 py-3 text-sm font-bold text-zinc-600 transition hover:border-violet-200 hover:text-violet-700"
          }
        >
          Онлайн
          <span
            className={
              tab === "online"
                ? "ml-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold"
                : "ml-2 inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500"
            }
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {data?.counters.online ?? 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => changeTab("requests")}
          className={
            tab === "requests"
              ? "rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-200"
              : "rounded-2xl border border-zinc-100 bg-white px-5 py-3 text-sm font-bold text-zinc-600 transition hover:border-violet-200 hover:text-violet-700"
          }
        >
          Запросы
          {data &&
            (tab === "requests" ? (
              <CountBadge>{data.counters.requests}</CountBadge>
            ) : (
              <PlainCountBadge>{data.counters.requests}</PlainCountBadge>
            ))}
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
            {tab === "requests"
              ? data.items
                  .filter(isFriendRequestItem)
                  .map((request) => (
                    <FriendRequestCard
                      key={request.requestId}
                      request={request}
                      pendingActionId={pendingActionId}
                      onAccept={() => handleAcceptRequest(request.requestId)}
                      onDecline={() => handleDeclineRequest(request.requestId)}
                    />
                  ))
              : data.items
                  .filter(
                    (item): item is SocialUserCard =>
                      !isFriendRequestItem(item),
                  )
                  .map((friend) => (
                    <FriendCard
                      key={friend.id}
                      friend={friend}
                      pendingActionId={pendingActionId}
                      onRemove={() => handleRemoveFriend(friend.id)}
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
            Здесь появятся друзья, онлайн-пользователи или входящие заявки.
          </p>
        </div>
      )}
    </section>
  );
}

function DiscoverUserCardItem({
  user,
  pendingActionId,
  onAdd,
}: {
  user: DiscoverUserCard;
  pendingActionId: string | null;
  onAdd: () => void;
}) {
  const isAdding = pendingActionId === `add-friend-${user.id}`;

  return (
    <article className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5 rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm max-xl:grid-cols-1 max-md:p-4">
      <div className="flex min-w-0 items-center gap-4">
        <UserAvatar user={user} showOnline />

        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-zinc-950">
            {user.username}
          </h3>
          <p className="mt-0.5 truncate text-sm font-medium text-zinc-400">
            {user.handle}
          </p>
          <p className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-zinc-500">
            {user.bio}
          </p>
          <p className="mt-2 text-sm font-semibold text-zinc-400">
            {user.mutualFriendsCount > 0
              ? `${user.mutualFriendsCount} общих друзей`
              : "Пока нет общих друзей"}
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

        <button
          type="button"
          disabled={isAdding}
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-100 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isAdding ? (
            <Loader2 className="animate-spin" size={17} />
          ) : (
            <Users size={17} />
          )}
          Добавить в друзья
        </button>
      </div>
    </article>
  );
}

function FriendCard({
  friend,
  pendingActionId,
  onRemove,
}: {
  friend: SocialUserCard;
  pendingActionId: string | null;
  onRemove: () => void;
}) {
  const isRemoving = pendingActionId === `remove-friend-${friend.id}`;

  return (
    <article className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5 rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm max-xl:grid-cols-1 max-md:p-4">
      <div className="flex min-w-0 items-center gap-4">
        <UserAvatar user={friend} showOnline />

        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-zinc-950">
            {friend.username}
          </h3>
          <p className="mt-0.5 truncate text-sm font-medium text-zinc-400">
            {friend.handle}
          </p>
          <p className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-zinc-500">
            {friend.bio}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 max-xl:justify-start">
        <Link
          href={getProfileHref(friend.username)}
          className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
        >
          <User size={17} />
          Профиль
        </Link>

        <Link
          href={`/messages/${encodeURIComponent(friend.username)}`}
          className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
        >
          <MessageCircle size={17} />
          Сообщение
        </Link>

        <button
          type="button"
          disabled={isRemoving}
          onClick={onRemove}
          className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-bold text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRemoving ? (
            <Loader2 className="animate-spin" size={17} />
          ) : (
            <UserMinus size={17} />
          )}
          Удалить из друзей
        </button>
      </div>
    </article>
  );
}

function FriendRequestCard({
  request,
  pendingActionId,
  onAccept,
  onDecline,
}: {
  request: FriendRequestItem;
  pendingActionId: string | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const isAccepting = pendingActionId === `accept-request-${request.requestId}`;
  const isDeclining =
    pendingActionId === `decline-request-${request.requestId}`;

  return (
    <article className="grid grid-cols-[minmax(0,1fr)_340px] items-center gap-5 rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm max-xl:grid-cols-[minmax(0,1fr)_260px] max-md:grid-cols-1 max-md:p-4">
      <div className="flex min-w-0 items-center gap-4">
        <UserAvatar user={request.user} showOnline />

        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-zinc-950">
            {request.user.username}
          </h3>
          <p className="mt-0.5 truncate text-sm font-medium text-zinc-400">
            {request.user.handle}
          </p>
          <p className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-zinc-500">
            {request.user.bio}
          </p>
          <p className="mt-2 text-sm font-semibold text-zinc-400">
            {request.mutualFriendsCount} общих друга
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 max-xl:grid-cols-1 max-md:grid-cols-2 max-sm:grid-cols-1">
        <Link
          href={getProfileHref(request.user.username)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
        >
          <User size={17} />
          Профиль
        </Link>

        <Link
          href={`/messages/${encodeURIComponent(request.user.username)}`}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
        >
          <MessageCircle size={17} />
          Сообщение
        </Link>

        <button
          type="button"
          disabled={isAccepting || isDeclining}
          onClick={onAccept}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isAccepting ? (
            <Loader2 className="animate-spin" size={17} />
          ) : (
            <Check size={17} />
          )}
          Принять
        </button>

        <button
          type="button"
          disabled={isAccepting || isDeclining}
          onClick={onDecline}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDeclining ? (
            <Loader2 className="animate-spin" size={17} />
          ) : (
            <X size={17} />
          )}
          Отклонить
        </button>
      </div>
    </article>
  );
}
