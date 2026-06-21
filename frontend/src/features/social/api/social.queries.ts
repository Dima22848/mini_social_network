import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/providers/AuthProvider'
import { socialApi } from './social.api'
import type {
  CreatePostAttachmentPayload,
  CreatePostPayload,
  FeedPost,
  FriendsSort,
  FriendsTab,
  ReactionType,
  SubscriptionsSort,
  SubscriptionsTab,
} from '../types/social.types'

export const socialQueryKeys = {
  all: ['social'] as const,
  friends: (params: {
    tab: FriendsTab
    search: string
    sort: FriendsSort
    page: number
    limit: number
  }) => ['social', 'friends', params] as const,
  discoverUsers: (params: { search: string; limit: number }) => ['social', 'users', 'discover', params] as const,
  searchUsers: (params: { search: string; limit: number }) => ['social', 'users', 'search', params] as const,
  subscriptions: (params: {
    tab: SubscriptionsTab
    search: string
    sort: SubscriptionsSort
    page: number
    limit: number
  }) => ['social', 'subscriptions', params] as const,
  profile: (userId: string) => ['social', 'profile', userId] as const,
  userPosts: (userId: string, params: { page: number; limit: number }) =>
    ['social', 'posts', 'user', userId, params] as const,
  feedPosts: (params: { page: number; limit: number }) =>
    ['social', 'posts', 'feed', params] as const,
  postComments: (postId: string) => ['social', 'posts', postId, 'comments'] as const,
}

function useAccessToken() {
  const { accessToken } = useAuth()

  if (!accessToken) {
    throw new Error('Нет access token')
  }

  return accessToken
}



export function useDiscoverUsersQuery(params: { search: string; limit: number }) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: socialQueryKeys.discoverUsers(params),
    queryFn: () => socialApi.discoverUsers(accessToken!, params),
    enabled: Boolean(accessToken),
    placeholderData: (previousData) => previousData,
  })
}

export function useSearchUsersQuery(params: { search: string; limit: number }) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: socialQueryKeys.searchUsers(params),
    queryFn: () => socialApi.searchUsers(accessToken!, params),
    enabled: Boolean(accessToken),
    placeholderData: (previousData) => previousData,
  })
}

export function useFriendsQuery(params: {
  tab: FriendsTab
  search: string
  sort: FriendsSort
  page: number
  limit: number
}) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: socialQueryKeys.friends(params),
    queryFn: () => socialApi.getFriends(accessToken!, params),
    enabled: Boolean(accessToken),
    placeholderData: (previousData) => previousData,
  })
}

export function useSubscriptionsQuery(params: {
  tab: SubscriptionsTab
  search: string
  sort: SubscriptionsSort
  page: number
  limit: number
}) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: socialQueryKeys.subscriptions(params),
    queryFn: () => socialApi.getSubscriptions(accessToken!, params),
    enabled: Boolean(accessToken),
    placeholderData: (previousData) => previousData,
  })
}

export function usePublicProfileQuery(userId: string) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: socialQueryKeys.profile(userId),
    queryFn: () => socialApi.getPublicProfile(accessToken!, userId),
    enabled: Boolean(accessToken && userId),
  })
}

export function useUserPostsQuery(
  userId: string | undefined,
  params: { page: number; limit: number },
) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: socialQueryKeys.userPosts(userId ?? 'unknown-user', params),
    queryFn: () => socialApi.getUserPosts(accessToken!, userId!, params),
    enabled: Boolean(accessToken && userId),
    placeholderData: (previousData) => previousData,
  })
}

export function useFeedPostsQuery(params: { page: number; limit: number }) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: socialQueryKeys.feedPosts(params),
    queryFn: () => socialApi.getFeedPosts(accessToken!, params),
    enabled: Boolean(accessToken),
    placeholderData: (previousData) => previousData,
  })
}

