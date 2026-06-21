"use client";

// Карточка поста в ленте: медиа-сетка, реакции, комментарии, ответы и отправка поста в чат.
import {
  type ChangeEvent,
  type UIEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  Edit3,
  FileText,
  Heart,
  ImageIcon,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Music,
  Send,
  Video,
  Share2,
  ThumbsDown,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  useCreatePostCommentMutation,
  useDeletePostMutation,
  useDeletePostCommentMutation,
  usePostCommentsQuery,
  useSearchUsersQuery,
  useToggleCommentReactionMutation,
  useTogglePostReactionMutation,
  useUpdatePostMutation,
  useUploadPostFileMutation,
} from "@/features/social/api/social.queries";
import { useAuth } from "@/features/auth/providers/AuthProvider";
import {
  useChatsQuery,
  useCreateDirectChatMutation,
  useCreateMessageMutation,
} from "@/features/chats/api/chats.queries";
import type { Chat } from "@/features/chats/types/chat.types";
import type {
  CreatePostAttachmentPayload,
  FeedPost,
  FeedPostAttachment,
  PostComment,
  PostFileType,
  ReactionType,
} from "@/features/social/types/social.types";
import {
  downloadAsset,
  formatFileSize,
  getAssetUrl,
  getProfileHref,
} from "@/shared/utils/assets";

type PostCardProps = {
  post: FeedPost;
  context?: "profile" | "feed";
};

function getPostUploadType(file: File): PostFileType {
  if (file.type.startsWith("image/")) return "IMAGE";
  if (file.type.startsWith("video/")) return "VIDEO";
  if (file.type.startsWith("audio/")) return "AUDIO";

  const lowerName = file.name.toLowerCase();

  if (/\.(zip|rar|7z|tar|gz)$/.test(lowerName)) {
    return "ARCHIVE";
  }

  return "FILE";
}

