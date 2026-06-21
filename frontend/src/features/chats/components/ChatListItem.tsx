// Один элемент списка чатов: аватар, online, last message, unread badge и preview typing.
import { getAssetUrl } from "@/shared/utils/assets";
import type { Chat } from "../types/chat.types";

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

function Avatar({
  title,
  src,
  isOnline = false,
}: {
  title: string;
  src?: string | null;
  isOnline?: boolean;
}) {
  const resolvedSrc = getAssetUrl(src);

  return (
    <span className="relative h-11 w-11 shrink-0 overflow-visible rounded-full">
      <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-sm font-bold text-violet-600">
        {resolvedSrc ? (
          <img
            src={resolvedSrc}
            alt={title}
            className="h-full w-full object-cover"
          />
        ) : (
          initials(title)
        )}
      </span>
      {isOnline && (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
      )}
    </span>
  );
}

export default function ChatListItem({
  chat,
  active,
  onClick,
}: {
  chat: Chat;
  active: boolean;
  onClick: () => void;
}) {
  const lastText =
    chat.lastMessage?.content ||
    chat.lastMessage?.attachments[0]?.file.filename ||
    "Пока нет сообщений";

  return (
    <button
      onClick={onClick}
      className={`flex min-h-16 w-full items-center gap-3 rounded-2xl p-3 text-left transition ${
        active ? "bg-violet-50" : "hover:bg-zinc-50"
      }`}
    >
      <Avatar
        title={chat.title}
        src={chat.avatarUrl}
        isOnline={chat.type === "DIRECT" && Boolean(chat.directUser?.isOnline)}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-bold text-slate-900">
            {chat.title}
          </span>
          <span className="shrink-0 text-[11px] text-zinc-400">
            {formatTime(chat.lastMessageAt)}
          </span>
        </span>
        <span className="mt-1 block truncate text-xs text-zinc-500">
          {lastText}
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
