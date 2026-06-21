"use client";

// Главный UI сообщений: список чатов, выбранный чат, draft-чаты, вложения, участники, поиск и отправка медиа.
import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  RefCallback,
  UIEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Archive,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  File as FileIcon,
  Image as ImageIcon,
  Mic,
  MoreVertical,
  Paperclip,
  Pin,
  Search,
  Send,
  Smile,
  Users,
  Video,
  Volume2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/providers/AuthProvider";
import {
  useFriendsQuery,
  useSubscriptionsQuery,
} from "@/features/social/api/social.queries";
import type {
  SocialUserCard,
  SubscriptionItem,
} from "@/features/social/types/social.types";
import {
  useChatActionMutations,
  useChatAttachmentsQuery,
  useChatMembersQuery,
  useChatBySlugQuery,
  useChatQuery,
  useChatMessagesQuery,
  useChatsQuery,
  useCreateDirectChatMutation,
  useCreateGroupChatMutation,
  useCreateMessageMutation,
  usePinnedMessagesQuery,
  useUploadFileMutation,
} from "../api/chats.queries";
import { useChatSocket } from "../hooks/useChatSocket";
import {
  downloadAsset,
  getAssetUrl,
  getProfileHref,
  formatFileSize,
} from "@/shared/utils/assets";
import type {
  AttachmentsResponse,
  Chat,
  ChatMessage,
  CreateAttachmentPayload,
  FileAssetType,
  SearchIn,
  TypingUser,
} from "../types/chat.types";

type ChatView = "chat" | "members" | "attachments";
type AttachmentTab = FileAssetType;

type ReactionEmoji = "👍" | "👎" | "🔥" | "❤️" | "😡";

type PendingChatAttachment = CreateAttachmentPayload & {
  localId: string;
};

const attachmentTabs: { label: string; value: AttachmentTab }[] = [
  { label: "Фото", value: "IMAGE" },
  { label: "Видео", value: "VIDEO" },
  { label: "Аудиофайлы", value: "AUDIO" },
  { label: "Файлы", value: "FILE" },
  { label: "Архивы", value: "ARCHIVE" },
];

const emojiOptions = [
  "😀",
  "😂",
  "😍",
  "😎",
  "🤝",
  "❤️",
  "🤬",
  "🍷",
  "🔥",
  "✨",
];
const reactionOptions: ReactionEmoji[] = ["👍", "👎", "🔥", "❤️", "😡"];

function getUploadAccept(type: FileAssetType) {
  const accepts: Record<FileAssetType, string> = {
    IMAGE: "image/*",
    VIDEO: "video/*",
    AUDIO: "audio/*",
    FILE: ".pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.ppt,.pptx,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ARCHIVE:
      ".zip,.rar,.7z,.tar,.gz,application/zip,application/x-7z-compressed,application/x-rar-compressed",
  };

  return accepts[type];
}

function inferUploadType(file: File, fallback: FileAssetType): FileAssetType {
  if (file.type.startsWith("image/")) return "IMAGE";
  if (file.type.startsWith("video/")) return "VIDEO";
  if (file.type.startsWith("audio/")) return "AUDIO";

  const name = file.name.toLowerCase();
  if (/\.(zip|rar|7z|tar|gz)$/.test(name)) return "ARCHIVE";

  return fallback;
}

function initials(value: string) {
  return value.slice(0, 2).toUpperCase();
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatChatListDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return formatTime(value);
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function formatAttachmentMonth(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatRecordingDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

function formatLastSeen(value: string | null | undefined) {
  if (!value) {
    return "был(а) давно";
  }

  return `был(а) ${new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))}`;
}

function createChatSlug(chat: Chat) {
  const value =
    chat.type === "DIRECT"
      ? (chat.directUser?.username ?? chat.title)
      : chat.title;

  return (
    value
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "chat"
  );
}

function createChatHref(chat: Chat) {
  return `/messages/${encodeURIComponent(createChatSlug(chat))}`;
}

function getParamString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readSessionJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const raw = window.sessionStorage.getItem(key);

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isUserOnline(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return Date.now() - new Date(value).getTime() < 1000 * 60 * 5;
}

function Avatar({
  title,
  src,
  size = "md",
  isOnline = false,
}: {
  title: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  isOnline?: boolean;
}) {
  const sizeClass =
    size === "lg"
      ? "h-14 w-14 text-lg"
      : size === "sm"
        ? "h-9 w-9 text-xs"
        : "h-11 w-11 text-sm";

  const resolvedSrc = getAssetUrl(src);

  const indicator = isOnline ? (
    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
  ) : null;

  if (resolvedSrc) {
    return (
      <span className="relative shrink-0">
        <img
          src={resolvedSrc}
          alt={title}
          className={`${sizeClass} rounded-full object-cover`}
        />
        {indicator}
      </span>
    );
  }

  return (
    <span className="relative shrink-0">
      <span
        className={`${sizeClass} flex items-center justify-center rounded-full bg-violet-100 font-bold text-violet-600`}
      >
        {initials(title)}
      </span>
      {indicator}
    </span>
  );
}

function ImagePreviewModal({
  src,
  title,
  onClose,
}: {
  src: string;
  title: string;
  onClose: () => void;
}) {
  const modalRef = useDismissibleLayer<HTMLDivElement>(true, onClose);
  const resolvedSrc = getAssetUrl(src) ?? src;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 px-4 py-6">
      <div
        ref={modalRef}
        data-dismissible-ignore="true"
        className="relative max-h-[90dvh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white p-3 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2 text-slate-700 shadow-lg transition hover:bg-white"
          aria-label="Закрыть просмотр изображения"
        >
          <X className="h-5 w-5" />
        </button>
        <img
          src={resolvedSrc}
          alt={title}
          className="max-h-[calc(90dvh-1.5rem)] w-full rounded-2xl object-contain"
        />
      </div>
    </div>
  );
}

function MediaPreviewModal({
  src,
  title,
  type,
  onClose,
}: {
  src: string;
  title: string;
  type: "IMAGE" | "VIDEO";
  onClose: () => void;
}) {
  const modalRef = useDismissibleLayer<HTMLDivElement>(true, onClose);
  const resolvedSrc = getAssetUrl(src) ?? src;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 px-4 py-6">
      <div
        ref={modalRef}
        data-dismissible-ignore="true"
        className="relative max-h-[92dvh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white p-3 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2 text-slate-700 shadow-lg transition hover:bg-white"
          aria-label="Закрыть просмотр"
        >
          <X className="h-5 w-5" />
        </button>

        {type === "IMAGE" ? (
          <img
            src={resolvedSrc}
            alt={title}
            className="max-h-[calc(92dvh-1.5rem)] w-full rounded-2xl object-contain"
          />
        ) : (
          <video
            src={resolvedSrc}
            controls
            autoPlay
            className="max-h-[calc(92dvh-1.5rem)] w-full rounded-2xl bg-black"
          />
        )}
      </div>
    </div>
  );
}

