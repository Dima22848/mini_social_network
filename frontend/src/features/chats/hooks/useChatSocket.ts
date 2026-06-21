"use client";

// Один hook для realtime-слоя: подключает socket, обновляет кэши TanStack Query и пробрасывает typing/read/presence события.
import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/providers/AuthProvider";
import { chatQueryKeys } from "../api/chats.queries";
import { socialQueryKeys } from "@/features/social/api/social.queries";
import type {
  Chat,
  ChatMessage,
  CreateMessagePayload,
  TypingUser,
} from "../types/chat.types";

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, "");

type ServerToClientEvents = {
  "message:new": (message: ChatMessage) => void;
  "message:updated": (message: ChatMessage) => void;
  "message:read": (payload: {
    chatId: string;
    messageId?: string;
    userId: string;
    readAt: string;
  }) => void;
  "chat:updated": (payload: {
    chatId: string;
    lastMessage?: ChatMessage;
    chat?: Chat | null;
  }) => void;
  "chat:created": (chat: Chat) => void;
  "chat:deleted": (payload: { chatId: string }) => void;
  "chat:removed": (payload: { chatId: string; reason?: string }) => void;
  "notification:new": (notification: unknown) => void;
  typing: (payload: {
    chatId: string;
    user: TypingUser;
    isTyping: boolean;
  }) => void;
  "presence:changed": (payload: {
    userId: string;
    isOnline: boolean;
    lastSeenAt: string;
  }) => void;
};

type ClientToServerEvents = {
  "chat:join": (payload: { chatId: string }) => void;
  typing: (payload: { chatId: string; isTyping: boolean }) => void;
  "message:read": (payload: { chatId: string; messageId?: string }) => void;
  "message:react": (payload: {
    messageId: string;
    emoji: "👍" | "👎" | "🔥" | "❤️" | "😡";
  }) => void;
  "message:send": (
    payload: Omit<CreateMessagePayload, "chatId"> & { chatId: string },
    callback?: (message: ChatMessage) => void,
  ) => void;
};

