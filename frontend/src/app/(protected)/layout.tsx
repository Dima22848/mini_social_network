"use client";

import { ReactNode } from "react";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { useAuth } from "@/features/auth/providers/AuthProvider";
import { ProfileHeader } from "@/features/profile/components/ProfileHeader";
import { ProfileSidebar } from "@/features/profile/components/ProfileSidebar";
import { useChatSocket } from "@/features/chats/hooks/useChatSocket";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <ProtectedAppShell>{children}</ProtectedAppShell>
    </ProtectedRoute>
  );
}

function ProtectedAppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#fbf9ff] text-zinc-950">
      <RealtimePresenceBridge />
      <ProfileHeader user={user} />

      <div className="mx-auto grid w-full max-w-screen-2xl grid-cols-[240px_minmax(0,1fr)] gap-7 px-6 pb-10 pt-28 max-lg:grid-cols-1 max-lg:px-4">
        <div className="max-lg:hidden">
          <ProfileSidebar user={user} />
        </div>

        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
function RealtimePresenceBridge() {
  useChatSocket(null);

  return null;
}