function isLandscapeAttachment(
  attachment:
    | Pick<CreatePostAttachmentPayload, "width" | "height" | "type">
    | FeedPostAttachment,
) {
  const file = "file" in attachment ? attachment.file : attachment;

  if (file.type !== "IMAGE" && file.type !== "VIDEO") {
    return false;
  }

  if (file.width && file.height) {
    return file.width >= file.height;
  }

  return false;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
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

function createSharedPostPayload(post: FeedPost) {
  const cover = post.attachments.find(
    (attachment) =>
      attachment.file.type === "IMAGE" || attachment.file.type === "VIDEO",
  );

  return `__POST_SHARE__${JSON.stringify({
    postId: post.id,
    authorUsername: post.author.username,
    authorAvatarUrl: post.author.avatarUrl,
    content: post.content,
    coverUrl: cover?.file.thumbnailUrl || cover?.file.url || null,
    coverType: cover?.file.type || null,
  })}`;
}

function buildCommentsTree(comments: PostComment[]) {
  const map = new Map<string, PostComment & { replies: PostComment[] }>();
  const roots: Array<PostComment & { replies: PostComment[] }> = [];

  for (const comment of comments) {
    map.set(comment.id, {
      ...comment,
      replies: [],
    });
  }

  for (const comment of map.values()) {
    if (comment.parentId && map.has(comment.parentId)) {
      map.get(comment.parentId)!.replies.push(comment);
    } else {
      roots.push(comment);
    }
  }

  return roots;
}

export function PostCard({ post, context = "profile" }: PostCardProps) {
  const { user } = useAuth();
  const router = useRouter();
  const currentPost = post;
  const [areCommentsOpen, setAreCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(false);

  const commentsQuery = usePostCommentsQuery(currentPost.id, areCommentsOpen);
  const togglePostReactionMutation = useTogglePostReactionMutation();
  const createCommentMutation = useCreatePostCommentMutation();
  const toggleCommentReactionMutation = useToggleCommentReactionMutation();
  const deletePostMutation = useDeletePostMutation();
  const deleteCommentMutation = useDeletePostCommentMutation();

  const isOwnPost = user?.id === currentPost.author.id;
  const isFeedContext = context === "feed";

  const commentsTree = useMemo(
    () => buildCommentsTree(commentsQuery.data?.items ?? []),
    [commentsQuery.data],
  );

  const pendingAction = togglePostReactionMutation.isPending
    ? `post-reaction-${togglePostReactionMutation.variables?.type}`
    : createCommentMutation.isPending
      ? createCommentMutation.variables?.parentId
        ? `reply-${createCommentMutation.variables.parentId}`
        : "root-comment"
      : toggleCommentReactionMutation.isPending
        ? `comment-${toggleCommentReactionMutation.variables?.commentId}-${toggleCommentReactionMutation.variables?.type}`
        : deleteCommentMutation.isPending
          ? `delete-comment-${deleteCommentMutation.variables?.commentId}`
          : null;

  useEffect(() => {
    function handleHashFocus() {
      if (typeof window === "undefined") return;

      if (window.location.hash === `#post-${currentPost.id}`) {
        const node = document.getElementById(`post-${currentPost.id}`);
        node?.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlighted(true);
        window.setTimeout(() => setHighlighted(false), 2600);
      }
    }

    handleHashFocus();
    window.addEventListener("hashchange", handleHashFocus);
    return () => window.removeEventListener("hashchange", handleHashFocus);
  }, [currentPost.id]);

  async function toggleComments() {
    setAreCommentsOpen((prev) => !prev);
  }

  async function togglePostReaction(type: ReactionType) {
    try {
      setErrorMessage(null);
      await togglePostReactionMutation.mutateAsync({
        postId: currentPost.id,
        type,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось поставить реакцию",
      );
    }
  }

  async function createComment(parentId?: string | null) {
    const content = parentId
      ? replyTexts[parentId]?.trim()
      : commentText.trim();

    if (!content) {
      return;
    }

    try {
      setErrorMessage(null);
      await createCommentMutation.mutateAsync({
        postId: currentPost.id,
        content,
        parentId: parentId ?? null,
      });
      setAreCommentsOpen(true);

      if (parentId) {
        setReplyTexts((prev) => ({ ...prev, [parentId]: "" }));
        setReplyingToId(null);
      } else {
        setCommentText("");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось отправить комментарий",
      );
    }
  }

  async function toggleCommentReaction(commentId: string, type: ReactionType) {
    try {
      setErrorMessage(null);
      await toggleCommentReactionMutation.mutateAsync({ commentId, type });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось поставить реакцию на комментарий",
      );
    }
  }

  async function deleteComment(commentId: string) {
    try {
      setErrorMessage(null);
      await deleteCommentMutation.mutateAsync({
        commentId,
        postId: currentPost.id,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось удалить комментарий",
      );
    }
  }

  async function handleDeletePost() {
    try {
      setErrorMessage(null);
      await deletePostMutation.mutateAsync(currentPost.id);
      setDeleteConfirmOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось удалить пост",
      );
    }
  }

  return (
    <>
      <article
        id={`post-${currentPost.id}`}
        className={`scroll-mt-28 rounded-3xl border bg-white p-6 shadow-sm transition duration-300 max-md:p-4 ${highlighted ? "border-violet-300 ring-4 ring-violet-200" : "border-zinc-100"}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Link
              href={getProfileHref(currentPost.author.username, user?.username)}
              className="relative h-12 w-12 shrink-0 overflow-visible rounded-full"
            >
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-lg font-bold text-violet-700">
                {currentPost.author.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getAssetUrl(currentPost.author.avatarUrl)}
                    alt={currentPost.author.username}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  currentPost.author.username.slice(0, 1).toUpperCase()
                )}
              </span>
              {currentPost.author.isOnline && (
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
              )}
            </Link>

            <div className="min-w-0">
              <Link
                href={getProfileHref(
                  currentPost.author.username,
                  user?.username,
                )}
                className="font-bold text-zinc-950 transition hover:text-violet-700"
              >
                {currentPost.author.username}
              </Link>
              <p className="mt-0.5 text-sm font-medium text-zinc-400">
                {formatDate(currentPost.createdAt)}
              </p>
            </div>
          </div>

          {!isFeedContext && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((value) => !value)}
                className="rounded-full p-2 text-zinc-400 transition hover:bg-violet-50 hover:text-violet-700"
                aria-label="Действия с постом"
              >
                <MoreHorizontal size={20} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-10 z-20 w-56 rounded-2xl border border-zinc-100 bg-white p-2 text-sm shadow-xl">
                  {isOwnPost && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditOpen(true);
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-semibold text-zinc-700 hover:bg-violet-50"
                      >
                        <Edit3 size={16} />
                        Изменить пост
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteConfirmOpen(true);
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-semibold text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={16} />
                        Удалить пост
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShareOpen(true);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-semibold text-violet-700 hover:bg-violet-50"
                  >
                    <Share2 size={16} />
                    Поделиться в сообщениях
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {currentPost.content && (
          <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-zinc-700">
            {currentPost.content}
          </p>
        )}

        {currentPost.attachments.length > 0 && (
          <PostAttachmentsGrid attachments={currentPost.attachments} />
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
          <button
            type="button"
            disabled={pendingAction === "post-reaction-LIKE"}
            onClick={() => togglePostReaction("LIKE")}
            className={
              currentPost.viewerReaction === "LIKE"
                ? "inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-700 transition disabled:opacity-60"
                : "inline-flex items-center gap-2 rounded-2xl border border-zinc-100 bg-white px-4 py-2.5 text-sm font-bold text-zinc-500 transition hover:border-violet-200 hover:text-violet-700 disabled:opacity-60"
            }
          >
            {pendingAction === "post-reaction-LIKE" ? (
              <Loader2 className="animate-spin" size={17} />
            ) : (
              <Heart size={17} />
            )}
            {currentPost.likesCount}
          </button>

          <button
            type="button"
            disabled={pendingAction === "post-reaction-DISLIKE"}
            onClick={() => togglePostReaction("DISLIKE")}
            className={
              currentPost.viewerReaction === "DISLIKE"
                ? "inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-500 transition disabled:opacity-60"
                : "inline-flex items-center gap-2 rounded-2xl border border-zinc-100 bg-white px-4 py-2.5 text-sm font-bold text-zinc-500 transition hover:border-red-200 hover:text-red-500 disabled:opacity-60"
            }
          >
            {pendingAction === "post-reaction-DISLIKE" ? (
              <Loader2 className="animate-spin" size={17} />
            ) : (
              <ThumbsDown size={17} />
            )}
            {currentPost.dislikesCount}
          </button>

          <button
            type="button"
            onClick={toggleComments}
            className="inline-flex items-center gap-2 rounded-2xl border border-zinc-100 bg-white px-4 py-2.5 text-sm font-bold text-zinc-500 transition hover:border-violet-200 hover:text-violet-700"
          >
            <MessageCircle size={17} />
            {currentPost.commentsCount}
          </button>

          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="ml-auto inline-flex items-center gap-2 rounded-2xl border border-zinc-100 bg-white px-4 py-2.5 text-sm font-bold text-zinc-500 transition hover:border-violet-200 hover:text-violet-700"
          >
            <Share2 size={17} />
            Поделиться
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {errorMessage}
          </div>
        )}

        {areCommentsOpen && (
          <div className="mt-5 border-t border-zinc-100 pt-5">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-sm font-bold text-violet-700">
                {user?.profile?.avatarUrl ? (
                  <img
                    src={getAssetUrl(user.profile.avatarUrl)}
                    alt={user.username}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (user?.username?.slice(0, 1).toUpperCase() ?? "U")
                )}
              </div>

              <div className="flex-1">
                <textarea
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Написать комментарий..."
                  className="min-h-20 w-full resize-none rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-violet-200 focus:bg-white"
                />

                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={
                      pendingAction === "root-comment" || !commentText.trim()
                    }
                    onClick={() => createComment(null)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingAction === "root-comment" ? (
                      <Loader2 className="animate-spin" size={17} />
                    ) : (
                      <Send size={17} />
                    )}
                    Отправить
                  </button>
                </div>
              </div>
            </div>

            {commentsQuery.isLoading ? (
              <div className="flex min-h-24 items-center justify-center">
                <Loader2 className="animate-spin text-violet-600" size={24} />
              </div>
            ) : commentsTree.length > 0 ? (
              <div className="mt-5 space-y-4">
                {commentsTree.map((comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    level={0}
                    currentUsername={user?.username}
                    currentUserId={user?.id}
                    pendingAction={pendingAction}
                    replyingToId={replyingToId}
                    replyText={replyTexts[comment.id] ?? ""}
                    onStartReply={() => setReplyingToId(comment.id)}
                    onCancelReply={() => setReplyingToId(null)}
                    onReplyTextChange={(value) =>
                      setReplyTexts((prev) => ({
                        ...prev,
                        [comment.id]: value,
                      }))
                    }
                    onCreateReply={() => createComment(comment.id)}
                    onToggleReaction={toggleCommentReaction}
                    onDelete={deleteComment}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-5 rounded-2xl bg-zinc-50 px-4 py-4 text-center text-sm font-medium text-zinc-500">
                Комментариев пока нет. Будьте первым.
              </p>
            )}
          </div>
        )}
      </article>

      {deleteConfirmOpen && (
        <ConfirmModal
          title="Удалить пост?"
          text="Пост пропадет из профиля и ленты. Это действие нельзя быстро отменить."
          confirmText={
            deletePostMutation.isPending ? "Удаляем..." : "Удалить пост"
          }
          onClose={() => setDeleteConfirmOpen(false)}
          onConfirm={handleDeletePost}
        />
      )}

      {editOpen && (
        <EditPostModal post={currentPost} onClose={() => setEditOpen(false)} />
      )}
      {shareOpen && (
        <SharePostModal
          post={currentPost}
          onClose={() => setShareOpen(false)}
          onShared={(chat) => router.push(createChatHref(chat))}
        />
      )}
    </>
  );
}

function PostAttachmentsGrid({
  attachments,
}: {
  attachments: FeedPostAttachment[];
}) {
  const media = attachments.filter(
    (attachment) =>
      attachment.file.type === "IMAGE" || attachment.file.type === "VIDEO",
  );
  const other = attachments.filter(
    (attachment) =>
      attachment.file.type !== "IMAGE" && attachment.file.type !== "VIDEO",
  );
  const mediaCount = media.length;
  const visibleMedia = media.slice(0, 4);
  const allLandscape =
    visibleMedia.length > 0 && visibleMedia.every(isLandscapeAttachment);
  const gridClass =
    mediaCount === 1
      ? "grid-cols-1 max-w-3xl"
      : allLandscape
        ? "grid-cols-2 max-w-3xl"
        : "grid-cols-2 max-w-2xl";

  function tileClass(attachment: FeedPostAttachment) {
    const landscape = isLandscapeAttachment(attachment);

    if (mediaCount === 1) {
      return landscape ? "aspect-[16/9]" : "aspect-[3/4] max-w-sm mx-auto";
    }

    if (landscape) {
      return mediaCount <= 2 ? "aspect-[16/10]" : "aspect-[4/3]";
    }

    return mediaCount <= 2 ? "aspect-[3/4]" : "aspect-[1/1.25]";
  }

  return (
    <div className="mt-5 space-y-3">
      {media.length > 0 && (
        <div
          className={`mx-auto grid w-full ${gridClass} gap-2 overflow-hidden rounded-3xl border border-zinc-100 bg-zinc-50 p-2`}
        >
          {visibleMedia.map((attachment, index) => (
            <PostMediaTile
              key={attachment.id}
              attachment={attachment}
              className={tileClass(attachment)}
              mediaCount={mediaCount}
              overlay={
                index === 3 && mediaCount > 4 ? `+${mediaCount - 4}` : null
              }
            />
          ))}
        </div>
      )}

      {other.length > 0 && (
        <div className="grid gap-2">
          {other.map((attachment) => (
            <AttachmentPreview key={attachment.id} attachment={attachment} />
          ))}
        </div>
      )}
    </div>
  );
}

function PostMediaTile({
  attachment,
  className,
  mediaCount,
  overlay,
}: {
  attachment: FeedPostAttachment;
  className: string;
  mediaCount: number;
  overlay?: string | null;
}) {
  const [previewType, setPreviewType] = useState<null | "IMAGE" | "VIDEO">(
    null,
  );
  const [detectedLandscape, setDetectedLandscape] = useState<boolean | null>(
    () => (isLandscapeAttachment(attachment) ? true : null),
  );
  const file = attachment.file;
  const url = getAssetUrl(file.url) ?? file.url;
  const title = file.filename ?? "Вложение";
  const effectiveClass =
    detectedLandscape === null
      ? className
      : mediaCount === 1
        ? detectedLandscape
          ? "aspect-[16/9]"
          : "aspect-[3/4] max-w-sm mx-auto"
        : detectedLandscape
          ? mediaCount <= 2
            ? "aspect-[16/10]"
            : "aspect-[4/3]"
          : mediaCount <= 2
            ? "aspect-[3/4]"
            : "aspect-[1/1.25]";

  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewType(file.type as "IMAGE" | "VIDEO")}
        className={`relative block min-w-0 overflow-hidden rounded-2xl bg-zinc-900 text-left transition hover:ring-2 hover:ring-violet-200 ${effectiveClass}`}
      >
        {file.type === "IMAGE" ? (
          <img
            src={url}
            alt={title}
            onLoad={(event) =>
              setDetectedLandscape(
                event.currentTarget.naturalWidth >=
                  event.currentTarget.naturalHeight,
              )
            }
            className={
              detectedLandscape
                ? "h-full w-full object-contain bg-zinc-100"
                : "h-full w-full object-cover"
            }
          />
        ) : (
          <video
            src={url}
            poster={getAssetUrl(file.thumbnailUrl)}
            muted
            preload="metadata"
            onLoadedMetadata={(event) =>
              setDetectedLandscape(
                event.currentTarget.videoWidth >=
                  event.currentTarget.videoHeight,
              )
            }
            className={
              detectedLandscape
                ? "h-full w-full object-contain bg-zinc-100"
                : "h-full w-full object-cover"
            }
          />
        )}
        {file.type === "VIDEO" && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-sm font-bold text-white">
            Видео
          </span>
        )}
        {overlay && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-3xl font-black text-white">
            {overlay}
          </span>
        )}
      </button>
      {previewType && (
        <PostMediaPreviewModal
          src={url}
          title={title}
          type={previewType}
          onClose={() => setPreviewType(null)}
        />
      )}
    </>
  );
}

function ConfirmModal({
  title,
  text,
  confirmText,
  onClose,
  onConfirm,
}: {
  title: string;
  text: string;
  confirmText: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 px-4 py-6"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-slate-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">{text}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-zinc-100 px-4 py-2 text-sm font-bold text-zinc-600 hover:bg-zinc-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditPostModal({
  post,
  onClose,
}: {
  post: FeedPost;
  onClose: () => void;
}) {
  const [content, setContent] = useState(post.content ?? "");
  const [attachments, setAttachments] = useState<CreatePostAttachmentPayload[]>(
    () =>
      post.attachments.map(({ file }) => ({
        type: file.type,
        url: file.url,
        thumbnailUrl: file.thumbnailUrl,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        width: file.width,
        height: file.height,
        duration: file.duration,
      })),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    src: string;
    title: string;
    type: "IMAGE" | "VIDEO";
  } | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const archiveInputRef = useRef<HTMLInputElement | null>(null);
  const updatePostMutation = useUpdatePostMutation();
  const uploadPostFileMutation = useUploadPostFileMutation();

  async function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    try {
      setErrorMessage(null);
      const uploadedFiles = await Promise.all(
        files.map((file) =>
          uploadPostFileMutation.mutateAsync({
            file,
            type: getPostUploadType(file),
          }),
        ),
      );
      setAttachments((prev) => [...prev, ...uploadedFiles].slice(0, 10));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось загрузить файл",
      );
    }
  }

  async function handleSubmit() {
    try {
      setErrorMessage(null);
      await updatePostMutation.mutateAsync({
        postId: post.id,
        data: { content: content.trim() || undefined, attachments },
      });
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось изменить пост",
      );
    }
  }

  const isPending =
    updatePostMutation.isPending || uploadPostFileMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 px-4 py-6"
      onMouseDown={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Изменить пост</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Можно изменить текст, добавить или убрать медиа.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-zinc-100"
          >
            <X size={20} />
          </button>
        </div>

        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="min-h-36 w-full resize-none rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm outline-none focus:border-violet-200 focus:bg-white"
        />

        <div className="mt-4 flex flex-wrap gap-2 border-b border-zinc-100 pb-4">
          <EditMediaButton
            icon={ImageIcon}
            label="Фото"
            onClick={() => imageInputRef.current?.click()}
          />
          <EditMediaButton
            icon={Video}
            label="Видео"
            onClick={() => videoInputRef.current?.click()}
          />
          <EditMediaButton
            icon={Music}
            label="Аудио"
            onClick={() => audioInputRef.current?.click()}
          />
          <EditMediaButton
            icon={FileText}
            label="Файл"
            onClick={() => fileInputRef.current?.click()}
          />
          <EditMediaButton
            icon={Archive}
            label="Архив"
            onClick={() => archiveInputRef.current?.click()}
          />
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleFilesChange}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          multiple
          hidden
          onChange={handleFilesChange}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={handleFilesChange}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={handleFilesChange}
        />
        <input
          ref={archiveInputRef}
          type="file"
          accept=".zip,.rar,.7z,.tar,.gz"
          multiple
          hidden
          onChange={handleFilesChange}
        />

        {attachments.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-slate-900">Медиа и файлы</p>
              <button
                type="button"
                onClick={() => setAttachments([])}
                className="text-xs font-bold text-red-600 hover:underline"
              >
                Удалить все
              </button>
            </div>
            <div className="grid gap-2">
              {attachments.map((attachment, index) => {
                const title = attachment.filename ?? attachment.url;
                const previewUrl =
                  getAssetUrl(attachment.thumbnailUrl || attachment.url) ??
                  attachment.url;
                const canPreview =
                  attachment.type === "IMAGE" || attachment.type === "VIDEO";

                return (
                  <div
                    key={`${attachment.url}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-100 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-3 text-sm">
                      {canPreview ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPreview({
                              src:
                                getAssetUrl(attachment.url) ?? attachment.url,
                              title,
                              type: attachment.type as "IMAGE" | "VIDEO",
                            })
                          }
                          className="h-12 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-100 transition hover:ring-2 hover:ring-violet-200"
                        >
                          {attachment.type === "IMAGE" ? (
                            <img
                              src={previewUrl}
                              alt={title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <video
                              src={previewUrl}
                              muted
                              preload="metadata"
                              className="h-full w-full object-cover"
                            />
                          )}
                        </button>
                      ) : (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                          <FileText size={18} />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-800">
                          {title}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {attachment.type} ·{" "}
                          {formatFileSize(attachment.sizeBytes)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((items) =>
                          items.filter((_, i) => i !== index),
                        )
                      }
                      className="rounded-xl px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                    >
                      Удалить
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {preview && (
          <PostMediaPreviewModal
            src={preview.src}
            title={preview.title}
            type={preview.type}
            onClose={() => setPreview(null)}
          />
        )}

        {errorMessage && (
          <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {errorMessage}
          </p>
        )}

        <button
          type="button"
          disabled={isPending || (!content.trim() && attachments.length === 0)}
          onClick={handleSubmit}
          className="mt-5 w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-100 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploadPostFileMutation.isPending
            ? "Загружаем файл..."
            : updatePostMutation.isPending
              ? "Сохраняем..."
              : "Сохранить изменения"}
        </button>
      </div>
    </div>
  );
}

function EditMediaButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof ImageIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-2xl border border-zinc-100 bg-white px-4 py-2.5 text-sm font-bold text-zinc-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
    >
      <Icon size={17} />
      {label}
    </button>
  );
}

function SharePostModal({
  post,
  onClose,
  onShared,
}: {
  post: FeedPost;
  onClose: () => void;
  onShared: (chat: Chat) => void;
}) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [chatPage, setChatPage] = useState(1);
  const [loadedChats, setLoadedChats] = useState<Chat[]>([]);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const chatsQuery = useChatsQuery({
    search,
    searchIn: "all",
    page: chatPage,
    limit: 8,
  });
  const allDirectChatsQuery = useChatsQuery({
    search: "",
    searchIn: "all",
    page: 1,
    limit: 1000,
  });
  const usersQuery = useSearchUsersQuery({ search, limit: 80 });
  const createMessage = useCreateMessageMutation();
  const createDirectChat = useCreateDirectChatMutation();
  const chatMeta = chatsQuery.data?.meta;

  useEffect(() => {
    setChatPage(1);
    setLoadedChats([]);
  }, [search]);

  useEffect(() => {
    if (!chatsQuery.data || chatsQuery.isPlaceholderData) {
      return;
    }

    const pageItems = chatsQuery.data.items;
    setLoadedChats((current) => {
      if (chatPage === 1) {
        return pageItems;
      }

      const currentIds = new Set(current.map((chat) => chat.id));
      return [
        ...current,
        ...pageItems.filter((chat) => !currentIds.has(chat.id)),
      ];
    });
  }, [chatPage, chatsQuery.data, chatsQuery.isPlaceholderData]);

  useEffect(() => {
    if (
      !chatMeta ||
      chatsQuery.isFetching ||
      chatPage >= chatMeta.totalPages ||
      loadedChats.length === 0
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const node = chatListRef.current;
      if (node && node.scrollHeight <= node.clientHeight + 8) {
        setChatPage((value) => Math.min(value + 1, chatMeta.totalPages));
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [chatMeta, chatPage, chatsQuery.isFetching, loadedChats.length]);

  function handleChatsScroll(event: UIEvent<HTMLDivElement>) {
    const node = event.currentTarget;

    if (!chatMeta || chatsQuery.isFetching || chatPage >= chatMeta.totalPages) {
      return;
    }

    const distanceToBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight;

    if (distanceToBottom < 120) {
      setChatPage((value) => Math.min(value + 1, chatMeta.totalPages));
    }
  }

  async function shareToChat(chat: Chat) {
    try {
      setErrorMessage(null);
      await createMessage.mutateAsync({
        chatId: chat.id,
        content: createSharedPostPayload(post),
      });
      onClose();
      onShared(chat);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось поделиться постом",
      );
    }
  }

  async function shareToUser(username: string) {
    try {
      setErrorMessage(null);
      const chat = await createDirectChat.mutateAsync(username);
      await createMessage.mutateAsync({
        chatId: chat.id,
        content: createSharedPostPayload(post),
      });
      onClose();
      onShared(chat);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось создать чат и поделиться постом",
      );
    }
  }

  const isPending = createMessage.isPending || createDirectChat.isPending;
  const directChatUsernames = new Set(
    (allDirectChatsQuery.data?.items ?? loadedChats)
      .filter((chat) => chat.type === "DIRECT" && chat.directUser?.username)
      .map((chat) => chat.directUser!.username),
  );
  const users = (usersQuery.data?.items ?? []).filter((candidate) => {
    if (candidate.username === user?.username) return false;
    return !directChatUsernames.has(candidate.username);
  });

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 px-4 py-6"
      onMouseDown={onClose}
    >
      <div
        className="flex h-[720px] max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex shrink-0 items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Поделиться постом
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Выбери существующий чат или пользователя без чата.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-zinc-100"
          >
            <X size={20} />
          </button>
        </div>

        <label className="mb-4 flex shrink-0 items-center gap-2 rounded-2xl border border-zinc-200 px-3 py-2 text-sm text-zinc-400">
          <User size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Найти чат или пользователя"
            className="min-w-0 flex-1 bg-transparent text-zinc-900 outline-none placeholder:text-zinc-400"
          />
        </label>

        {errorMessage && (
          <p className="mb-4 shrink-0 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {errorMessage}
          </p>
        )}

        <div className="grid min-h-0 flex-1 grid-rows-2 gap-4 overflow-hidden">
          <section className="flex min-h-0 flex-col space-y-2">
            <p className="shrink-0 text-sm font-bold text-slate-900">Чаты</p>
            <div
              ref={chatListRef}
              onScroll={handleChatsScroll}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
            >
              {chatsQuery.isLoading && loadedChats.length === 0 && (
                <p className="py-6 text-center text-sm text-zinc-500">
                  Загружаем чаты...
                </p>
              )}
              {!chatsQuery.isLoading && loadedChats.length === 0 && (
                <p className="py-6 text-center text-sm text-zinc-500">
                  Чаты не найдены
                </p>
              )}
              {loadedChats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => shareToChat(chat)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-zinc-100 px-3 py-3 text-left hover:bg-violet-50 disabled:opacity-60"
                >
                  <span className="relative h-10 w-10 shrink-0 overflow-visible rounded-full">
                    <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-sm font-bold text-violet-700">
                      {chat.avatarUrl ? (
                        <img
                          src={getAssetUrl(chat.avatarUrl)}
                          alt={chat.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        chat.title.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    {chat.type === "DIRECT" && chat.directUser?.isOnline && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {chat.title}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      {chat.type === "GROUP"
                        ? `${chat.membersCount} участников`
                        : "Личный чат"}
                    </span>
                  </span>
                </button>
              ))}
              {chatsQuery.isFetching && loadedChats.length > 0 && (
                <p className="py-3 text-center text-xs font-semibold text-zinc-400">
                  Загружаем ещё чаты...
                </p>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col space-y-2">
            <p className="shrink-0 text-sm font-bold text-slate-900">
              Пользователи без чата
            </p>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {usersQuery.isLoading && (
                <p className="py-6 text-center text-sm text-zinc-500">
                  Ищем пользователей...
                </p>
              )}
              {!usersQuery.isLoading && users.length === 0 && (
                <p className="py-6 text-center text-sm text-zinc-500">
                  Подходящих пользователей нет
                </p>
              )}
              {users.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => shareToUser(candidate.username)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-zinc-100 px-3 py-3 text-left hover:bg-violet-50 disabled:opacity-60"
                >
                  <span className="relative h-10 w-10 shrink-0 overflow-visible rounded-full">
                    <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-sm font-bold text-violet-700">
                      {candidate.avatarUrl ? (
                        <img
                          src={getAssetUrl(candidate.avatarUrl)}
                          alt={candidate.username}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        candidate.username.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    {candidate.isOnline && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {candidate.username}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      {candidate.mutualFriendsCount} общих друзей
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  level,
  currentUsername,
  currentUserId,
  pendingAction,
  replyingToId,
  replyText,
  onStartReply,
  onCancelReply,
  onReplyTextChange,
  onCreateReply,
  onToggleReaction,
  onDelete,
}: {
  comment: PostComment & { replies?: PostComment[] };
  level: number;
  currentUsername?: string | null;
  currentUserId?: string | null;
  pendingAction: string | null;
  replyingToId: string | null;
  replyText: string;
  onStartReply: () => void;
  onCancelReply: () => void;
  onReplyTextChange: (value: string) => void;
  onCreateReply: () => void;
  onToggleReaction: (commentId: string, type: ReactionType) => void;
  onDelete: (commentId: string) => void;
}) {
  const replies = comment.replies ?? [];
  const canDelete = currentUserId === comment.author.id;
  const isReplyOpen = replyingToId === comment.id;

  return (
    <div className={level > 0 ? "ml-8 border-l border-zinc-100 pl-4" : ""}>
      <div className="flex gap-3">
        <Link
          href={getProfileHref(comment.author.username, currentUsername)}
          className="relative h-9 w-9 shrink-0 overflow-visible rounded-full"
        >
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-sm font-bold text-violet-700">
            {comment.author.avatarUrl ? (
              <img
                src={getAssetUrl(comment.author.avatarUrl)}
                alt={comment.author.username}
                className="h-full w-full object-cover"
              />
            ) : (
              comment.author.username.slice(0, 1).toUpperCase()
            )}
          </span>
          {comment.author.isOnline && (
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="rounded-2xl bg-zinc-50 px-4 py-3">
            <Link
              href={getProfileHref(comment.author.username, currentUsername)}
              className="text-sm font-bold text-zinc-950 hover:text-violet-700"
            >
              {comment.author.username}
            </Link>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
              {comment.content}
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pendingAction === `comment-${comment.id}-LIKE`}
              onClick={() => onToggleReaction(comment.id, "LIKE")}
              className={
                comment.viewerReaction === "LIKE"
                  ? "inline-flex items-center gap-1 rounded-xl bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 disabled:opacity-60"
                  : "inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-zinc-500 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-60"
              }
            >
              <Heart size={14} />
              {comment.likesCount}
            </button>
            <button
              type="button"
              disabled={pendingAction === `comment-${comment.id}-DISLIKE`}
              onClick={() => onToggleReaction(comment.id, "DISLIKE")}
              className={
                comment.viewerReaction === "DISLIKE"
                  ? "inline-flex items-center gap-1 rounded-xl bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 disabled:opacity-60"
                  : "inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-zinc-500 hover:bg-red-50 hover:text-red-500 disabled:opacity-60"
              }
            >
              <ThumbsDown size={14} />
              {comment.dislikesCount}
            </button>
            <button
              type="button"
              onClick={onStartReply}
              className="rounded-xl px-3 py-1.5 text-xs font-bold text-zinc-500 transition hover:bg-violet-50 hover:text-violet-700"
            >
              Ответить
            </button>
            {canDelete && (
              <button
                type="button"
                disabled={pendingAction === `delete-comment-${comment.id}`}
                onClick={() => onDelete(comment.id)}
                className="rounded-xl px-3 py-1.5 text-xs font-bold text-red-500 transition hover:bg-red-50 disabled:opacity-60"
              >
                Удалить
              </button>
            )}
            <span className="text-xs font-medium text-zinc-400">
              {formatDate(comment.createdAt)}
            </span>
          </div>

          {isReplyOpen && (
            <div className="mt-3">
              <textarea
                value={replyText}
                onChange={(event) => onReplyTextChange(event.target.value)}
                placeholder={`Ответить ${comment.author.username}...`}
                className="min-h-16 w-full resize-none rounded-2xl border border-zinc-100 bg-white px-4 py-3 text-sm font-medium text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-violet-200"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancelReply}
                  className="rounded-2xl border border-zinc-100 bg-white px-4 py-2 text-sm font-bold text-zinc-500 transition hover:bg-zinc-50"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={
                    pendingAction === `reply-${comment.id}` || !replyText.trim()
                  }
                  onClick={onCreateReply}
                  className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pendingAction === `reply-${comment.id}` ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Send size={16} />
                  )}
                  Ответить
                </button>
              </div>
            </div>
          )}

          {replies.length > 0 && (
            <div className="mt-4 space-y-4">
              {replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  level={level + 1}
                  currentUsername={currentUsername}
                  currentUserId={currentUserId}
                  pendingAction={pendingAction}
                  replyingToId={replyingToId}
                  replyText=""
                  onStartReply={() => {}}
                  onCancelReply={() => {}}
                  onReplyTextChange={() => {}}
                  onCreateReply={() => {}}
                  onToggleReaction={onToggleReaction}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PostMediaPreviewModal({
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
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 px-4 py-6"
      onMouseDown={onClose}
    >
      <div
        className="relative max-h-[92dvh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white p-3 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2 text-slate-700 shadow-lg transition hover:bg-white"
          aria-label="Закрыть просмотр"
        >
          <X size={20} />
        </button>
        {type === "IMAGE" ? (
          <img
            src={src}
            alt={title}
            className="max-h-[calc(92dvh-1.5rem)] w-full rounded-2xl object-contain"
          />
        ) : (
          <video
            src={src}
            controls
            autoPlay
            className="max-h-[calc(92dvh-1.5rem)] w-full rounded-2xl bg-black"
          />
        )}
      </div>
    </div>
  );
}

function AttachmentPreview({ attachment }: { attachment: FeedPostAttachment }) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const file = attachment.file;
  const url = getAssetUrl(file.url) ?? file.url;
  const title = file.filename ?? "Вложение";

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

  if (file.type === "AUDIO") {
    return (
      <div className="rounded-3xl border border-zinc-100 bg-violet-50 p-4">
        <div className="mb-3 flex items-center gap-3 text-sm font-bold text-violet-700">
          <Music size={18} />
          <span className="min-w-0 flex-1 truncate">{title}</span>
        </div>
        <audio src={url} controls className="w-full" />
      </div>
    );
  }

  const Icon = file.type === "ARCHIVE" ? Archive : FileText;

  return (
    <div>
      <button
        type="button"
        onClick={handleDownload}
        className="flex w-full items-center gap-4 rounded-3xl border border-zinc-100 bg-white p-4 text-left transition hover:border-violet-200 hover:bg-violet-50"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
          <Icon size={22} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-zinc-900">{title}</p>
          <p className="mt-1 text-sm font-medium text-zinc-400">
            {formatFileSize(file.sizeBytes)}
          </p>
        </div>
      </button>
      {downloadError && (
        <p className="mt-2 text-sm font-semibold text-red-500">
          {downloadError}
        </p>
      )}
    </div>
  );
}