function useDismissibleLayer<T extends HTMLElement>(
  isOpen: boolean,
  onClose: () => void,
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: Event) {
      const target = event.target as Node | null;
      const targetElement = target instanceof Element ? target : null;

      if (targetElement?.closest('[data-dismissible-ignore="true"]')) {
        return;
      }

      if (target && ref.current && !ref.current.contains(target)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("touchstart", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("touchstart", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return ref;
}

export function MessagesPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const urlSearchParams = useSearchParams();
  const routeChatSlug = decodeURIComponent(
    getParamString(params.chatSlug) ?? "",
  );
  const [search, setSearch] = useState("");
  const [searchIn, setSearchIn] = useState<SearchIn>("all");
  const [page, setPage] = useState(() => {
    const saved = readSessionJson<{
      page: number;
      search: string;
      searchIn: SearchIn;
    } | null>("messages:loaded-chats-meta", null);
    return saved && saved.search === search && saved.searchIn === searchIn
      ? saved.page
      : 1;
  });
  const [activeChatSnapshot, setActiveChatSnapshot] = useState<Chat | null>(
    () => {
      const savedChat = readSessionJson<Chat | null>(
        "messages:selected-chat",
        null,
      );
      return savedChat &&
        routeChatSlug &&
        createChatSlug(savedChat) === routeChatSlug
        ? savedChat
        : null;
    },
  );
  const [activeChatId, setActiveChatId] = useState<string | null>(
    () => activeChatSnapshot?.id ?? null,
  );
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
  const [view, setView] = useState<ChatView>("chat");
  const [attachmentType, setAttachmentType] = useState<AttachmentTab>("IMAGE");
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [typingPreviewByChatId, setTypingPreviewByChatId] = useState<Record<string, TypingUser[]>>({});
  const typingPreviewTimeoutsRef = useRef<Map<string, number>>(new Map());

  const [loadedChats, setLoadedChats] = useState<Chat[]>(() => {
    const savedMeta = readSessionJson<{
      page: number;
      search: string;
      searchIn: SearchIn;
    } | null>("messages:loaded-chats-meta", null);
    return savedMeta &&
      savedMeta.search === search &&
      savedMeta.searchIn === searchIn
      ? readSessionJson<Chat[]>("messages:loaded-chats", [])
      : [];
  });
  const chatListViewportRef = useRef<HTMLDivElement | null>(null);
  const shouldRestoreChatListScrollRef = useRef(true);
  const didInitSearchResetRef = useRef(false);
  const chatsQuery = useChatsQuery({ search, searchIn, page, limit: 8 });
  const notificationChatId = urlSearchParams.get("chatId");
  const notificationMessageId = urlSearchParams.get("messageId");
  const chatBySlugQuery = useChatBySlugQuery(routeChatSlug || null);
  const chatByIdQuery = useChatQuery(notificationChatId);
  const currentPageChats = chatsQuery.data?.items ?? [];
  const meta = chatsQuery.data?.meta;
  const chats = loadedChats;
  const chatFromCurrentPage = activeChatId
    ? (chats.find((chat) => chat.id === activeChatId) ?? null)
    : null;
  const activeChat =
    chatFromCurrentPage ??
    (activeChatSnapshot?.id === activeChatId ? activeChatSnapshot : null);

  useEffect(() => {
    window.sessionStorage.removeItem("messages:search");
    window.sessionStorage.removeItem("messages:searchIn");
  }, [user?.id]);

  useEffect(() => {
    window.sessionStorage.setItem(
      "messages:loaded-chats",
      JSON.stringify(loadedChats),
    );
    window.sessionStorage.setItem(
      "messages:loaded-chats-meta",
      JSON.stringify({ page, search, searchIn }),
    );
  }, [loadedChats, page, search, searchIn]);

  useEffect(() => {
    if (!didInitSearchResetRef.current) {
      didInitSearchResetRef.current = true;
      return;
    }

    setPage(1);
    setLoadedChats([]);
    shouldRestoreChatListScrollRef.current = false;
    window.sessionStorage.setItem("messages:chat-list-scroll", "0");
  }, [search, searchIn]);

  useEffect(() => {
    if (!chatsQuery.data || chatsQuery.isPlaceholderData) {
      return;
    }

    setLoadedChats((current) => {
      if (page === 1) {
        if (current.length === 0) {
          return currentPageChats;
        }

        const freshById = new Map(
          currentPageChats.map((chat) => [chat.id, chat]),
        );
        const updatedExisting = current
          .filter((chat) => freshById.has(chat.id) || page > 1)
          .map((chat) => freshById.get(chat.id) ?? chat);
        const missingFresh = currentPageChats.filter(
          (chat) => !current.some((item) => item.id === chat.id),
        );
        return [...missingFresh, ...updatedExisting];
      }

      const existingIds = new Set(current.map((chat) => chat.id));
      const nextChats = currentPageChats.filter(
        (chat) => !existingIds.has(chat.id),
      );
      return [...current, ...nextChats];
    });
  }, [chatsQuery.data, chatsQuery.isPlaceholderData, currentPageChats, page]);

  useEffect(() => {
    if (chatFromCurrentPage) {
      setActiveChatSnapshot(chatFromCurrentPage);
    }
  }, [chatFromCurrentPage]);

  useEffect(() => {
    if (!routeChatSlug || chats.length === 0) {
      return;
    }

    const chatFromRoute = chats.find(
      (chat) => createChatSlug(chat) === routeChatSlug,
    );

    if (chatFromRoute && chatFromRoute.id !== activeChatId) {
      const pendingFocusRaw = window.sessionStorage.getItem(
        "messages:pending-focus",
      );
      let pendingFocusMessageId: string | null = null;

      if (pendingFocusRaw) {
        try {
          const pendingFocus = JSON.parse(pendingFocusRaw) as {
            chatId?: string;
            messageId?: string;
          };
          if (
            pendingFocus.chatId === chatFromRoute.id &&
            pendingFocus.messageId
          ) {
            pendingFocusMessageId = pendingFocus.messageId;
          }
        } catch {
          pendingFocusMessageId = null;
        }
      }

      setActiveChatId(chatFromRoute.id);
      setActiveChatSnapshot(chatFromRoute);
      setFocusMessageId(
        pendingFocusMessageId ?? chatFromRoute.matchedMessage?.id ?? null,
      );
      setView("chat");
    }
  }, [activeChatId, chats, routeChatSlug]);

  useEffect(() => {
    const chat = chatBySlugQuery.data;

    if (!routeChatSlug || !chat || chat.id === activeChatId) {
      return;
    }

    if (
      chat.isDraft &&
      activeChatSnapshot &&
      !activeChatSnapshot.isDraft &&
      createChatSlug(activeChatSnapshot) === routeChatSlug
    ) {
      return;
    }

    setActiveChatId(chat.id);
    setActiveChatSnapshot(chat);
    setView("chat");
    window.sessionStorage.setItem(
      "messages:selected-chat",
      JSON.stringify(chat),
    );
  }, [activeChatId, activeChatSnapshot, chatBySlugQuery.data, routeChatSlug]);

  const handleSelectChat = useCallback(
    (chat: Chat) => {
      if (chatListViewportRef.current) {
        window.sessionStorage.setItem(
          "messages:chat-list-scroll",
          String(chatListViewportRef.current.scrollTop),
        );
      }
      shouldRestoreChatListScrollRef.current = true;

      window.sessionStorage.setItem(
        "messages:selected-chat",
        JSON.stringify(chat),
      );

      if (chat.matchedMessage?.id) {
        window.sessionStorage.setItem(
          "messages:pending-focus",
          JSON.stringify({
            chatId: chat.id,
            messageId: chat.matchedMessage.id,
          }),
        );
      } else {
        window.sessionStorage.removeItem("messages:pending-focus");
      }

      setActiveChatId(chat.id);
      setActiveChatSnapshot(chat);
      setFocusMessageId(chat.matchedMessage?.id ?? null);
      setView("chat");
      router.push(createChatHref(chat), { scroll: false });
    },
    [router],
  );

  const handleCreatedChat = useCallback(
    (chat: Chat) => {
      window.sessionStorage.setItem(
        "messages:selected-chat",
        JSON.stringify(chat),
      );
      setLoadedChats((current) => [
        chat,
        ...current.filter((item) => item.id !== chat.id),
      ]);
      setActiveChatId(chat.id);
      setActiveChatSnapshot(chat);
      setFocusMessageId(null);
      window.sessionStorage.removeItem("messages:pending-focus");
      setView("chat");
      router.push(createChatHref(chat), { scroll: false });
    },
    [router],
  );

  const handleFocusMessageHandled = useCallback(() => {
    setFocusMessageId(null);
    window.sessionStorage.removeItem("messages:pending-focus");
  }, []);

  const handleChatsScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const node = event.currentTarget;
      window.sessionStorage.setItem(
        "messages:chat-list-scroll",
        String(node.scrollTop),
      );
      const canLoadNextPage = meta && page < meta.totalPages;

      if (!canLoadNextPage || chatsQuery.isFetching) {
        return;
      }

      const distanceToBottom =
        node.scrollHeight - node.scrollTop - node.clientHeight;

      if (distanceToBottom < 160) {
        setPage((value) => Math.min(value + 1, meta.totalPages));
      }
    },
    [chatsQuery.isFetching, meta, page],
  );

  useEffect(() => {
    if (!shouldRestoreChatListScrollRef.current || chats.length === 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const savedScrollTop = Number(
        window.sessionStorage.getItem("messages:chat-list-scroll") ?? 0,
      );
      if (chatListViewportRef.current) {
        chatListViewportRef.current.scrollTop = savedScrollTop;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [chats.length]);

  useLayoutEffect(() => {
    const savedScrollTop = Number(
      window.sessionStorage.getItem("messages:chat-list-scroll") ?? 0,
    );
    const node = chatListViewportRef.current;

    if (node) {
      node.scrollTop = savedScrollTop;
    }

    const frame = window.requestAnimationFrame(() => {
      if (chatListViewportRef.current) {
        chatListViewportRef.current.scrollTop = savedScrollTop;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeChatId, routeChatSlug, chats.length]);

  useEffect(() => {
    if (
      !meta ||
      chatsQuery.isFetching ||
      page >= meta.totalPages ||
      chats.length === 0
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const node = chatListViewportRef.current;

      if (!node) {
        return;
      }

      const listIsScrollable = node.scrollHeight > node.clientHeight + 8;

      if (!listIsScrollable) {
        setPage((value) => Math.min(value + 1, meta.totalPages));
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [chats.length, chatsQuery.isFetching, meta, page]);

  useEffect(() => {
    setView("chat");
  }, [activeChatId]);

  useEffect(() => {
    if (activeChat?.isReadOnly && view !== "chat") {
      setView("chat");
    }
  }, [activeChat?.isReadOnly, view]);

  useEffect(() => {
    function handleChatRemove(event: Event) {
      const chatId = (event as CustomEvent<{ chatId?: string }>).detail?.chatId;
      if (!chatId) return;
      setLoadedChats((current) => current.filter((chat) => chat.id !== chatId));
      if (activeChatId === chatId) {
        setActiveChatId(null);
        setActiveChatSnapshot(null);
        window.sessionStorage.removeItem("messages:selected-chat");
        router.replace("/messages", { scroll: false });
      }
    }

    function handleChatUpsert(event: Event) {
      const chat = (event as CustomEvent<{ chat?: Chat }>).detail?.chat;
      if (!chat) return;
      setLoadedChats((current) => [
        chat,
        ...current.filter((item) => item.id !== chat.id),
      ]);
    }

    window.addEventListener("chat-cache-remove", handleChatRemove);
    window.addEventListener("chat-cache-upsert", handleChatUpsert);

    return () => {
      window.removeEventListener("chat-cache-remove", handleChatRemove);
      window.removeEventListener("chat-cache-upsert", handleChatUpsert);
    };
  }, [activeChatId, router]);


  useEffect(() => {
    function handleChatReadLocally(event: Event) {
      const chatId = (event as CustomEvent<{ chatId?: string }>).detail?.chatId;
      if (!chatId) return;

      setLoadedChats((current) =>
        current.map((chat) =>
          chat.id === chatId ? { ...chat, unreadCount: 0 } : chat,
        ),
      );
      setActiveChatSnapshot((current) =>
        current?.id === chatId ? { ...current, unreadCount: 0 } : current,
      );
    }

    function handleTypingPreview(event: Event) {
      const detail = (event as CustomEvent<{
        chatId?: string;
        user?: TypingUser;
        isTyping?: boolean;
      }>).detail;

      if (!detail?.chatId || !detail.user) return;
      if (detail.user.id === user?.id) return;

      const key = `${detail.chatId}:${detail.user.id}`;
      const oldTimeout = typingPreviewTimeoutsRef.current.get(key);
      if (oldTimeout) {
        window.clearTimeout(oldTimeout);
        typingPreviewTimeoutsRef.current.delete(key);
      }

      setTypingPreviewByChatId((current) => {
        const users = current[detail.chatId!] ?? [];
        const nextUsers = detail.isTyping
          ? users.some((user) => user.id === detail.user!.id)
            ? users
            : [...users, detail.user!]
          : users.filter((user) => user.id !== detail.user!.id);

        return { ...current, [detail.chatId!]: nextUsers };
      });

      if (detail.isTyping) {
        const timeoutId = window.setTimeout(() => {
          setTypingPreviewByChatId((current) => ({
            ...current,
            [detail.chatId!]: (current[detail.chatId!] ?? []).filter(
              (user) => user.id !== detail.user!.id,
            ),
          }));
          typingPreviewTimeoutsRef.current.delete(key);
        }, 2400);
        typingPreviewTimeoutsRef.current.set(key, timeoutId);
      }
    }

    window.addEventListener("chat-read-locally", handleChatReadLocally);
    window.addEventListener("chat-typing-preview", handleTypingPreview);

    return () => {
      window.removeEventListener("chat-read-locally", handleChatReadLocally);
      window.removeEventListener("chat-typing-preview", handleTypingPreview);
      typingPreviewTimeoutsRef.current.forEach((timeoutId) =>
        window.clearTimeout(timeoutId),
      );
      typingPreviewTimeoutsRef.current.clear();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!notificationChatId) {
      return;
    }

    const chat =
      chats.find((item) => item.id === notificationChatId) ??
      chatByIdQuery.data ??
      null;

    if (chat) {
      if (notificationMessageId) {
        window.sessionStorage.setItem(
          "messages:pending-focus",
          JSON.stringify({ chatId: chat.id, messageId: notificationMessageId }),
        );
      }
      handleSelectChat(chat);
    }
  }, [
    chatByIdQuery.data,
    chats,
    handleSelectChat,
    notificationChatId,
    notificationMessageId,
  ]);

  const isGroup = activeChat?.type === "GROUP";
  const shouldScrollChatList = (meta?.total ?? chats.length) > 8;
  const emptyChatRows = shouldScrollChatList
    ? 0
    : Math.max(0, 8 - chats.length);

  return (
    <>
      <section className="flex h-[calc(100dvh-9rem)] min-h-[720px] w-full min-w-0 flex-col gap-5 lg:flex-row">
        <aside className="flex min-h-[620px] w-96 max-w-full flex-col overflow-hidden rounded-3xl border border-violet-100/70 bg-white shadow-sm max-lg:w-full lg:h-full">
          <div className="flex min-h-0 flex-1 flex-col p-8">
            <div className="mb-4 space-y-3">
              <h1 className="text-center text-2xl font-bold text-slate-950">
                Сообщения
              </h1>
              <button
                onClick={() => setGroupModalOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300 px-4 py-3 text-xs font-bold text-violet-600 transition hover:bg-violet-50"
              >
                <Users className="h-4 w-4" />
                Создать групповой чат
              </button>
            </div>

            <div className="space-y-2">
              <label className="flex h-11 w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-400">
                <Search className="h-4 w-4 shrink-0" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Поиск"
                  className="min-w-0 flex-1 bg-transparent text-zinc-900 outline-none placeholder:text-zinc-400"
                />
              </label>

              <select
                value={searchIn}
                onChange={(event) =>
                  setSearchIn(event.target.value as SearchIn)
                }
                className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none"
              >
                <option value="all">По всему</option>
                <option value="nicknames">По никнеймам и названиям чата</option>
                <option value="messages">По сообщениям</option>
              </select>
            </div>

            <div
              ref={chatListViewportRef}
              onScroll={handleChatsScroll}
              className={`mt-4 min-h-0 flex-1 overflow-x-hidden pb-5 ${shouldScrollChatList ? "overflow-y-auto pr-1" : "overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"}`}
            >
              {chatsQuery.isLoading && (
                <p className="py-10 text-center text-sm text-zinc-500">
                  Загружаем чаты...
                </p>
              )}

              {!chatsQuery.isLoading && chats.length === 0 && (
                <p className="py-10 text-center text-sm text-zinc-500">
                  Чаты не найдены
                </p>
              )}

              {!chatsQuery.isLoading && chats.length > 0 && (
                <div className="grid gap-2">
                  {chats.map((chat) => (
                    <ChatListItem
                      key={chat.id}
                      chat={chat}
                      active={chat.id === activeChatId}
                      search={search}
                      searchIn={searchIn}
                      typingUsers={typingPreviewByChatId[chat.id] ?? []}
                      onClick={() => handleSelectChat(chat)}
                    />
                  ))}

                  {Array.from({ length: emptyChatRows }).map((_, index) => (
                    <div
                      key={`empty-chat-row-${index}`}
                      className="h-16 rounded-2xl border border-dashed border-violet-100 bg-violet-50/20"
                    />
                  ))}

                  {chatsQuery.isFetching && page > 1 && (
                    <p className="py-3 text-center text-xs font-semibold text-zinc-400">
                      Загружаем ещё чаты...
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="flex min-h-[620px] min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-violet-100/70 bg-white shadow-sm lg:h-full">
          {!activeChat && (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                <Users className="h-8 w-8" />
              </div>

              <h2 className="text-xl font-bold text-slate-950">Выберите чат</h2>

              <p className="mt-2 max-w-sm text-sm text-zinc-500">
                Сначала слева выбери личный или групповой чат. После этого
                переписка откроется здесь.
              </p>
            </div>
          )}

          {activeChat && (
            <div className="flex h-full min-h-0 flex-1 flex-col">
              <div className="shrink-0">
                <ChatHeader
                  chat={activeChat}
                  view={view}
                  setView={setView}
                  isGroup={isGroup}
                />
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {view === "chat" && (
                  <ChatMessagesView
                    key={activeChat.id}
                    chat={activeChat}
                    currentUserId={user!.id}
                    focusMessageId={focusMessageId}
                    onFocusMessageHandled={handleFocusMessageHandled}
                    onDraftCreated={handleCreatedChat}
                  />
                )}

                {view === "members" && isGroup && !activeChat.isReadOnly && (
                  <ChatMembersView chat={activeChat} />
                )}

                {view === "attachments" && !activeChat.isReadOnly && !activeChat.isDraft && (
                  <ChatAttachmentsView
                    chat={activeChat}
                    attachmentType={attachmentType}
                    setAttachmentType={setAttachmentType}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </section>

      {groupModalOpen && (
        <CreateGroupChatModal
          onClose={() => setGroupModalOpen(false)}
          onCreated={handleCreatedChat}
        />
      )}
    </>
  );
}

function ChatListItem({
  chat,
  active,
  search,
  searchIn,
  typingUsers,
  onClick,
}: {
  chat: Chat;
  active: boolean;
  search: string;
  searchIn: SearchIn;
  typingUsers: TypingUser[];
  onClick: () => void;
}) {
  const shouldShowMatchedMessage = Boolean(
    search.trim() && searchIn !== "nicknames" && chat.matchedMessage,
  );
  const previewMessage = shouldShowMatchedMessage
    ? chat.matchedMessage
    : chat.lastMessage;
  const sharedPreview = parseSharedPostContent(previewMessage?.content);
  const eventPreview = parseChatEventContent(previewMessage?.content);
  const eventPreviewText = eventPreview
    ? eventPreview.type === "created"
      ? "Групповой чат создан"
      : eventPreview.type === "remove"
        ? `${eventPreview.actor.username} удалил(а) ${eventPreview.targets.map((target) => target.username).join(", ")} из группы`
        : `${eventPreview.actor.username} пригласил(а) ${eventPreview.targets.map((target) => target.username).join(", ")}`
    : null;
  const typingPreviewText = typingUsers.length
    ? `${typingUsers.map((typingUser) => typingUser.username).join(", ")} печатает...`
    : null;
  const previewText = typingPreviewText
    ? typingPreviewText
    : sharedPreview
      ? "Поделился постом"
      : eventPreviewText
        ? eventPreviewText
        : previewMessage?.content ||
          previewMessage?.attachments[0]?.file.filename ||
          "Пока нет сообщений";
  const previewTime = previewMessage?.createdAt ?? chat.lastMessageAt;

  return (
    <button
      onClick={onClick}
      className={`flex min-h-16 w-full min-w-0 items-center gap-3 overflow-hidden rounded-2xl p-3 text-left transition ${
        active ? "bg-violet-50" : "hover:bg-zinc-50"
      }`}
    >
      <Avatar
        title={chat.title}
        src={chat.avatarUrl}
        isOnline={chat.type === "DIRECT" && Boolean(chat.directUser?.isOnline)}
      />
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
            {chat.title}
          </span>
          <span className="shrink-0 text-[11px] text-zinc-400">
            {formatChatListDate(previewTime)}
          </span>
        </span>
        <span
          className={`mt-1 block max-w-full truncate text-xs ${shouldShowMatchedMessage || typingPreviewText ? "font-semibold text-violet-600" : "text-zinc-500"}`}
        >
          {shouldShowMatchedMessage && !typingPreviewText ? `Найдено: ${previewText}` : previewText}
        </span>
      </span>
      {chat.unreadCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 text-[11px] font-bold text-white">
          {chat.unreadCount}
        </span>
      )}
    </button>
  );
}

function ChatHeader({
  chat,
  view,
  setView,
  isGroup,
}: {
  chat: Chat;
  view: ChatView;
  setView: (view: ChatView) => void;
  isGroup: boolean;
}) {
  const router = useRouter();
  const actions = useChatActionMutations();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [previewImageOpen, setPreviewImageOpen] = useState(false);
  const menuRef = useDismissibleLayer<HTMLDivElement>(menuOpen, () =>
    setMenuOpen(false),
  );
  const directOnline = Boolean(chat.directUser?.isOnline);
  const isRemovedGroup = isGroup && chat.isReadOnly;
  const canManageChat =
    isGroup &&
    (chat.currentUserRole === "OWNER" || chat.currentUserRole === "ADMIN");

  function goToDirectProfile() {
    if (!isGroup && chat.directUser) {
      router.push(getProfileHref(chat.directUser.username));
    }
  }

  return (
    <>
      <header className="relative flex shrink-0 items-center justify-between gap-4 border-b border-zinc-100 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {view !== "chat" && (
            <button
              onClick={() => setView("chat")}
              className="rounded-full p-2 text-slate-700 hover:bg-zinc-100"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {isGroup ? (
            <div className="flex min-w-0 items-center gap-3 rounded-2xl text-left">
              <button
                type="button"
                onClick={() => !isRemovedGroup && chat.avatarUrl && setPreviewImageOpen(true)}
                disabled={isRemovedGroup || !chat.avatarUrl}
                className={`shrink-0 rounded-full ${!isRemovedGroup && chat.avatarUrl ? "cursor-zoom-in hover:ring-4 hover:ring-violet-100" : "cursor-default"}`}
                aria-label="Посмотреть аватар группы"
              >
                <Avatar
                  title={chat.title}
                  src={isRemovedGroup ? null : chat.avatarUrl}
                  isOnline={
                    chat.type === "DIRECT" && Boolean(chat.directUser?.isOnline)
                  }
                />
              </button>
              <span className="min-w-0">
                <span className="block truncate text-base font-bold text-slate-950">
                  {chat.title}
                </span>
                {!isRemovedGroup && (
                  <span className="block text-xs font-medium text-zinc-500">
                    {chat.membersCount} участников
                  </span>
                )}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={goToDirectProfile}
              disabled={!chat.directUser}
              className={`flex min-w-0 items-center gap-3 rounded-2xl text-left ${chat.directUser ? "cursor-pointer hover:bg-violet-50" : "cursor-default"}`}
            >
              <Avatar
                title={chat.title}
                src={chat.avatarUrl}
                isOnline={
                  chat.type === "DIRECT" && Boolean(chat.directUser?.isOnline)
                }
              />
              <span className="min-w-0">
                <span className="block truncate text-base font-bold text-slate-950">
                  {chat.title}
                </span>
                <span className="block text-xs font-medium text-zinc-500">
                  {directOnline
                    ? "Онлайн"
                    : formatLastSeen(chat.directUser?.lastLoginAt)}
                </span>
              </span>
            </button>
          )}
        </div>

        {!chat.isDraft && (
          <div className="flex items-center gap-2">
            <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((value) => !value)}
              className="rounded-full p-2 text-slate-700 hover:bg-zinc-100"
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-11 z-20 w-64 rounded-2xl border border-zinc-100 bg-white p-2 text-sm shadow-xl">
                {isGroup && !isRemovedGroup && (
                  <>
                    <button
                      onClick={() => {
                        setView("members");
                        setMenuOpen(false);
                      }}
                      className="w-full rounded-xl px-3 py-2 text-left hover:bg-violet-50"
                    >
                      Участники чата
                    </button>
                    {canManageChat && (
                      <>
                        <button
                          onClick={() => {
                            setRenameOpen(true);
                            setMenuOpen(false);
                          }}
                          className="w-full rounded-xl px-3 py-2 text-left hover:bg-violet-50"
                        >
                          Изменить имя чата
                        </button>
                        <button
                          onClick={() => {
                            setAvatarOpen(true);
                            setMenuOpen(false);
                          }}
                          className="w-full rounded-xl px-3 py-2 text-left hover:bg-violet-50"
                        >
                          Изменить аватар чата
                        </button>
                      </>
                    )}
                  </>
                )}
                {!isRemovedGroup && (
                  <button
                    onClick={() => {
                      setView("attachments");
                      setMenuOpen(false);
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left hover:bg-violet-50"
                  >
                    Вложения чата
                  </button>
                )}
                {!isRemovedGroup && (
                  <button
                    onClick={() => {
                      actions.toggleNotifications.mutate({
                        chatId: chat.id,
                        enabled: !chat.notificationsEnabled,
                      });
                      setMenuOpen(false);
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left hover:bg-violet-50"
                  >
                    {chat.notificationsEnabled
                      ? "Выкл уведомления"
                      : "Вкл уведомления"}
                  </button>
                )}
                <button
                  onClick={() => {
                    actions.leaveOrDeleteChat.mutate(chat.id);
                    setMenuOpen(false);
                  }}
                  className="w-full rounded-xl px-3 py-2 text-left text-red-600 hover:bg-red-50"
                >
                  {isGroup && chat.currentUserRole === "OWNER"
                    ? "Удалить чат"
                    : isGroup
                      ? "Покинуть и удалить чат"
                      : "Удалить чат"}
                </button>
              </div>
            )}
            </div>
          </div>
        )}
      </header>

      {renameOpen && (
        <RenameChatModal chat={chat} onClose={() => setRenameOpen(false)} />
      )}
      {avatarOpen && (
        <ChangeChatAvatarModal
          chat={chat}
          onClose={() => setAvatarOpen(false)}
        />
      )}
      {previewImageOpen && !isRemovedGroup && chat.avatarUrl && (
        <ImagePreviewModal
          src={chat.avatarUrl}
          title={chat.title}
          onClose={() => setPreviewImageOpen(false)}
        />
      )}
    </>
  );
}

function RenameChatModal({
  chat,
  onClose,
}: {
  chat: Chat;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(chat.title);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useDismissibleLayer<HTMLDivElement>(true, onClose);
  const actions = useChatActionMutations();

  useEffect(() => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.focus();
    const caretPosition = input.value.length;
    input.setSelectionRange(caretPosition, caretPosition);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    setSubmitError(null);

    if (!trimmedTitle) {
      setSubmitError("Название чата не может быть пустым");
      return;
    }

    try {
      await actions.updateChatTitle.mutateAsync({
        chatId: chat.id,
        title: trimmedTitle,
      });
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Не удалось изменить название чата",
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-6">
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Изменить имя чата
            </h2>
            <p className="mt-1 text-sm text-zinc-500">Минимум один символ.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-800">
              Название
            </span>
            <input
              ref={inputRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-violet-300"
            />
          </label>

          {submitError && (
            <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={!title.trim() || actions.updateChatTitle.isPending}
            className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-100 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actions.updateChatTitle.isPending
              ? "Сохраняем..."
              : "Сохранить имя"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ChangeChatAvatarModal({
  chat,
  onClose,
}: {
  chat: Chat;
  onClose: () => void;
}) {
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    getAssetUrl(chat.avatarUrl) ?? null,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useDismissibleLayer<HTMLDivElement>(true, onClose);
  const uploadFile = useUploadFileMutation();
  const actions = useChatActionMutations();

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];

    if (!nextFile) {
      return;
    }

    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    event.target.value = "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!file) {
      setSubmitError("Сначала выбери новый аватар");
      return;
    }

    try {
      const uploaded = await uploadFile.mutateAsync({ file, type: "IMAGE" });
      await actions.updateChatAvatar.mutateAsync({
        chatId: chat.id,
        avatarUrl: uploaded.url,
      });
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Не удалось изменить аватар чата",
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-6">
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Изменить аватар чата
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Аватар изменится только после подтверждения.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-violet-100 bg-violet-50/30 p-5">
            <button
              type="button"
              onClick={() => previewUrl && setFullPreviewOpen(true)}
              disabled={!previewUrl}
              className={
                previewUrl
                  ? "cursor-zoom-in rounded-full transition hover:ring-4 hover:ring-violet-100"
                  : "cursor-default rounded-full"
              }
              aria-label="Посмотреть аватар полностью"
            >
              <Avatar title={chat.title} src={previewUrl} size="lg" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-2xl border border-violet-200 px-4 py-2 text-sm font-bold text-violet-600 transition hover:bg-white"
            >
              Выбрать новый аватар
            </button>
          </div>

          {submitError && (
            <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={
              !file ||
              uploadFile.isPending ||
              actions.updateChatAvatar.isPending
            }
            className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-100 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploadFile.isPending || actions.updateChatAvatar.isPending
              ? "Сохраняем..."
              : "Подтвердить аватар"}
          </button>
        </form>
      </div>
      {fullPreviewOpen && previewUrl && (
        <ImagePreviewModal
          src={previewUrl}
          title={chat.title}
          onClose={() => setFullPreviewOpen(false)}
        />
      )}
    </div>
  );
}

function ChatMessagesView({
  chat,
  currentUserId,
  focusMessageId,
  onFocusMessageHandled,
  onDraftCreated,
}: {
  chat: Chat;
  currentUserId: string;
  focusMessageId: string | null;
  onFocusMessageHandled: () => void;
  onDraftCreated: (chat: Chat) => void;
}) {
  const messagesQuery = useChatMessagesQuery(chat.isDraft ? null : chat.id);
  const pinnedQuery = usePinnedMessagesQuery(chat.isDraft ? null : chat.id);
  const createMessage = useCreateMessageMutation();
  const createDirectChat = useCreateDirectChatMutation();
  const uploadFile = useUploadFileMutation();
  const actions = useChatActionMutations();
  const socket = useChatSocket(chat.isDraft || chat.isReadOnly ? null : chat.id);
  const [content, setContent] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingChatAttachment[]
  >([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [waveLevels, setWaveLevels] = useState<number[]>(() =>
    Array.from({ length: 24 }, () => 8),
  );
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [fileAccept, setFileAccept] = useState(getUploadAccept("FILE"));
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const typingStopTimeoutRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef(new Map<string, HTMLDivElement>());
  const highlightTimeoutRef = useRef<number | null>(null);
  const restoredInitialScrollRef = useRef(false);
  const focusHandledRef = useRef<string | null>(null);
  const scrollAfterSendRef = useRef(false);
  const pendingUploadTypeRef = useRef<FileAssetType>("FILE");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const discardRecordingRef = useRef(false);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingAnimationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentRef = useDismissibleLayer<HTMLDivElement>(
    attachmentOpen,
    () => setAttachmentOpen(false),
  );
  const emojiRef = useDismissibleLayer<HTMLDivElement>(emojiOpen, () =>
    setEmojiOpen(false),
  );

  const messages = messagesQuery.data?.items ?? [];
  const pinnedMessages = pinnedQuery.data?.items ?? [];
  const activePinned = pinnedMessages[pinnedIndex];
  const visiblePinnedMessages = pinnedMessages.slice(
    0,
    Math.min(6, pinnedMessages.length),
  );
  const activePinnedDotIndex = Math.min(
    pinnedIndex,
    Math.max(0, visiblePinnedMessages.length - 1),
  );
  const scrollStorageKey = `chat-scroll:${chat.id}`;

  const setMessageRef = useCallback(
    (messageId: string): RefCallback<HTMLDivElement> => {
      return (node) => {
        if (node) {
          messageRefs.current.set(messageId, node);
        } else {
          messageRefs.current.delete(messageId);
        }
      };
    },
    [],
  );

  const saveScrollPosition = useCallback(() => {
    const node = messagesViewportRef.current;

    if (!node) {
      return;
    }

    window.localStorage.setItem(scrollStorageKey, String(node.scrollTop));
  }, [scrollStorageKey]);

  const scrollToMessage = useCallback(
    (messageId: string) => {
      const element = messageRefs.current.get(messageId);

      if (!element) {
        return false;
      }

      element.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMessageId(messageId);

      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }

      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedMessageId((current) =>
          current === messageId ? null : current,
        );
      }, 2400);

      window.setTimeout(saveScrollPosition, 700);
      return true;
    },
    [saveScrollPosition],
  );

  function handlePinnedNavigation(nextIndex: number) {
    const normalizedIndex = Math.min(
      Math.max(nextIndex, 0),
      pinnedMessages.length - 1,
    );
    setPinnedIndex(normalizedIndex);
  }

  function handlePinnedDotClick(dotIndex: number) {
    const nextIndex = Math.min(dotIndex, pinnedMessages.length - 1);
    setPinnedIndex(nextIndex);
  }

  function openFilePicker(type: FileAssetType) {
    pendingUploadTypeRef.current = type;
    setFileAccept(getUploadAccept(type));
    setAttachmentOpen(false);
    window.requestAnimationFrame(() => fileInputRef.current?.click());
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const type = inferUploadType(file, pendingUploadTypeRef.current);

    try {
      setRecordingError(null);
      const uploaded = await uploadFile.mutateAsync({ file, type });
      setPendingAttachments((current) => [
        ...current,
        {
          ...uploaded,
          localId: crypto.randomUUID(),
        },
      ]);
    } catch (error) {
      setRecordingError(
        error instanceof Error ? error.message : "Не удалось загрузить файл",
      );
    }
  }

  function removePendingAttachment(localId: string) {
    setPendingAttachments((current) =>
      current.filter((attachment) => attachment.localId !== localId),
    );
  }

  function stopRecordingTracks() {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }

  function stopRecordingVisualization() {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (recordingAnimationRef.current) {
      window.cancelAnimationFrame(recordingAnimationRef.current);
      recordingAnimationRef.current = null;
    }

    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    analyserRef.current = null;
  }

  function startRecordingVisualization(stream: MediaStream) {
    setRecordingSeconds(0);
    setWaveLevels(Array.from({ length: 24 }, () => 8));

    recordingTimerRef.current = window.setInterval(() => {
      setRecordingSeconds((value) => value + 1);
    }, 1000);

    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioContextCtor) {
        return;
      }

      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      analyser.fftSize = 64;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      function draw() {
        analyser.getByteTimeDomainData(dataArray);
        const samples = Array.from(dataArray).slice(0, 24);
        setWaveLevels(
          samples.map(
            (sample) => 8 + Math.min(36, Math.abs(sample - 128) * 1.5),
          ),
        );
        recordingAnimationRef.current = window.requestAnimationFrame(draw);
      }

      draw();
    } catch {
      setWaveLevels(
        Array.from({ length: 24 }, (_, index) => 8 + ((index * 7) % 24)),
      );
    }
  }

  async function startVoiceRecording() {
    setRecordingError(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setRecordingError("Браузер не поддерживает запись аудио");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      recordingChunksRef.current = [];
      discardRecordingRef.current = false;
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const chunks = recordingChunksRef.current;
        const shouldDiscard = discardRecordingRef.current;
        recordingChunksRef.current = [];
        discardRecordingRef.current = false;
        stopRecordingTracks();
        stopRecordingVisualization();
        setIsRecording(false);

        if (shouldDiscard || chunks.length === 0) {
          return;
        }

        const mimeType = recorder.mimeType || "audio/webm";
        const extension = mimeType.includes("mp4")
          ? "m4a"
          : mimeType.includes("ogg")
            ? "ogg"
            : "webm";
        const blob = new Blob(chunks, { type: mimeType });
        const voiceFile = new globalThis.File(
          [blob],
          `voice-message-${Date.now()}.${extension}`,
          { type: mimeType },
        );

        try {
          const uploaded = await uploadFile.mutateAsync({
            file: voiceFile,
            type: "AUDIO",
          });
          setPendingAttachments((current) => [
            ...current,
            {
              ...uploaded,
              localId: crypto.randomUUID(),
            },
          ]);
        } catch (error) {
          setRecordingError(
            error instanceof Error
              ? error.message
              : "Не удалось добавить аудиосообщение",
          );
        }
      };

      recorder.start();
      setIsRecording(true);
      startRecordingVisualization(stream);
    } catch (error) {
      stopRecordingTracks();
      stopRecordingVisualization();
      setIsRecording(false);
      setRecordingError(
        error instanceof Error
          ? error.message
          : "Не удалось начать запись аудио",
      );
    }
  }

  function stopVoiceRecording() {
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopRecordingTracks();
      stopRecordingVisualization();
      setIsRecording(false);
    }
  }

  function handleVoiceButtonClick() {
    if (isRecording) {
      stopVoiceRecording();
    } else {
      void startVoiceRecording();
    }
  }

  useEffect(() => {
    return () => {
      saveScrollPosition();
      discardRecordingRef.current = true;

      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      } else {
        stopRecordingTracks();
        stopRecordingVisualization();
      }

      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, [saveScrollPosition]);

  useEffect(() => {
    setPinnedIndex((current) =>
      Math.min(current, Math.max(0, pinnedMessages.length - 1)),
    );
  }, [pinnedMessages.length]);

  useEffect(() => {
    if (
      messagesQuery.isLoading ||
      messages.length === 0 ||
      restoredInitialScrollRef.current ||
      focusMessageId
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const node = messagesViewportRef.current;
      const savedScrollTop = window.localStorage.getItem(scrollStorageKey);

      if (node && savedScrollTop !== null) {
        node.scrollTop = Number(savedScrollTop);
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }

      restoredInitialScrollRef.current = true;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    focusMessageId,
    messages.length,
    messagesQuery.isLoading,
    scrollStorageKey,
  ]);

  useEffect(() => {
    if (!focusMessageId || messages.length === 0) {
      return;
    }

    const targetFocusMessageId = focusMessageId;
    let cancelled = false;
    let attempts = 0;

    function tryScroll() {
      if (cancelled) {
        return;
      }

      const scrolled = scrollToMessage(targetFocusMessageId);

      if (scrolled) {
        focusHandledRef.current = targetFocusMessageId;
        restoredInitialScrollRef.current = true;
        onFocusMessageHandled();
        return;
      }

      attempts += 1;

      if (attempts <= 40) {
        window.setTimeout(tryScroll, 100);
      }
    }

    const frame = window.requestAnimationFrame(tryScroll);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [focusMessageId, messages.length, onFocusMessageHandled, scrollToMessage]);

  useEffect(() => {
    if (!scrollAfterSendRef.current || messages.length === 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      scrollAfterSendRef.current = false;
      window.setTimeout(saveScrollPosition, 600);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, saveScrollPosition]);

  useEffect(() => {
    if (chat.isDraft || chat.unreadCount <= 0) {
      return;
    }

    actions.markAsRead.mutate({ chatId: chat.id });
    window.dispatchEvent(
      new CustomEvent("chat-read-locally", { detail: { chatId: chat.id } }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id, chat.isDraft, chat.unreadCount]);

  useEffect(() => {
    if (chat.isDraft) {
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      actions.markAsRead.mutate({ chatId: chat.id });
      socket.markRead(lastMessage.id);
      window.dispatchEvent(
        new CustomEvent("chat-read-locally", { detail: { chatId: chat.id } }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id, chat.isDraft, messages.length]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (chat.isReadOnly) {
      return;
    }

    const trimmed = content.trim();

    if (!trimmed && pendingAttachments.length === 0) {
      return;
    }

    const payload = {
      content: trimmed || undefined,
      parentId: replyTo?.id,
      attachments: pendingAttachments.map(
        ({ localId: _localId, ...attachment }) => attachment,
      ),
    };

    scrollAfterSendRef.current = true;
    try {
      if (chat.isDraft) {
        const target = chat.directUser?.username ?? chat.title;
        const createdChat = await createDirectChat.mutateAsync(target);
        const createdMessage = await createMessage.mutateAsync({
          chatId: createdChat.id,
          ...payload,
        });
        onDraftCreated({
          ...createdChat,
          lastMessage: createdMessage,
          lastMessageAt: createdMessage.createdAt,
          unreadCount: 0,
          isDraft: false,
        });
      } else {
        try {
          await socket.sendMessage(payload);
        } catch {
          await createMessage.mutateAsync({
            chatId: chat.id,
            ...payload,
          });
        }
      }
    } finally {
      setContent("");
      setPendingAttachments([]);
      setReplyTo(null);
      socket.sendTyping(false);
    }
  }

  function handleTyping(value: string) {
    setContent(value);
    if (chat.isDraft || chat.isReadOnly) {
      return;
    }
    socket.sendTyping(true);

    if (typingStopTimeoutRef.current) {
      window.clearTimeout(typingStopTimeoutRef.current);
    }

    typingStopTimeoutRef.current = window.setTimeout(
      () => socket.sendTyping(false),
      2000,
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {activePinned && (
        <div className="shrink-0 border-b border-violet-100 bg-violet-50/60 px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => scrollToMessage(activePinned.id)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-2 py-1 text-left transition hover:bg-white/60"
            >
              <Pin className="h-4 w-4 shrink-0 text-violet-600" />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-violet-700">
                  Закрепленное сообщение {pinnedIndex + 1} из{" "}
                  {pinnedMessages.length}
                </span>
                <span className="block truncate text-sm text-slate-700">
                  {activePinned.content ||
                    activePinned.attachments[0]?.file.filename ||
                    "Вложение"}
                </span>
              </span>
            </button>

            <div className="flex shrink-0 items-center gap-2">
              {pinnedMessages.length > 6 && (
                <button
                  type="button"
                  disabled={pinnedIndex === 0}
                  onClick={() => handlePinnedNavigation(pinnedIndex - 1)}
                  className="rounded-full p-1.5 text-violet-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Предыдущее закрепленное сообщение"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}

              <div className="flex items-center gap-1">
                {visiblePinnedMessages.map((message, index) => (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => handlePinnedDotClick(index)}
                    className={`h-2.5 w-2.5 rounded-full ${index === activePinnedDotIndex ? "bg-violet-600" : "bg-violet-200"}`}
                    aria-label={`Закреп ${index + 1}`}
                  />
                ))}
              </div>

              {pinnedMessages.length > 6 && (
                <button
                  type="button"
                  disabled={pinnedIndex >= pinnedMessages.length - 1}
                  onClick={() => handlePinnedNavigation(pinnedIndex + 1)}
                  className="rounded-full p-1.5 text-violet-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Следующее закрепленное сообщение"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        ref={messagesViewportRef}
        onScroll={saveScrollPosition}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-white via-violet-50/20 to-white px-6 py-6"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {messagesQuery.isLoading && (
            <p className="py-10 text-center text-sm text-zinc-500">
              Загружаем сообщения...
            </p>
          )}

          {!messagesQuery.isLoading && messages.length === 0 && (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-violet-100 bg-white/70 px-6 text-center">
              <p className="text-base font-bold text-slate-900">
                Сообщений пока нет
              </p>
              <p className="mt-2 max-w-sm text-sm text-zinc-500">
                Напиши первое сообщение, и чат появится в списке у вас обоих.
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              chat={chat}
              isOwn={message.senderId === currentUserId}
              isLastMessage={index === messages.length - 1}
              currentUserId={currentUserId}
              highlighted={highlightedMessageId === message.id}
              messageRef={setMessageRef(message.id)}
              onReply={() => setReplyTo(message)}
              onReact={(emoji) => socket.react(message.id, emoji)}
            />
          ))}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-100 bg-white px-6 py-4">
        {socket.typingUsers.length > 0 && (
          <p className="mb-2 text-xs font-medium text-violet-600">
            {socket.typingUsers
              .map((typingUser) => typingUser.username)
              .join(", ")}{" "}
            печатает...
          </p>
        )}

        {replyTo && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-violet-700">
                Ответ пользователю {replyTo.sender?.username ?? "Пользователь"}
              </p>
              <p className="truncate text-sm text-slate-600">
                {replyTo.content}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="shrink-0 text-slate-500 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {recordingError && (
          <p className="mb-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600">
            {recordingError}
          </p>
        )}

        {isRecording && (
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-red-600">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-bold">
              Запись {formatRecordingDuration(recordingSeconds)}
            </span>
            <div
              className="flex h-10 min-w-0 flex-1 items-center gap-1 overflow-hidden"
              aria-label="Волна записи аудио"
            >
              {waveLevels.map((level, index) => (
                <span
                  key={index}
                  className="w-1 rounded-full bg-red-400/80 transition-all duration-75"
                  style={{ height: `${Math.max(6, level)}px` }}
                />
              ))}
            </div>
            <span className="text-xs font-semibold text-red-500">
              нажми микрофон ещё раз, чтобы прикрепить
            </span>
          </div>
        )}

        {chat.isReadOnly && (
          <div className="mb-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
            Вы больше не участник этого чата. История доступна, но новые
            сообщения отправлять нельзя.
          </div>
        )}

        {pendingAttachments.length > 0 && (
          <div className="mb-3 grid gap-2">
            {pendingAttachments.map((attachment) => (
              <PendingAttachmentRow
                key={attachment.localId}
                attachment={attachment}
                onRemove={() => removePendingAttachment(attachment.localId)}
              />
            ))}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="relative flex w-full items-center gap-3 max-md:flex-wrap"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={fileAccept}
            className="hidden"
            onChange={handleFileSelected}
          />

          <div ref={attachmentRef} className="relative shrink-0">
            <button
              type="button"
              disabled={chat.isReadOnly}
              onClick={() => setAttachmentOpen((value) => !value)}
              className="rounded-full p-2 text-slate-600 hover:bg-zinc-100"
            >
              <Paperclip className="h-5 w-5" />
            </button>

            {attachmentOpen && (
              <div className="absolute bottom-12 left-0 z-20 grid w-56 gap-1 rounded-2xl border border-zinc-100 bg-white p-2 text-sm shadow-xl">
                <AttachmentButton
                  icon={<ImageIcon className="h-4 w-4" />}
                  label="Изображение"
                  onClick={() => openFilePicker("IMAGE")}
                />
                <AttachmentButton
                  icon={<Video className="h-4 w-4" />}
                  label="Видео"
                  onClick={() => openFilePicker("VIDEO")}
                />
                <AttachmentButton
                  icon={<FileIcon className="h-4 w-4" />}
                  label="Файл"
                  onClick={() => openFilePicker("FILE")}
                />
                <AttachmentButton
                  icon={<Archive className="h-4 w-4" />}
                  label="Архив"
                  onClick={() => openFilePicker("ARCHIVE")}
                />
              </div>
            )}
          </div>

          <input
            value={content}
            onChange={(event) => handleTyping(event.target.value)}
            placeholder={
              uploadFile.isPending
                ? "Загружаем файл..."
                : pendingAttachments.length > 0
                  ? "Добавьте подпись к вложению..."
                  : "Напишите сообщение..."
            }
            disabled={chat.isReadOnly || uploadFile.isPending || isRecording}
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-violet-300 disabled:bg-zinc-50 max-md:order-first max-md:w-full max-md:flex-none"
          />

          <div ref={emojiRef} className="relative shrink-0">
            <button
              type="button"
              disabled={chat.isReadOnly}
              onClick={() => setEmojiOpen((value) => !value)}
              className="rounded-full p-2 text-slate-600 hover:bg-zinc-100"
            >
              <Smile className="h-5 w-5" />
            </button>

            {emojiOpen && (
              <div className="absolute bottom-12 right-0 z-30 grid w-60 grid-cols-5 gap-1 rounded-2xl border border-zinc-100 bg-white p-2 text-2xl leading-none shadow-xl">
                {emojiOptions.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setContent((value) => `${value}${emoji}`);
                      setEmojiOpen(false);
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-violet-50"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleVoiceButtonClick}
            disabled={
              chat.isReadOnly || uploadFile.isPending || createMessage.isPending
            }
            className={`shrink-0 rounded-full p-2 transition disabled:opacity-50 ${isRecording ? "bg-red-50 text-red-600 ring-2 ring-red-200" : "text-slate-600 hover:bg-zinc-100"}`}
            title={
              isRecording
                ? "Остановить и прикрепить запись"
                : "Записать аудиосообщение"
            }
          >
            <Mic className="h-5 w-5" />
          </button>

          <button
            type="submit"
            disabled={
              chat.isReadOnly ||
              createMessage.isPending ||
              uploadFile.isPending ||
              isRecording ||
              (!content.trim() && pendingAttachments.length === 0)
            }
            className="shrink-0 rounded-full bg-violet-600 p-3 text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}

function AttachmentButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-violet-50"
    >
      {icon}
      {label}
    </button>
  );
}

function PendingAttachmentRow({
  attachment,
  onRemove,
}: {
  attachment: PendingChatAttachment;
  onRemove: () => void;
}) {
  const url = getAssetUrl(attachment.url) ?? attachment.url;
  const title = attachment.filename ?? "Вложение";

  if (attachment.type === "AUDIO") {
    return (
      <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-xs font-bold text-slate-800">
            <Volume2 className="h-4 w-4 shrink-0 text-violet-600" />
            <span className="truncate">{title}</span>
            <span className="shrink-0 text-[11px] font-medium text-zinc-500">
              {formatFileSize(attachment.sizeBytes)}
            </span>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full p-2 text-zinc-400 hover:bg-white hover:text-red-500"
            aria-label="Убрать вложение"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-2xl bg-white/80 px-3 py-2">
          <div
            className="mb-2 flex h-8 items-center gap-1 overflow-hidden"
            aria-label="Волна аудиосообщения"
          >
            {Array.from({ length: 38 }).map((_, index) => (
              <span
                key={index}
                className="w-1 rounded-full bg-violet-400/80"
                style={{ height: `${8 + ((index * 11) % 24)}px` }}
              />
            ))}
          </div>
          <audio src={url} controls className="w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-violet-600">
          {attachment.type === "IMAGE" ? (
            <img src={url} alt={title} className="h-full w-full object-cover" />
          ) : attachment.type === "VIDEO" ? (
            <Video className="h-5 w-5" />
          ) : attachment.type === "ARCHIVE" ? (
            <Archive className="h-5 w-5" />
          ) : (
            <FileIcon className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-800">{title}</p>
          <p className="text-[11px] font-medium text-zinc-500">
            {formatFileSize(attachment.sizeBytes)}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-2 text-zinc-400 hover:bg-white hover:text-red-500"
        aria-label="Убрать вложение"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function AttachmentPreview({
  attachment,
}: {
  attachment: ChatMessage["attachments"][number];
}) {
  const [preview, setPreview] = useState<null | "IMAGE" | "VIDEO">(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const file = attachment.file;
  const url = getAssetUrl(file.url) ?? file.url;
  const title = file.filename ?? file.url;

  async function handleDownload() {
    try {
      setDownloadError(null);
      await downloadAsset(url, title);
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Не удалось скачать файл",
      );
    }
  }

  if (file.type === "IMAGE") {
    return (
      <>
        <button
          type="button"
          onClick={() => setPreview("IMAGE")}
          className="block w-full overflow-hidden rounded-2xl border border-white/70 bg-white/70 text-left transition hover:ring-2 hover:ring-violet-200"
        >
          <div className="flex h-52 w-80 max-w-full items-center justify-center bg-zinc-50">
            <img src={url} alt={title} className="h-full w-full object-cover" />
          </div>
          <span className="block truncate px-3 py-2 text-xs font-semibold text-slate-700">
            {title}
          </span>
        </button>
        {preview && (
          <MediaPreviewModal
            src={url}
            title={title}
            type={preview}
            onClose={() => setPreview(null)}
          />
        )}
      </>
    );
  }

  if (file.type === "VIDEO") {
    return (
      <>
        <button
          type="button"
          onClick={() => setPreview("VIDEO")}
          className="block w-full overflow-hidden rounded-2xl border border-white/70 bg-black text-left transition hover:ring-2 hover:ring-violet-200"
        >
          <div className="flex h-52 w-80 max-w-full items-center justify-center bg-black">
            <video
              src={url}
              className="h-full w-full object-cover"
              muted
              preload="metadata"
            />
          </div>
          <span className="block truncate bg-white px-3 py-2 text-xs font-semibold text-slate-700">
            {title}
          </span>
        </button>
        {preview && (
          <MediaPreviewModal
            src={url}
            title={title}
            type={preview}
            onClose={() => setPreview(null)}
          />
        )}
      </>
    );
  }

  if (file.type === "AUDIO") {
    return (
      <div className="w-80 max-w-full rounded-2xl border border-white/70 bg-white/70 px-3 py-2">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Volume2 className="h-4 w-4 text-violet-600" />
          <span className="truncate">{title}</span>
        </div>
        <audio src={url} controls className="w-full" />
      </div>
    );
  }

  const Icon = file.type === "ARCHIVE" ? Archive : FileIcon;

  return (
    <div className="w-80 max-w-full">
      <button
        type="button"
        onClick={handleDownload}
        className="flex w-full items-center gap-3 rounded-2xl border border-white/70 bg-white/70 px-3 py-3 text-left text-xs font-semibold text-slate-700 transition hover:bg-white hover:text-violet-600"
      >
        <Icon className="h-5 w-5 shrink-0 text-violet-600" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{title}</span>
          <span className="mt-0.5 block text-[11px] font-medium text-zinc-400">
            {formatFileSize(file.sizeBytes)}
          </span>
        </span>
      </button>
      {downloadError && (
        <p className="mt-1 text-[11px] font-semibold text-red-500">
          {downloadError}
        </p>
      )}
    </div>
  );
}

type SharedPostPayload = {
  postId: string;
  authorUsername: string;
  authorAvatarUrl?: string | null;
  content?: string | null;
  coverUrl?: string | null;
  coverType?: FileAssetType | null;
};

type ChatEventPayload = {
  type: "invite" | "remove" | "created";
  actor: { id: string; username: string };
  targets: Array<{ id: string; username: string }>;
};

function parseSharedPostContent(
  content: string | null | undefined,
): SharedPostPayload | null {
  if (!content?.startsWith("__POST_SHARE__")) {
    return null;
  }

  try {
    return JSON.parse(
      content.slice("__POST_SHARE__".length),
    ) as SharedPostPayload;
  } catch {
    return null;
  }
}

function parseChatEventContent(
  content: string | null | undefined,
): ChatEventPayload | null {
  if (!content?.startsWith("__CHAT_EVENT__")) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      content.slice("__CHAT_EVENT__".length),
    ) as ChatEventPayload;
    return parsed?.type === "invite" ||
      parsed?.type === "remove" ||
      parsed?.type === "created"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function ChatEventMessage({
  payload,
  currentUsername,
}: {
  payload: ChatEventPayload;
  currentUsername?: string | null;
}) {
  const isCurrentUserTarget = payload.targets.some(
    (target) => target.username === currentUsername,
  );

  if (payload.type === "created") {
    return (
      <div className="flex w-full justify-center px-4">
        <div className="max-w-xl rounded-2xl bg-violet-50 px-4 py-2 text-center text-xs font-semibold text-violet-700">
          Групповой чат создан
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full justify-center px-4">
      <div className="max-w-xl rounded-2xl bg-violet-50 px-4 py-2 text-center text-xs font-semibold text-violet-700">
        <Link
          href={getProfileHref(payload.actor.username, currentUsername)}
          className="font-extrabold hover:underline"
        >
          {payload.actor.username}
        </Link>{" "}
        {payload.type === "remove" ? "удалил(а)" : "пригласил(а)"}{" "}
        {payload.type === "remove" && isCurrentUserTarget
          ? "вас"
          : payload.targets.map((target, index) => (
              <span key={target.id}>
                <Link
                  href={getProfileHref(target.username, currentUsername)}
                  className="font-extrabold hover:underline"
                >
                  {target.username}
                </Link>
                {index < payload.targets.length - 1 ? ", " : ""}
              </span>
            ))}{" "}
        {payload.type === "remove" ? "из группы" : "в чат"}
      </div>
    </div>
  );
}

function getSharedPostHref(
  payload: SharedPostPayload,
  currentUsername?: string | null,
) {
  return `${getProfileHref(payload.authorUsername, currentUsername)}#post-${payload.postId}`;
}

function SharedPostMessageCard({
  payload,
  senderName,
  onOpen,
}: {
  payload: SharedPostPayload;
  senderName: string;
  onOpen: () => void;
}) {
  const coverSrc = getAssetUrl(payload.coverUrl);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-80 max-w-full overflow-hidden rounded-2xl border border-violet-100 bg-white text-left shadow-sm transition hover:border-violet-300 hover:shadow-md"
    >
      <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 text-xs font-extrabold text-violet-700">
        {payload.authorAvatarUrl ? (
          <img
            src={getAssetUrl(payload.authorAvatarUrl)}
            alt={payload.authorUsername}
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100">
            {payload.authorUsername.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="truncate">{senderName} поделился постом</span>
      </div>

      {coverSrc && payload.coverType === "IMAGE" && (
        <img src={coverSrc} alt="Пост" className="h-36 w-full object-cover" />
      )}
      {coverSrc && payload.coverType === "VIDEO" && (
        <video
          src={coverSrc}
          muted
          preload="metadata"
          className="h-36 w-full bg-black object-cover"
        />
      )}

      <div className="px-3 py-3">
        <p className="text-xs font-bold text-slate-900">
          Пост @{payload.authorUsername}
        </p>
        <p className="mt-1 line-clamp-3 text-xs leading-5 text-zinc-500">
          {payload.content?.trim() || "Открыть пост"}
        </p>
      </div>
    </button>
  );
}

function MessageBubble({
  message,
  chat,
  isOwn,
  isLastMessage,
  currentUserId,
  highlighted,
  messageRef,
  onReply,
  onReact,
}: {
  message: ChatMessage;
  chat: Chat;
  isOwn: boolean;
  isLastMessage: boolean;
  currentUserId: string;
  highlighted: boolean;
  messageRef: RefCallback<HTMLDivElement>;
  onReply: () => void;
  onReact: (emoji: ReactionEmoji) => void;
}) {
  const router = useRouter();
  const actions = useChatActionMutations();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useDismissibleLayer<HTMLDivElement>(menuOpen, () =>
    setMenuOpen(false),
  );
  const canModerate =
    chat.currentUserRole === "OWNER" || chat.currentUserRole === "ADMIN";
  const readByOthers = message.reads.filter(
    (read) => read.userId !== message.senderId,
  );
  const myReaction = message.reactions.find(
    (reaction) => reaction.userId === currentUserId,
  )?.emoji;
  const canInteract = !chat.isReadOnly && !chat.isDraft;
  const { user: currentUser } = useAuth();
  const senderProfileUrl = message.sender
    ? getProfileHref(message.sender.username, currentUser?.username)
    : null;
  const chatEvent = parseChatEventContent(message.content);
  const sharedPost = parseSharedPostContent(message.content);
  const lastReadSummary =
    readByOthers.length > 0
      ? chat.type === "GROUP"
        ? `${readByOthers
            .slice(0, 2)
            .map((read) => read.user.username)
            .join(
              ", ",
            )}${readByOthers.length > 2 ? ` и ещё ${readByOthers.length - 2}` : ""}`
        : `Прочитано в ${formatTime(readByOthers[0]?.readAt)}`
      : null;
  const groupedReactions = useMemo(() => {
    return message.reactions.reduce<Record<string, number>>((acc, reaction) => {
      acc[reaction.emoji] = (acc[reaction.emoji] ?? 0) + 1;
      return acc;
    }, {});
  }, [message.reactions]);

  function goToSenderProfile() {
    if (senderProfileUrl) {
      router.push(senderProfileUrl);
    }
  }

  if (chatEvent) {
    return (
      <div
        ref={messageRef}
        className={`w-full scroll-mt-28 rounded-3xl transition-shadow duration-300 ${highlighted ? "ring-4 ring-violet-300 ring-offset-4 ring-offset-white shadow-xl" : ""}`}
      >
        <ChatEventMessage
          payload={chatEvent}
          currentUsername={currentUser?.username}
        />
      </div>
    );
  }

  return (
    <div
      ref={messageRef}
      className={`group flex w-full scroll-mt-28 items-end gap-3 rounded-3xl ${isOwn ? "justify-end" : "justify-start"}`}
    >
      {!isOwn && (
        <button
          type="button"
          onClick={goToSenderProfile}
          disabled={!senderProfileUrl}
          className="shrink-0 cursor-pointer rounded-full transition hover:ring-4 hover:ring-violet-100 disabled:cursor-default"
        >
          <Avatar
            title={message.sender?.username ?? "User"}
            src={message.sender?.avatarUrl}
            size="sm"
          />
        </button>
      )}

      <div
        className={`flex max-w-xl flex-col max-md:max-w-full ${isOwn ? "items-end" : "items-start"}`}
      >
        <div
          className={`max-w-full rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm transition-shadow duration-300 ${isOwn ? "bg-violet-100 text-slate-900" : "bg-zinc-50 text-slate-900"} ${highlighted ? "ring-4 ring-violet-300 ring-offset-4 ring-offset-white shadow-xl" : ""}`}
        >
          {chat.type === "GROUP" && message.sender && (
            <button
              type="button"
              onClick={goToSenderProfile}
              className="mb-2 block max-w-full cursor-pointer truncate text-xs font-extrabold text-violet-700 hover:underline"
            >
              {message.sender.username}
            </button>
          )}

          {message.parent && (
            <div className="mb-2 rounded-2xl border-l-4 border-violet-400 bg-white/70 px-3 py-2 text-xs text-slate-600">
              <b>{message.parent.sender?.username ?? "Пользователь"}</b>:{" "}
              {message.parent.content}
            </div>
          )}

          {sharedPost ? (
            <SharedPostMessageCard
              payload={sharedPost}
              senderName={message.sender?.username ?? "Пользователь"}
              onOpen={() =>
                router.push(
                  getSharedPostHref(sharedPost, currentUser?.username),
                )
              }
            />
          ) : (
            message.content && (
              <p className="whitespace-pre-wrap break-words">
                {message.content}
              </p>
            )
          )}

          {message.attachments.length > 0 && (
            <div className="mt-3 grid gap-2">
              {message.attachments.map((attachment) => (
                <AttachmentPreview
                  key={attachment.id}
                  attachment={attachment}
                />
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-zinc-500">
            <span className="min-w-0">
              {message.pinnedAt && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 font-bold text-violet-600">
                  <Pin className="h-3 w-3" />
                  Закреплено
                </span>
              )}
            </span>
            <span className="shrink-0">{formatTime(message.createdAt)}</span>
          </div>
        </div>

        {Object.entries(groupedReactions).length > 0 && (
          <div
            className={`mt-1 flex flex-wrap gap-1 ${isOwn ? "justify-end" : "justify-start"}`}
          >
            {Object.entries(groupedReactions).map(([emoji, count]) => (
              <span
                key={emoji}
                className="rounded-full border border-violet-100 bg-white px-2 py-0.5 text-xs shadow-sm"
              >
                {emoji} {count}
              </span>
            ))}
          </div>
        )}

        {isOwn && isLastMessage && lastReadSummary && (
          <p className="mt-1 flex max-w-full items-center gap-1 text-right text-[11px] font-medium text-zinc-400">
            <CheckCheck className="h-4 w-4 shrink-0 text-violet-600" />
            <span className="truncate">{lastReadSummary}</span>
          </p>
        )}

        {canInteract && (
          <div
            className={`mt-2 flex max-w-full flex-wrap gap-1 opacity-0 transition group-hover:opacity-100 ${menuOpen ? "opacity-100" : ""} ${isOwn ? "justify-end" : "justify-start"}`}
          >
          {reactionOptions.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onReact(emoji)}
              className={`rounded-full bg-white px-2 py-1 text-[11px] shadow-sm hover:bg-violet-50 ${myReaction === emoji ? "ring-2 ring-violet-300" : ""}`}
            >
              {emoji}
            </button>
          ))}

          <button
            onClick={onReply}
            className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold shadow-sm hover:bg-violet-50"
          >
            Ответить
          </button>

          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((value) => !value)}
              className="rounded-full bg-white px-2 py-1 text-xs shadow-sm hover:bg-violet-50"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>

            {menuOpen && (
              <div
                className={`absolute top-8 z-10 w-48 rounded-2xl border border-zinc-100 bg-white p-2 text-xs shadow-xl ${isOwn ? "right-0" : "left-0"}`}
              >
                {chat.type === "GROUP" && (
                  <div className="group/read relative">
                    <button
                      type="button"
                      className="w-full rounded-xl px-3 py-2 text-left hover:bg-violet-50"
                    >
                      Кем прочитано
                    </button>
                    <div
                      className={`absolute top-0 hidden w-60 rounded-2xl border border-zinc-100 bg-white p-3 shadow-xl group-hover/read:block ${isOwn ? "right-full mr-2" : "left-full ml-2"}`}
                    >
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                        Прочитали
                      </p>
                      {readByOthers.length === 0 ? (
                        <p className="text-xs text-zinc-500">
                          Пока никто не прочитал
                        </p>
                      ) : (
                        <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                          {readByOthers.map((read) => (
                            <div
                              key={read.id}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="min-w-0 truncate font-semibold text-slate-700">
                                {read.user.username}
                              </span>
                              <span className="shrink-0 text-zinc-400">
                                {formatTime(read.readAt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {canModerate && !message.pinnedAt && (
                  <button
                    onClick={() => {
                      actions.pinMessage.mutate({
                        chatId: chat.id,
                        messageId: message.id,
                      });
                      setMenuOpen(false);
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left hover:bg-violet-50"
                  >
                    Закрепить
                  </button>
                )}
                {canModerate && message.pinnedAt && (
                  <button
                    onClick={() => {
                      actions.unpinMessage.mutate({
                        chatId: chat.id,
                        messageId: message.id,
                      });
                      setMenuOpen(false);
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left hover:bg-violet-50"
                  >
                    Открепить
                  </button>
                )}
                {(isOwn || canModerate) && (
                  <button
                    onClick={() => {
                      actions.deleteMessage.mutate({
                        chatId: chat.id,
                        messageId: message.id,
                      });
                      setMenuOpen(false);
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left text-red-600 hover:bg-red-50"
                  >
                    Удалить сообщение
                  </button>
                )}
              </div>
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type UserPickerGroup = {
  title: string;
  hint: string;
  users: SocialUserCard[];
};

function useUserPickerGroups(search: string, excludedUserIds: string[] = []) {
  const friendsQuery = useFriendsQuery({
    tab: "all",
    search,
    sort: "name",
    page: 1,
    limit: 30,
  });
  const followersQuery = useSubscriptionsQuery({
    tab: "followers",
    search,
    sort: "new",
    page: 1,
    limit: 30,
  });
  const followingQuery = useSubscriptionsQuery({
    tab: "following",
    search,
    sort: "new",
    page: 1,
    limit: 30,
  });
  const excludedKey = excludedUserIds.join("|");

  const groups = useMemo<UserPickerGroup[]>(() => {
    const excluded = new Set(excludedKey ? excludedKey.split("|") : []);
    const used = new Set(excluded);
    const friends = (friendsQuery.data?.items ?? []) as SocialUserCard[];
    const followers = (
      (followersQuery.data?.items ?? []) as SubscriptionItem[]
    ).map((item) => item.user);
    const following = (
      (followingQuery.data?.items ?? []) as SubscriptionItem[]
    ).map((item) => item.user);

    function takeUnique(users: SocialUserCard[]) {
      const result: SocialUserCard[] = [];

      for (const user of users) {
        if (used.has(user.id)) {
          continue;
        }

        used.add(user.id);
        result.push(user);
      }

      return result;
    }

    return [
      {
        title: "Друзья",
        hint: "Люди из твоего списка друзей",
        users: takeUnique(friends),
      },
      {
        title: "Подписчики",
        hint: "Люди, которые подписаны на тебя",
        users: takeUnique(followers),
      },
      {
        title: "Подписки",
        hint: "Люди, на которых подписан(а) ты",
        users: takeUnique(following),
      },
    ];
  }, [
    excludedKey,
    followersQuery.data?.items,
    followingQuery.data?.items,
    friendsQuery.data?.items,
  ]);

  return {
    groups,
    isLoading:
      friendsQuery.isLoading ||
      followersQuery.isLoading ||
      followingQuery.isLoading,
  };
}

function UserPickerList({
  groups,
  isLoading,
  selectedIds,
  onToggle,
}: {
  groups: UserPickerGroup[];
  isLoading: boolean;
  selectedIds: string[];
  onToggle: (userId: string) => void;
}) {
  const hasUsers = groups.some((group) => group.users.length > 0);

  if (isLoading) {
    return (
      <p className="py-6 text-center text-sm text-zinc-500">
        Загружаем пользователей...
      </p>
    );
  }

  if (!hasUsers) {
    return (
      <p className="py-6 text-center text-sm text-zinc-500">
        Подходящие пользователи не найдены
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(
        (group) =>
          group.users.length > 0 && (
            <section key={group.title} className="space-y-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {group.title}
                </h3>
                <p className="text-xs text-zinc-500">{group.hint}</p>
              </div>

              <div className="space-y-2">
                {group.users.map((candidate) => {
                  const selected = selectedIds.includes(candidate.id);

                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => onToggle(candidate.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${selected ? "border-violet-300 bg-violet-50" : "border-zinc-100 hover:bg-zinc-50"}`}
                    >
                      <Avatar
                        title={candidate.username}
                        src={candidate.avatarUrl}
                        isOnline={candidate.isOnline}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900">
                          {candidate.username}
                        </span>
                        <span className="block truncate text-xs text-zinc-500">
                          {candidate.email}
                        </span>
                      </span>
                      <span
                        className={`h-5 w-5 rounded-full border ${selected ? "border-violet-600 bg-violet-600" : "border-zinc-300"}`}
                      />
                    </button>
                  );
                })}
              </div>
            </section>
          ),
      )}
    </div>
  );
}

function CreateGroupChatModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (chat: Chat) => void;
}) {
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createGroup = useCreateGroupChatMutation();
  const uploadFile = useUploadFileMutation();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useDismissibleLayer<HTMLDivElement>(true, onClose);
  const userPicker = useUserPickerGroups(search);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  function toggleUser(userId: string) {
    setSelectedIds((value) =>
      value.includes(userId)
        ? value.filter((id) => id !== userId)
        : [...value, userId],
    );
  }

  function handleAvatarSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (avatarPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }

    setAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
  }

  function removeAvatar() {
    if (avatarPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }

    setAvatarFile(null);
    setAvatarPreviewUrl(null);
    setAvatarPreviewOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    setSubmitError(null);

    if (!trimmedTitle) {
      setSubmitError("Укажи название группового чата");
      return;
    }

    if (selectedIds.length === 0) {
      setSubmitError("Выбери хотя бы одного участника");
      return;
    }

    try {
      const uploadedAvatar = avatarFile
        ? await uploadFile.mutateAsync({ file: avatarFile, type: "IMAGE" })
        : null;
      const chat = await createGroup.mutateAsync({
        title: trimmedTitle,
        memberIds: selectedIds,
        avatarUrl: uploadedAvatar?.url ?? null,
      });
      onCreated(chat);
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Не удалось создать групповой чат",
      );
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-6">
        <div
          ref={modalRef}
          className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
        >
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950">
                Создать групповой чат
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Укажи название, опциональный аватар и выбери участников из
                друзей, подписчиков или подписок.
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-slate-500 hover:bg-zinc-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-4 rounded-2xl border border-dashed border-violet-100 bg-violet-50/30 p-3">
              {avatarPreviewUrl ? (
                <button
                  type="button"
                  onClick={() => setAvatarPreviewOpen(true)}
                  className="shrink-0 rounded-full cursor-zoom-in transition hover:ring-4 hover:ring-violet-100"
                  aria-label="Посмотреть аватар полностью"
                >
                  <Avatar
                    title={title || "Группа"}
                    src={avatarPreviewUrl}
                    size="lg"
                  />
                </button>
              ) : (
                <Avatar
                  title={title || "Группа"}
                  src={avatarPreviewUrl}
                  size="lg"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800">
                  Аватар группы
                </p>
                <p className="text-xs text-zinc-500">
                  Необязательно, можно оставить без аватара.
                </p>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarSelected}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="rounded-xl border border-violet-200 px-3 py-2 text-xs font-bold text-violet-600 hover:bg-white"
                  >
                    {avatarPreviewUrl ? "Заменить аватар" : "Загрузить аватар"}
                  </button>
                  {avatarPreviewUrl && (
                    <button
                      type="button"
                      onClick={removeAvatar}
                      className="rounded-xl border border-red-100 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                    >
                      Удалить фото
                    </button>
                  )}
                </div>
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-800">
                Название
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Например: Wine Lovers Club"
                className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-violet-300"
              />
            </label>

            <label className="flex items-center gap-2 rounded-2xl border border-zinc-200 px-3 py-2 text-sm text-zinc-400">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск друзей, подписчиков и подписок"
                className="min-w-0 flex-1 bg-transparent text-zinc-900 outline-none placeholder:text-zinc-400"
              />
            </label>

            <div className="max-h-72 overflow-y-auto pr-1">
              <UserPickerList
                groups={userPicker.groups}
                isLoading={userPicker.isLoading}
                selectedIds={selectedIds}
                onToggle={toggleUser}
              />
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-violet-50 px-4 py-3 text-sm">
              <span className="font-semibold text-slate-700">
                Выбрано участников
              </span>
              <span className="font-bold text-violet-600">
                {selectedIds.length}
              </span>
            </div>

            {submitError && (
              <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                {submitError}
              </p>
            )}

            <button
              type="submit"
              disabled={
                !title.trim() ||
                selectedIds.length === 0 ||
                createGroup.isPending ||
                uploadFile.isPending
              }
              className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-100 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createGroup.isPending || uploadFile.isPending
                ? "Создаем..."
                : `Создать чат${selectedIds.length ? ` · ${selectedIds.length}` : ""}`}
            </button>
          </form>
        </div>
      </div>
      {avatarPreviewOpen && avatarPreviewUrl && (
        <ImagePreviewModal
          src={avatarPreviewUrl}
          title={title || "Аватар группы"}
          onClose={() => setAvatarPreviewOpen(false)}
        />
      )}
    </>
  );
}

function InviteMembersModal({
  chat,
  excludedUserIds,
  onClose,
}: {
  chat: Chat;
  excludedUserIds: string[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const actions = useChatActionMutations();
  const modalRef = useDismissibleLayer<HTMLDivElement>(true, onClose);
  const userPicker = useUserPickerGroups(search, excludedUserIds);

  function toggleUser(userId: string) {
    setSelectedIds((value) =>
      value.includes(userId)
        ? value.filter((id) => id !== userId)
        : [...value, userId],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (selectedIds.length === 0) {
      setSubmitError("Выбери хотя бы одного участника");
      return;
    }

    try {
      await actions.inviteMembers.mutateAsync({
        chatId: chat.id,
        memberIds: selectedIds,
      });
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Не удалось пригласить участников",
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 py-6">
      <div
        ref={modalRef}
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Пригласить участника
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Можно пригласить друзей, подписчиков или пользователей из твоих
              подписок.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex items-center gap-2 rounded-2xl border border-zinc-200 px-3 py-2 text-sm text-zinc-400">
            <Search className="h-4 w-4" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск друзей, подписчиков и подписок"
              className="min-w-0 flex-1 bg-transparent text-zinc-900 outline-none placeholder:text-zinc-400"
            />
          </label>

          <div className="max-h-80 overflow-y-auto pr-1">
            <UserPickerList
              groups={userPicker.groups}
              isLoading={userPicker.isLoading}
              selectedIds={selectedIds}
              onToggle={toggleUser}
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-violet-50 px-4 py-3 text-sm">
            <span className="font-semibold text-slate-700">
              Выбрано участников
            </span>
            <span className="font-bold text-violet-600">
              {selectedIds.length}
            </span>
          </div>

          {submitError && (
            <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={
              selectedIds.length === 0 || actions.inviteMembers.isPending
            }
            className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-100 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actions.inviteMembers.isPending
              ? "Приглашаем..."
              : `Пригласить${selectedIds.length ? ` · ${selectedIds.length}` : ""}`}
          </button>
        </form>
      </div>
    </div>
  );
}

function ChatMembersView({ chat }: { chat: Chat }) {
  const router = useRouter();
  const membersQuery = useChatMembersQuery(chat.id);
  const actions = useChatActionMutations();
  const members = membersQuery.data?.items ?? [];
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const canManage = chat.currentUserRole === "OWNER";
  const canInvite =
    chat.currentUserRole === "OWNER" || chat.currentUserRole === "ADMIN";
  const memberUserIds = members.map((member) => member.userId);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h3 className="text-xl font-bold text-slate-950">Участники чата</h3>
          {canInvite && (
            <button
              onClick={() => setInviteModalOpen(true)}
              className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-100 hover:bg-violet-700"
            >
              Пригласить участника
            </button>
          )}
        </div>

        <div className="space-y-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-4 rounded-2xl border border-zinc-100 px-4 py-3"
            >
              <Avatar
                title={member.user.username}
                src={member.user.avatarUrl}
                isOnline={member.user.isOnline}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-slate-900">
                    {member.user.username}
                  </p>
                  {member.role !== "MEMBER" && (
                    <span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-600">
                      {member.role === "OWNER" ? "Создатель" : "Администратор"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500">
                  {member.user.isOnline
                    ? "Онлайн"
                    : formatLastSeen(member.user.lastLoginAt)}
                </p>
              </div>
              <button
                onClick={() =>
                  router.push(getProfileHref(member.user.username))
                }
                className="rounded-xl border border-violet-200 px-4 py-2 text-sm font-bold text-violet-600 hover:bg-violet-50"
              >
                Профиль
              </button>
              {canManage && member.role !== "OWNER" && (
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      actions.updateMemberRole.mutate({
                        chatId: chat.id,
                        userId: member.userId,
                        role: member.role === "ADMIN" ? "MEMBER" : "ADMIN",
                      })
                    }
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-zinc-50"
                  >
                    {member.role === "ADMIN"
                      ? "Снять админа"
                      : "Назначить админом"}
                  </button>
                  <button
                    onClick={() =>
                      actions.removeMember.mutate({
                        chatId: chat.id,
                        userId: member.userId,
                      })
                    }
                    className="rounded-xl border border-red-100 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                  >
                    Удалить
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {inviteModalOpen && (
        <InviteMembersModal
          chat={chat}
          excludedUserIds={memberUserIds}
          onClose={() => setInviteModalOpen(false)}
        />
      )}
    </>
  );
}

function ChatAttachmentsView({
  chat,
  attachmentType,
  setAttachmentType,
}: {
  chat: Chat;
  attachmentType: AttachmentTab;
  setAttachmentType: (value: AttachmentTab) => void;
}) {
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<null | {
    src: string;
    title: string;
    type: "IMAGE" | "VIDEO";
  }>(null);
  const attachmentsQuery = useChatAttachmentsQuery(chat.id, attachmentType);
  const attachments = attachmentsQuery.data?.items ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredAttachments = attachments.filter((attachment) => {
    if (!normalizedSearch) return true;

    return (attachment.file.filename ?? attachment.file.url)
      .toLowerCase()
      .includes(normalizedSearch);
  });
  const groupedAttachments = filteredAttachments.reduce<
    Array<{ month: string; items: typeof filteredAttachments }>
  >((groups, attachment) => {
    const month = formatAttachmentMonth(attachment.createdAt);
    const existingGroup = groups.find((group) => group.month === month);

    if (existingGroup) {
      existingGroup.items.push(attachment);
    } else {
      groups.push({ month, items: [attachment] });
    }

    return groups;
  }, []);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <h3 className="mb-4 text-xl font-bold text-slate-950">Вложения чата</h3>
      <label className="mb-5 flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-400">
        <Search className="h-4 w-4" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по вложениям"
          className="flex-1 bg-transparent text-slate-900 outline-none placeholder:text-zinc-400"
        />
      </label>

      <div className="mb-5 flex flex-wrap gap-3 border-b border-zinc-100">
        {attachmentTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setAttachmentType(tab.value)}
            className={`border-b-2 px-2 pb-3 text-sm font-bold ${attachmentType === tab.value ? "border-violet-600 text-violet-600" : "border-transparent text-slate-500 hover:text-violet-600"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {attachmentsQuery.isLoading && (
        <p className="rounded-2xl bg-zinc-50 p-6 text-center text-sm text-zinc-500">
          Загружаем вложения...
        </p>
      )}

      {!attachmentsQuery.isLoading && groupedAttachments.length === 0 && (
        <p className="rounded-2xl bg-zinc-50 p-6 text-center text-sm text-zinc-500">
          В этом разделе пока нет вложений.
        </p>
      )}

      <div className="space-y-7">
        {groupedAttachments.map((group) => (
          <section key={group.month}>
            <h4 className="mb-3 text-sm font-extrabold capitalize text-slate-700">
              {group.month}
            </h4>
            <div className="grid grid-cols-4 gap-4 max-xl:grid-cols-3 max-md:grid-cols-2">
              {group.items.map((attachment) => (
                <AttachmentGalleryTile
                  key={attachment.id}
                  attachment={attachment}
                  onPreview={(nextPreview) => setPreview(nextPreview)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {preview && (
        <MediaPreviewModal
          src={preview.src}
          title={preview.title}
          type={preview.type}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function AttachmentGalleryTile({
  attachment,
  onPreview,
}: {
  attachment: AttachmentsResponse["items"][number];
  onPreview: (preview: { src: string; title: string; type: "IMAGE" | "VIDEO" }) => void;
}) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const file = attachment.file;
  const url = getAssetUrl(file.url) ?? file.url;
  const thumbnailUrl = getAssetUrl(file.thumbnailUrl ?? file.url) ?? url;
  const title = file.filename ?? file.url;

  async function handleDownload() {
    try {
      setDownloadError(null);
      await downloadAsset(url, title);
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Не удалось скачать файл",
      );
    }
  }

  if (file.type === "IMAGE") {
    return (
      <button
        type="button"
        onClick={() => onPreview({ src: url, title, type: "IMAGE" })}
        className="overflow-hidden rounded-2xl border border-zinc-100 bg-white p-3 text-left shadow-sm transition hover:border-violet-200 hover:shadow-md"
      >
        <img
          src={thumbnailUrl}
          alt={title}
          className="mb-3 h-28 w-full rounded-xl object-cover"
        />
        <p className="truncate text-sm font-bold text-slate-800">{title}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {formatTime(attachment.createdAt)}
        </p>
      </button>
    );
  }

  if (file.type === "VIDEO") {
    return (
      <button
        type="button"
        onClick={() => onPreview({ src: url, title, type: "VIDEO" })}
        className="overflow-hidden rounded-2xl border border-zinc-100 bg-white p-3 text-left shadow-sm transition hover:border-violet-200 hover:shadow-md"
      >
        <div className="relative mb-3 h-28 overflow-hidden rounded-xl bg-black">
          <video
            src={url}
            poster={file.thumbnailUrl ? thumbnailUrl : undefined}
            preload="metadata"
            muted
            className="h-full w-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
            <Video className="h-8 w-8" />
          </span>
        </div>
        <p className="truncate text-sm font-bold text-slate-800">{title}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {formatTime(attachment.createdAt)}
        </p>
      </button>
    );
  }

  if (file.type === "AUDIO") {
    return (
      <div className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm">
        <div className="mb-3 flex h-20 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
          <Volume2 className="h-8 w-8" />
        </div>
        <p className="truncate text-sm font-bold text-slate-800">{title}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {formatTime(attachment.createdAt)} · {formatFileSize(file.sizeBytes)}
        </p>
        <audio src={url} controls className="mt-3 w-full" />
      </div>
    );
  }

  const Icon = file.type === "ARCHIVE" ? Archive : FileIcon;

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm">
      <button
        type="button"
        onClick={handleDownload}
        className="block w-full text-left"
      >
        <div className="mb-3 flex h-28 items-center justify-center rounded-xl bg-violet-50 text-violet-600 transition hover:bg-violet-100">
          <Icon className="h-8 w-8" />
        </div>
        <p className="truncate text-sm font-bold text-slate-800">{title}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {formatTime(attachment.createdAt)} · {formatFileSize(file.sizeBytes)}
        </p>
      </button>
      {downloadError && (
        <p className="mt-2 text-xs font-semibold text-red-500">
          {downloadError}
        </p>
      )}
    </div>
  );
}