export function usePostCommentsQuery(postId: string, enabled: boolean) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: socialQueryKeys.postComments(postId),
    queryFn: () => socialApi.getPostComments(accessToken!, postId),
    enabled: Boolean(accessToken && postId && enabled),
  })
}


export function useUploadPostFileMutation() {
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (payload: { file: File; type: CreatePostAttachmentPayload['type'] }) =>
      socialApi.uploadPostFile(accessToken, payload.file, payload.type),
  })
}

export function useCreatePostMutation() {
  const queryClient = useQueryClient()
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (payload: CreatePostPayload) => socialApi.createPost(accessToken, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['social', 'posts'] })
      await queryClient.invalidateQueries({ queryKey: socialQueryKeys.all })
    },
  })
}



export function useUpdatePostMutation() {
  const queryClient = useQueryClient()
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (payload: { postId: string; data: CreatePostPayload }) =>
      socialApi.updatePost(accessToken, payload.postId, payload.data),
    onSuccess: async (post: FeedPost) => {
      queryClient.setQueriesData(
        { queryKey: ['social', 'posts'] },
        (oldData: unknown) => patchPostInPostsResponse(oldData, post),
      )
      await queryClient.invalidateQueries({ queryKey: ['social', 'posts'] })
    },
  })
}

export function useDeletePostMutation() {
  const queryClient = useQueryClient()
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (postId: string) => socialApi.deletePost(accessToken, postId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['social', 'posts'] })
      await queryClient.invalidateQueries({ queryKey: socialQueryKeys.all })
    },
  })
}

export function useTogglePostReactionMutation() {
  const queryClient = useQueryClient()
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (data: { postId: string; type: ReactionType }) =>
      socialApi.togglePostReaction(accessToken, data.postId, data.type),
    onSuccess: async (post: FeedPost) => {
      queryClient.setQueriesData(
        { queryKey: ['social', 'posts'] },
        (oldData: unknown) => patchPostInPostsResponse(oldData, post),
      )
    },
  })
}

export function useCreatePostCommentMutation() {
  const queryClient = useQueryClient()
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (data: { postId: string; content: string; parentId?: string | null }) =>
      socialApi.createPostComment(accessToken, data.postId, {
        content: data.content,
        parentId: data.parentId ?? null,
      }),
    onSuccess: async (comments, variables) => {
      queryClient.setQueryData(socialQueryKeys.postComments(variables.postId), comments)
      await queryClient.invalidateQueries({ queryKey: ['social', 'posts'] })
    },
  })
}

export function useToggleCommentReactionMutation() {
  const queryClient = useQueryClient()
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (data: { commentId: string; type: ReactionType }) =>
      socialApi.toggleCommentReaction(accessToken, data.commentId, data.type),
    onSuccess: async (comments) => {
      const postId = comments.items[0]?.postId

      if (postId) {
        queryClient.setQueryData(socialQueryKeys.postComments(postId), comments)
      }
    },
  })
}

export function useSocialActionMutation() {
  const queryClient = useQueryClient()
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (action: (accessToken: string) => Promise<unknown>) => action(accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: socialQueryKeys.all })
    },
  })
}

function patchPostInPostsResponse(oldData: unknown, updatedPost: FeedPost) {
  if (!oldData || typeof oldData !== 'object' || !('items' in oldData)) {
    return oldData
  }

  const data = oldData as { items: FeedPost[] }

  return {
    ...data,
    items: data.items.map((post) =>
      post.id === updatedPost.id ? updatedPost : post,
    ),
  }
}


export function useDeletePostCommentMutation() {
  const queryClient = useQueryClient()
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (payload: { commentId: string; postId: string }) =>
      socialApi.deleteComment(accessToken, payload.commentId),
    onSuccess: async (comments, variables) => {
      queryClient.setQueryData(socialQueryKeys.postComments(variables.postId), comments)
      await queryClient.invalidateQueries({ queryKey: ['social', 'posts'] })
    },
  })
}
