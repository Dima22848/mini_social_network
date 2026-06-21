"use client";

// Верхняя панель приложения: логотип, уведомления, меню профиля и закрытие dropdown по клику вне области.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, Home, LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLogoutMutation } from "@/features/auth/api/auth.queries";
import { useAuth } from "@/features/auth/providers/AuthProvider";
import type { AuthUser } from "@/features/auth/types/auth.types";
import { getAssetUrl } from "@/shared/utils/assets";
import { NotificationsDropdown } from "@/features/notifications/components/NotificationsDropdown";
import { useNotificationsQuery } from "@/features/notifications/api/notifications.queries";

type ProfileHeaderProps = {
  user: AuthUser;
};

export function ProfileHeader({ user }: ProfileHeaderProps) {
  const router = useRouter();
  const { clearAuth } = useAuth();
  const logoutMutation = useLogoutMutation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsQuery = useNotificationsQuery();
  const [toast, setToast] = useState<{
    title: string;
    body?: string | null;
  } | null>(null);
  const previousTopNotificationIdRef = useRef<string | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen && !isNotificationsOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;

      if (target && notificationsRef.current?.contains(target)) {
        return;
      }

      if (target && menuRef.current?.contains(target)) {
        return;
      }

      setIsNotificationsOpen(false);
      setIsMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsNotificationsOpen(false);
        setIsMenuOpen(false);
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
  }, [isMenuOpen, isNotificationsOpen]);

  useEffect(() => {
    const first = notificationsQuery.data?.items?.[0];

    if (!first) return;

    if (
      previousTopNotificationIdRef.current &&
      previousTopNotificationIdRef.current !== first.id &&
      !first.readAt
    ) {
      setToast({ title: first.title, body: first.body });
      const timeout = window.setTimeout(() => setToast(null), 4200);
      previousTopNotificationIdRef.current = first.id;
      return () => window.clearTimeout(timeout);
    }

    previousTopNotificationIdRef.current = first.id;
  }, [notificationsQuery.data?.items]);

  async function handleLogout() {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      clearAuth();
      router.replace("/login");
    }
  }

  const avatarUrl = getAssetUrl(user.profile?.avatarUrl);

  return (
    <header className="fixed left-4 right-4 top-3 z-30 rounded-3xl border border-violet-100/70 bg-white/90 px-8 py-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <Link
          href="/profile"
          className="font-serif text-4xl font-semibold tracking-tight text-zinc-950"
        >
          Social
        </Link>

        <div className="flex items-center gap-4">
          <div ref={notificationsRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsNotificationsOpen((value) => !value);
                setIsMenuOpen(false);
              }}
              className="relative flex h-11 w-11 items-center justify-center rounded-full border border-zinc-100 bg-white text-zinc-600 transition hover:border-violet-200 hover:text-violet-600"
              aria-label="Уведомления"
            >
              <Bell size={20} />
              {(notificationsQuery.data?.unreadCount ?? 0) > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white">
                  {Math.min(9, notificationsQuery.data?.unreadCount ?? 0)}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <NotificationsDropdown
                onClose={() => setIsNotificationsOpen(false)}
              />
            )}
          </div>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen((value) => !value);
                setIsNotificationsOpen(false);
              }}
              className="flex items-center gap-3 rounded-full border border-zinc-100 bg-white py-1.5 pl-1.5 pr-3 transition hover:border-violet-200"
            >
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
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
              </span>

              <ChevronDown size={16} className="text-zinc-500" />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 mt-3 w-56 overflow-hidden rounded-2xl border border-zinc-100 bg-white p-2 shadow-[0_18px_60px_rgba(88,64,120,0.16)]">
                <Link
                  onClick={() => setIsMenuOpen(false)}
                  href="/profile"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-violet-50 hover:text-violet-700"
                >
                  <Home size={17} />
                  Главная страница
                </Link>

                <Link
                  onClick={() => setIsMenuOpen(false)}
                  href="/settings"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-violet-50 hover:text-violet-700"
                >
                  <Settings size={17} />
                  Настройки
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  <LogOut size={17} />
                  Выйти с аккаунта
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {toast && (
        <div className="absolute right-44 top-5 z-40 max-w-sm rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm shadow-[0_18px_60px_rgba(88,64,120,0.18)]">
          <p className="font-bold text-slate-950">{toast.title}</p>
          {toast.body && (
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
              {toast.body}
            </p>
          )}
        </div>
      )}
    </header>
  );
}