export function useChatSocket(activeChatId: string | null) {
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const activeChatIdRef = useRef<string | null>(activeChatId);
  const typingTimeoutsRef = useRef<Map<string, number>>(new Map());

  function removeChatFromCaches(chatId: string) {
    queryClient.setQueriesData(
      { queryKey: chatQueryKeys.lists() },
      (oldData: unknown) => {
        if (!oldData || typeof oldData !== "object" || !("items" in oldData))
          return oldData;
        const data = oldData as { items: Chat[] };
        return {
          ...data,
          items: data.items.filter((chat) => chat.id !== chatId),
        };
      },
    );
    queryClient.removeQueries({ queryKey: chatQueryKeys.detail(chatId) });
    queryClient.removeQueries({ queryKey: chatQueryKeys.messages(chatId) });
  }

  function upsertChatInCaches(chat: Chat) {
    queryClient.setQueriesData(
      { queryKey: chatQueryKeys.lists() },
      (oldData: unknown) => {
        if (!oldData || typeof oldData !== "object" || !("items" in oldData))
          return oldData;
        const data = oldData as { items: Chat[] };
        return {
          ...data,
          items: [chat, ...data.items.filter((item) => item.id !== chat.id)],
        };
      },
    );
    queryClient.setQueryData(chatQueryKeys.detail(chat.id), chat);
  }

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
    setTypingUsers([]);
  }, [activeChatId]);

  useEffect(() => {
    if (!accessToken || !API_URL) {
      return;
    }

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      `${API_URL}/chats`,
      {
        auth: { accessToken },
        transports: ["websocket"],
        withCredentials: true,
      },
    );

    socketRef.current = socket;

    socket.on("message:new", (message) => {
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.messages(message.chatId),
      });
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.attachmentsRoot(message.chatId),
      });
    });

    socket.on("chat:updated", (payload) => {
      if (payload.chat) {
        upsertChatInCaches(payload.chat);
      }
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.lists() });
      if (payload.chatId) {
        queryClient.invalidateQueries({
          queryKey: chatQueryKeys.detail(payload.chatId),
        });
        queryClient.invalidateQueries({
          queryKey: chatQueryKeys.members(payload.chatId),
        });
        queryClient.invalidateQueries({
          queryKey: chatQueryKeys.messages(payload.chatId),
        });
      }
    });

    socket.on("chat:created", (chat) => {
      upsertChatInCaches(chat);
      window.dispatchEvent(
        new CustomEvent("chat-cache-upsert", { detail: { chat } }),
      );
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.lists() });
    });

    socket.on("chat:deleted", (payload) => {
      removeChatFromCaches(payload.chatId);
      window.dispatchEvent(
        new CustomEvent("chat-cache-remove", {
          detail: { chatId: payload.chatId },
        }),
      );
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.lists() });
    });

    socket.on("chat:removed", (payload) => {
      removeChatFromCaches(payload.chatId);
      window.dispatchEvent(
        new CustomEvent("chat-cache-remove", {
          detail: { chatId: payload.chatId },
        }),
      );
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.lists() });
    });

    socket.on("notification:new", () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });

    socket.on("message:updated", (message) => {
      queryClient.setQueryData<{ items: ChatMessage[] }>(
        chatQueryKeys.messages(message.chatId),
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            items: oldData.items.map((item) =>
              item.id === message.id ? message : item,
            ),
          };
        },
      );
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.pinned(message.chatId),
      });
    });

    socket.on("message:read", (payload) => {
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.messages(payload.chatId),
      });
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.lists() });
    });

    socket.on("typing", (payload) => {
      if (payload.user.id === user?.id) {
        return;
      }

      window.dispatchEvent(
        new CustomEvent("chat-typing-preview", { detail: payload }),
      );

      if (payload.chatId !== activeChatIdRef.current) {
        return;
      }

      if (!payload.isTyping) {
        setTypingUsers((users) =>
          users.filter((user) => user.id !== payload.user.id),
        );
        return;
      }

      setTypingUsers((users) => {
        if (users.some((user) => user.id === payload.user.id)) {
          return users;
        }

        return [...users, payload.user];
      });

      const oldTimeout = typingTimeoutsRef.current.get(payload.user.id);
      if (oldTimeout) {
        window.clearTimeout(oldTimeout);
      }

      const timeoutId = window.setTimeout(() => {
        setTypingUsers((users) =>
          users.filter((user) => user.id !== payload.user.id),
        );
        typingTimeoutsRef.current.delete(payload.user.id);
      }, 2200);

      typingTimeoutsRef.current.set(payload.user.id, timeoutId);
    });

    socket.on("presence:changed", (payload) => {
      queryClient.setQueriesData(
        { queryKey: chatQueryKeys.all },
        (oldData: unknown) => {
          if (!oldData || typeof oldData !== "object") return oldData;
          const patchUser = (user: any) =>
            user?.id === payload.userId
              ? {
                  ...user,
                  isOnline: payload.isOnline,
                  lastLoginAt: payload.isOnline
                    ? user.lastLoginAt
                    : payload.lastSeenAt,
                }
              : user;
          const patchMessage = (message: ChatMessage): ChatMessage => ({
            ...message,
            sender: patchUser(message.sender),
            parent: message.parent
              ? { ...message.parent, sender: patchUser(message.parent.sender) }
              : message.parent,
            reactions: message.reactions.map((reaction) => ({
              ...reaction,
              user: patchUser(reaction.user),
            })),
            reads: message.reads.map((read) => ({
              ...read,
              user: patchUser(read.user),
            })),
          });
          const patchChat = (chat: Chat): Chat => ({
            ...chat,
            directUser: patchUser(chat.directUser),
            members: chat.members.map((member) => ({
              ...member,
              user: patchUser(member.user),
            })),
            lastMessage: chat.lastMessage
              ? patchMessage(chat.lastMessage)
              : chat.lastMessage,
            matchedMessage: chat.matchedMessage
              ? patchMessage(chat.matchedMessage)
              : chat.matchedMessage,
          });
          if ("items" in oldData && Array.isArray((oldData as any).items)) {
            return {
              ...(oldData as any),
              items: (oldData as any).items.map((item: any) =>
                item?.type && item?.members ? patchChat(item) : item,
              ),
            };
          }
          if ("id" in oldData && "members" in oldData) {
            return patchChat(oldData as Chat);
          }
          return oldData;
        },
      );
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: socialQueryKeys.all });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      typingTimeoutsRef.current.forEach((timeoutId) =>
        window.clearTimeout(timeoutId),
      );
      typingTimeoutsRef.current.clear();
    };
  }, [accessToken, queryClient, user?.id]);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }

    socketRef.current?.emit("chat:join", { chatId: activeChatId });
  }, [activeChatId]);

  return useMemo(
    () => ({
      typingUsers,
      sendTyping(isTyping: boolean) {
        if (!activeChatId) {
          return;
        }

        socketRef.current?.emit("typing", { chatId: activeChatId, isTyping });
      },
      markRead(messageId?: string) {
        if (!activeChatId) {
          return;
        }

        socketRef.current?.emit("message:read", {
          chatId: activeChatId,
          messageId,
        });
      },
      react(messageId: string, emoji: "👍" | "👎" | "🔥" | "❤️" | "😡") {
        socketRef.current?.emit("message:react", { messageId, emoji });
      },
      sendMessage(payload: Omit<CreateMessagePayload, "chatId">) {
        return new Promise<ChatMessage>((resolve, reject) => {
          if (!activeChatId || !socketRef.current) {
            reject(new Error("Socket is not connected"));
            return;
          }

          socketRef.current.emit(
            "message:send",
            { ...payload, chatId: activeChatId },
            (message) => {
              resolve(message);
            },
          );
        });
      },
    }),
    [activeChatId, typingUsers],
  );
}
