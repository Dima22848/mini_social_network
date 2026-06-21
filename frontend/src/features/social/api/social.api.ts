// API-обёртка социальных действий: друзья, подписки, профили, посты, реакции и комментарии.
import type {
  CreatePostAttachmentPayload,
  CreatePostPayload,
  FeedPost,
  FriendsResponse,
  FriendsSort,
  FriendsTab,
  PostCommentsResponse,
  PostsResponse,
  PublicProfileResponse,
  ReactionType,
  SubscriptionsResponse,
  SubscriptionsSort,
  SubscriptionsTab,
  UsersDiscoveryResponse,
} from '../types/social.types'
import {
  apiRequestWithAuth,
  apiUploadRequestWithAuth,
} from '@/features/auth/lib/auth-refresh-client'

function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      query.set(key, String(value))
    }
  }

  return query.toString()
}

export const socialApi = {

  discoverUsers(accessToken: string, params: { search?: string; limit?: number }) {
    return apiRequestWithAuth<UsersDiscoveryResponse>(
      `/users/discover?${buildQuery(params)}`,
      accessToken,
    )
  },

  searchUsers(accessToken: string, params: { search?: string; limit?: number }) {
    return apiRequestWithAuth<UsersDiscoveryResponse>(
      `/users/search?${buildQuery(params)}`,
      accessToken,
    )
  },
  getFriends(
    accessToken: string,
    params: {
      tab: FriendsTab
      search?: string
      sort?: FriendsSort
      page?: number
      limit?: number
    },
  ) {
    return apiRequestWithAuth<FriendsResponse>(
      `/users/friends?${buildQuery(params)}`,
      accessToken,
    )
  },

  getSubscriptions(
    accessToken: string,
    params: {
      tab: SubscriptionsTab
      search?: string
      sort?: SubscriptionsSort
      page?: number
      limit?: number
    },
  ) {
    return apiRequestWithAuth<SubscriptionsResponse>(
      `/users/subscriptions?${buildQuery(params)}`,
      accessToken,
    )
  },

  getPublicProfile(accessToken: string, userId: string) {
    return apiRequestWithAuth<PublicProfileResponse>(
      `/profiles/${userId}`,
      accessToken,
    )
  },

  uploadPostFile(accessToken: string, file: File, type: CreatePostAttachmentPayload['type']) {
    const formData = new FormData()
    formData.set('file', file)
    formData.set('type', type)

    return apiUploadRequestWithAuth<CreatePostAttachmentPayload>('/posts/uploads', accessToken, formData)
  },

  createPost(accessToken: string, payload: CreatePostPayload) {
    return apiRequestWithAuth<FeedPost>('/posts', accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  updatePost(accessToken: string, postId: string, payload: CreatePostPayload) {
    return apiRequestWithAuth<FeedPost>(`/posts/${postId}`, accessToken, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  deletePost(accessToken: string, postId: string) {
    return apiRequestWithAuth<{ success: true }>(`/posts/${postId}`, accessToken, {
      method: 'DELETE',
    })
  },

  getUserPosts(
    accessToken: string,
    userId: string,
    params: {
      page?: number
      limit?: number
    },
  ) {
    return apiRequestWithAuth<PostsResponse>(
      `/posts/users/${userId}?${buildQuery(params)}`,
      accessToken,
    )
  },

  getFeedPosts(
    accessToken: string,
    params: {
      page?: number
      limit?: number
    },
  ) {
    return apiRequestWithAuth<PostsResponse>(
      `/posts/feed?${buildQuery(params)}`,
      accessToken,
    )
  },

  togglePostReaction(
    accessToken: string,
    postId: string,
    type: ReactionType,
  ) {
    return apiRequestWithAuth<FeedPost>(
      `/posts/${postId}/reactions/toggle`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ type }),
      },
    )
  },

  getPostComments(accessToken: string, postId: string) {
    return apiRequestWithAuth<PostCommentsResponse>(
      `/posts/${postId}/comments`,
      accessToken,
    )
  },

  createPostComment(
    accessToken: string,
    postId: string,
    payload: {
      content: string
      parentId?: string | null
    },
  ) {
    return apiRequestWithAuth<PostCommentsResponse>(
      `/posts/${postId}/comments`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
  },

  deleteComment(accessToken: string, commentId: string) {
    return apiRequestWithAuth<PostCommentsResponse>(`/posts/comments/${commentId}`, accessToken, {
      method: 'DELETE',
    })
  },

  toggleCommentReaction(
    accessToken: string,
    commentId: string,
    type: ReactionType,
  ) {
    return apiRequestWithAuth<PostCommentsResponse>(
      `/posts/comments/${commentId}/reactions/toggle`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ type }),
      },
    )
  },

  sendFriendRequest(accessToken: string, targetUserId: string) {
    return apiRequestWithAuth<{ success: true }>(
      `/users/${targetUserId}/friend-request`,
      accessToken,
      {
        method: 'POST',
      },
    )
  },

  acceptFriendRequest(accessToken: string, requestId: string) {
    return apiRequestWithAuth<{ success: true }>(
      `/users/friend-requests/${requestId}/accept`,
      accessToken,
      {
        method: 'POST',
      },
    )
  },

  declineFriendRequest(accessToken: string, requestId: string) {
    return apiRequestWithAuth<{ success: true }>(
      `/users/friend-requests/${requestId}/decline`,
      accessToken,
      {
        method: 'POST',
      },
    )
  },

  removeFriend(accessToken: string, friendId: string) {
    return apiRequestWithAuth<{ success: true }>(
      `/users/friends/${friendId}`,
      accessToken,
      {
        method: 'DELETE',
      },
    )
  },

  unfollowUser(accessToken: string, targetUserId: string) {
    return apiRequestWithAuth<{ success: true }>(
      `/users/following/${targetUserId}`,
      accessToken,
      {
        method: 'DELETE',
      },
    )
  },

  removeFollower(accessToken: string, followerId: string) {
    return apiRequestWithAuth<{ success: true }>(
      `/users/followers/${followerId}`,
      accessToken,
      {
        method: 'DELETE',
      },
    )
  },
}