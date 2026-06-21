export type SocialUserCard = {
  id: string;
  username: string;
  email: string;
  handle: string;
  avatarUrl: string | null;
  bio: string;
  isOnline: boolean;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type FriendsTab = "all" | "online" | "requests";
export type FriendsSort = "name" | "interaction";

export type DiscoverUserCard = SocialUserCard & {
  mutualFriendsCount: number;
};

export type UsersDiscoveryResponse = {
  items: DiscoverUserCard[];
};

export type FriendsResponse = {
  tab: FriendsTab;
  items: SocialUserCard[] | FriendRequestItem[];
  counters: {
    all: number;
    online: number;
    requests: number;
  };
  pagination: Pagination;
};

export type FriendRequestItem = {
  requestId: string;
  user: SocialUserCard;
  mutualFriendsCount: number;
};

export type SubscriptionsTab = "followers" | "following";
export type SubscriptionsSort = "new" | "active";

export type SubscriptionItem = {
  user: SocialUserCard;
  isFriend: boolean;
  isFollowing: boolean;
  incomingRequestId: string | null;
};

export type SubscriptionsResponse = {
  tab: SubscriptionsTab;
  items: SubscriptionItem[];
  counters: {
    followers: number;
    following: number;
  };
  pagination: Pagination;
};

export type ProfileRelationStatus =
  | "self"
  | "friend"
  | "incoming_request"
  | "outgoing_request"
  | "follower"
  | "following"
  | "none";

export type PublicProfileUser = {
  id: string;
  email: string;
  username: string;
  isEmailVerified: boolean;
  createdAt: string;
  isOnline: boolean;
  profile: {
    id: string;
    avatarUrl: string | null;
    bio: string | null;
    age: number | null;
    city: string | null;
    country: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type PublicProfileResponse = {
  user: PublicProfileUser;
  relation: {
    status: ProfileRelationStatus;
    isFriend: boolean;
    isFollowing: boolean;
    isFollower: boolean;
    incomingRequestId: string | null;
    outgoingRequestId: string | null;
  };
  counters: {
    friends: number;
    followers: number;
    following: number;
    posts: number;
  };
};

export type PostFileType = "IMAGE" | "VIDEO" | "AUDIO" | "FILE" | "ARCHIVE";
export type PostFileStatus = "PENDING" | "READY" | "FAILED";
export type ReactionType = "LIKE" | "DISLIKE";

export type FeedPostAttachment = {
  id: string;
  sortOrder: number;
  file: {
    id: string;
    type: PostFileType;
    status: PostFileStatus;
    url: string;
    thumbnailUrl: string | null;
    filename: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    width: number | null;
    height: number | null;
    duration: number | null;
  };
};

export type FeedPost = {
  id: string;
  content: string | null;
  likesCount: number;
  dislikesCount: number;
  commentsCount: number;
  createdAt: string;
  viewerReaction: ReactionType | null;
  author: {
    id: string;
    username: string;
    email: string;
    avatarUrl: string | null;
    isOnline: boolean;
  };
  attachments: FeedPostAttachment[];
};

export type PostsResponse = {
  items: FeedPost[];
  pagination: Pagination;
};

export type PostComment = {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  likesCount: number;
  dislikesCount: number;
  repliesCount: number;
  createdAt: string;
  viewerReaction: ReactionType | null;
  author: {
    id: string;
    username: string;
    email: string;
    avatarUrl: string | null;
    isOnline: boolean;
  };
};

export type PostCommentsResponse = {
  items: PostComment[];
};

export type CreatePostAttachmentPayload = {
  type: PostFileType;
  url: string;
  thumbnailUrl?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
};

export type CreatePostPayload = {
  content?: string;
  attachments?: CreatePostAttachmentPayload[];
};
