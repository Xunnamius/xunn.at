import type { ObjectId } from 'mongodb';
import { NextApiRequest, NextApiResponse } from 'next';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UserId extends ObjectId {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MemeId extends ObjectId {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UploadId extends ObjectId {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FriendId extends MemeId {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FriendRequestId extends MemeId {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UnixEpochMs extends Number {}

/**
 * The shape of the options object accepted by the chats worker.
 */
export type ChatsWorkerOptions = {
  debugNamespace: string;
  user_id: string;
  username: string;
  startTimeMs: UnixEpochMs;
};

/**
 * The shape of the options object accepted by the friends worker.
 */
export type FriendsWorkerOptions = {
  debugNamespace: string;
  user_id: string;
  username: string;
  startTimeMs: UnixEpochMs;
};

/**
 * The shape of the options object accepted by the interactions worker.
 */
export type InteractionsWorkerOptions = {
  debugNamespace: string;
  user_id: string;
  username: string;
  friend_ids: string[];
  startTimeMs: UnixEpochMs;
};

/**
 * The shape of the options object accepted by the memes worker.
 */
export type MemesWorkerOptions = {
  debugNamespace: string;
  user_id: string;
  username: string;
  startTimeMs: UnixEpochMs;
};

/**
 * The shape of an imgur image upload response.
 * @see https://apidocs.imgur.com
 */
export type ImgurApiResponse = {
  data: {
    link?: string;
    error?: string;
  };
};

/**
 * A type combining NextApiRequest and NextApiResponse.
 */
export type NextApiState<T = unknown> = {
  req: NextApiRequest;
  res: NextApiResponse<T>;
};

/**
 * The shape of API metadata stored in MongoDb.
 */
export type InternalInfo = {
  totalMemes: number;
  totalUsers: number;
  totalUploads: number;
};

/**
 * The shape of a meme stored in MongoDb.
 */
export type InternalMeme = {
  /**
   * The ID of the user that created and owns this meme.
   */
  owner: UserId;
  /**
   * The ID of the user that created and owns this meme.
   */
  receiver: UserId | null;
  /**
   * When this meme was created creation (milliseconds since unix epoch).
   */
  createdAt: UnixEpochMs;
  /**
   * When this meme was created creation (milliseconds since unix epoch).
   */
  expiredAt: UnixEpochMs | -1;
  /**
   * The utf-8 content of this meme.
   */
  description: string | null;
  /**
   * A list of user IDs that liked this meme.
   */
  likes: UserId[];
  /**
   * Integer number of likes this meme has received. We'll cache this data
   * instead of calculating it via the aggregation for performance reasons.
   */
  totalLikes: number;
  /**
   * If `true`, this meme should only be visible to authorized users.
   */
  private: boolean;
  /**
   * The ID of the meme this meme was created in response to.
   */
  replyTo: MemeId | null;
  /**
   * The HTTP image url of this meme.
   */
  imageUrl: string | null;
  /**
   * Metadata information only relevant to the server runtime and completely
   * opaque to API consumers.
   */
  meta: {
    /**
     * The API key responsible for creating this meme.
     */
    creator: string;
    /**
     * Determines how likely machine users are to take like-based actions on
     * this meme.
     *
     * @type number between 0 and 1
     */
    likeability: number;
    /**
     * Determines how likely machine users are to comment on (reply to) this
     * meme.
     *
     * @type number between 0 and 1
     */
    gregariousness: number;
  };
};

/**
 * The shape of a user stored in MongoDb.
 */
export type InternalUser = {
  /**
   * User first, full, etc name
   */
  name: string;
  /**
   * Email address
   */
  email: string;
  /**
   * Phone number
   */
  phone: string | null;
  /**
   * Username. Must be unique in the system.
   */
  username: string;
  /**
   * A list of user IDs this user is friends with.
   */
  friends: UserId[];
  /**
   * A list of meme IDs that this user has liked.
   */
  liked: MemeId[];
  /**
   * A list of friend requests involving this user.
   */
  requests: {
    /**
     * Friend requests that have been sent to this user.
     */
    incoming: UserId[];
    /**
     * Friend requests this user has sent to others.
     */
    outgoing: UserId[];
  };
  /**
   * If `true`, the user is for all intents and purposes non-existent in the
   * system.
   *
   * @default false
   */
  deleted: boolean;
  /**
   * The HTTP image url of this user's profile pic.
   */
  imageUrl: string | null;
  /**
   * Metadata information only relevant to the server runtime and completely
   * opaque to API consumers.
   */
  meta: {
    /**
     * The API key responsible for creating this meme.
     */
    creator: string;
  };
};

/**
 * The shape of upload metadata LRU cache stored in MongoDb.
 */
export type InternalUpload = {
  /**
   * The sha1 hash of the base64 image data.
   */
  hash: string;
  /**
   * The imgur uri for the image.
   */
  uri: string;
  /**
   * Updated whenever the record is used (milliseconds since unix epoch).
   */
  lastUsedAt: UnixEpochMs;
};

/**
 * The shape of a publicly available meme.
 */
export type PublicMeme = Pick<
  InternalMeme,
  'createdAt' | 'expiredAt' | 'description' | 'private' | 'imageUrl'
> & {
  meme_id: string;
  owner: string;
  receiver: string | null;
  replyTo: string | null;
  likes: InternalMeme['totalLikes'];
};

/**
 * The shape of a publicly available user.
 */
export type PublicUser = Pick<
  InternalUser,
  'name' | 'email' | 'phone' | 'username' | 'deleted' | 'imageUrl'
> & {
  user_id: string;
  friends: number;
  liked: number;
};

/**
 * The shape of a newly received meme.
 */
export type NewMeme = Pick<
  InternalMeme,
  'expiredAt' | 'description' | 'private' | 'imageUrl'
> & {
  owner: string;
  receiver: string | null;
  replyTo: string | null;
  imageBase64: string | null;
};

/**
 * The shape of a newly received user.
 */
export type NewUser = Pick<InternalUser, 'name' | 'email' | 'phone' | 'username'> & {
  imageBase64: string | null;
};

/**
 * The shape of a received update to an existing meme.
 */
export type PatchMeme = {
  expiredAt: InternalMeme['expiredAt'];
};

/**
 * The shape of a received update to an existing user.
 */
export type PatchUser = Pick<InternalUser, 'name' | 'email' | 'phone'> & {
  imageBase64?: string | null;
};

/**
 * Available types of friend requests.
 */
export type FriendRequestType = 'incoming' | 'outgoing';

/**
 * The shape of precomputed conversation corpus data.
 */
export type CorpusData = {
  dialogs: CorpusDialogLine[][];
  usernames: string[];
};

/**
 * The shape of a single line of precomputed conversation corpus data.
 */
export type CorpusDialogLine = {
  actor: 'A' | 'B';
  line: string;
};

/**
 * The shape of an API key.
 */
export type InternalApiKey = {
  owner: string;
  key: string;
};

/**
 * The shape of a request log entry.
 */
export type InternalRequestLogEntry = {
  ip: string | null;
  key: string | null;
  route: string | null;
  method: string | null;
  resStatusCode: number;
  time: number;
};

/**
 * The shape of a limited log entry.
 */
export type InternalLimitedLogEntry =
  | {
      until: number;
      ip: string | null;
      key?: never;
    }
  | {
      until: number;
      ip?: never;
      key: string | null;
    };
