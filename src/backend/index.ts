import { version as pkgVersion } from 'package';
import { createHash, randomInt } from 'crypto';
import { ObjectId } from 'mongodb';
import { toss } from 'toss-expression';
import { getClientIp } from 'request-ip';
import { isPlainObject } from 'is-plain-object';
import { getEnv } from 'universe/backend/env';
import { getDb, itemExists, itemToObjectId, itemToStringId } from 'universe/backend/db';
import fetch from 'node-fetch';

import {
  AppError,
  InvalidIdError,
  InvalidKeyError,
  ValidationError,
  GuruMeditationError,
  NotFoundError,
  ItemNotFoundError
} from 'universe/backend/error';

import type { NextApiRequest } from 'next';
import type { WithId } from 'mongodb';

import {
  NextApiState,
  InternalRequestLogEntry,
  InternalLimitedLogEntry,
  InternalApiKey,
  InternalInfo,
  InternalMeme,
  InternalUser,
  UserId,
  MemeId,
  UploadId,
  FriendRequestId,
  FriendRequestType,
  PublicMeme,
  PublicUser,
  NewMeme,
  NewUser,
  PatchMeme,
  PatchUser,
  InternalUpload,
  ImgurApiResponse
} from 'types/global';

/**
 * Global (but only per serverless function instance) request counting state
 */
let requestCounter = 0;

const nameRegex = /^[a-zA-Z0-9 -]+$/;
const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const phoneRegex =
  /^(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?$/;
const usernameRegex = /^[a-zA-Z0-9_-]{5,20}$/;
const base64Regex = /^data:([\w/]+);base64,([a-zA-Z0-9+/]+={0,2})$/;

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];

/**
 * The imgur API URL used throughout the API backend
 */
export const IMGUR_API_URI = 'https://api.imgur.com/3/image';

/**
 * This key is guaranteed never to appear in dummy data generated during tests.
 * In production, this key can be used to represent a `null` or non-existent
 * key. This key cannot be used for authenticated HTTP access to the API.
 */
export const NULL_KEY = '00000000-0000-0000-0000-000000000000';

/**
 * This key is used by database initialization and activity simulation scripts.
 * This key cannot be used for authenticated HTTP access to the API in
 * production.
 */
export const MACHINE_KEY = '11111111-1111-1111-1111-111111111111';

/**
 * This key allows authenticated API access only when running in a test
 * environment (i.e. `NODE_ENV=test`). This key cannot be used for authenticated
 * HTTP access to the API in production.
 */
export const DUMMY_KEY = '12349b61-83a7-4036-b060-213784b491';

/**
 * This key is guaranteed to be rate limited when running in a test environment
 * (i.e. `NODE_ENV=test`). This key cannot be used for authenticated HTTP access
 * to the API in production.
 */
export const BANNED_KEY = 'banned-h54e-6rt7-gctfh-hrftdygct0';

/**
 * This key can be used to authenticate with local and non-production
 * deployments. This key cannot be used for authenticated HTTP access to the API
 * in production.
 */
export const DEV_KEY = 'dev-xunn-dev-294a-536h-9751-rydmj';

/**
 * Meme properties that can be matched against with `searchMemes()`.
 */
const matchableStrings = [
  'owner',
  'receiver',
  'createdAt',
  'expiredAt',
  'description',
  'totalLikes',
  'private',
  'replyTo'
]; /* as const */

/**
 * Whitelisted MongoDB sub-matchers that can be used with `searchMemes()`, not
 * including the special "$or" sub-matcher.
 */
const matchableSubStrings = ['$gt', '$lt', '$gte', '$lte'];

const validateUserData = (data: Partial<NewUser | PatchUser>) => {
  if (!isPlainObject(data)) {
    throw new ValidationError('only JSON content is allowed');
  } else if (
    typeof data.name != 'string' ||
    data.name.length < 3 ||
    data.name.length > 30 ||
    !nameRegex.test(data.name)
  ) {
    throw new ValidationError(
      '`name` must be an alphanumeric string between 3 and 30 characters'
    );
  } else if (
    typeof data.email != 'string' ||
    data.email.length < 5 ||
    data.email.length > 50 ||
    !emailRegex.test(data.email)
  ) {
    throw new ValidationError(
      '`email` must be a valid email address between 5 and 50 characters'
    );
  } else if (
    data.phone !== null &&
    (typeof data.phone != 'string' || !phoneRegex.test(data.phone))
  ) {
    throw new ValidationError('`phone` must be a valid phone number or null');
  }

  return true;
};

export const publicMemeProjection = {
  _id: false,
  meme_id: { $toString: '$_id' },
  owner: { $toString: '$owner' },
  receiver: { $toString: '$receiver' },
  createdAt: true,
  expiredAt: true,
  description: true,
  likes: '$totalLikes',
  private: true,
  replyTo: { $toString: '$replyTo' },
  imageUrl: true
};

export const publicUserProjection = {
  _id: false,
  user_id: { $toString: '$_id' },
  name: true,
  email: true,
  phone: true,
  username: true,
  friends: { $size: '$friends' },
  liked: { $size: '$liked' },
  deleted: true,
  imageUrl: true
};

export async function handleImageUpload(
  creatorKey: string,
  imageBase64: string | null | undefined
) {
  let imageUrl: string | null = null;

  if (imageBase64) {
    const [, imageType, imageData] = base64Regex.exec(imageBase64) || [];
    if (imageType && imageData) {
      const db = await getDb();
      const uploadsDb = db.collection<WithId<InternalUpload>>('uploads');
      const imageHash = createHash('sha1').update(imageData).digest('hex');
      const cachedImage = await uploadsDb.findOne({ hash: imageHash });
      const now = Date.now();

      if (cachedImage) {
        imageUrl = cachedImage.uri;
        await uploadsDb.updateOne(
          { _id: cachedImage._id },
          { $set: { lastUsedAt: now } }
        );
      } else if (ALLOWED_IMAGE_TYPES.includes(imageType)) {
        const { IMGUR_ALBUM_HASH, IMGUR_CLIENT_ID } = getEnv();
        const body = new URLSearchParams();
        const uploadId: UploadId = new ObjectId();

        const chapterName =
          creatorKey == MACHINE_KEY
            ? 'ThE mAcHiNe'
            : `the ${await db
                .collection<InternalApiKey>('keys')
                .findOne({ key: creatorKey })
                .then((r) => r?.owner || toss(new InvalidKeyError()))} chapter`;

        body.append('image', imageData);
        body.append('album', IMGUR_ALBUM_HASH);
        body.append('type', 'base64');
        body.append('name', uploadId.toString());
        body.append('title', `Upload ${uploadId}`);
        body.append(
          'description',
          `Created by ${chapterName} at ${new Date(
            now
          ).toString()} using ghostmeme runtime v${pkgVersion}`
        );

        try {
          const res = await fetch(IMGUR_API_URI, {
            method: 'POST',
            headers: {
              authorization: `Client-ID ${IMGUR_CLIENT_ID}`,
              accept: 'application/json'
            },
            body
          });

          const json = (await res.json()) as ImgurApiResponse;

          imageUrl =
            json.data.link ||
            toss(
              new AppError(json?.data?.error || 'could not resolve uploaded image link')
            );
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(
            `image upload failure reason: ${e instanceof Error ? e.message : e}`
          );
          throw new AppError('image upload failed');
        }

        await uploadsDb.insertOne({
          _id: uploadId,
          uri: imageUrl,
          hash: imageHash,
          lastUsedAt: now
        });

        await db
          .collection<InternalInfo>('info')
          .updateOne({}, { $inc: { totalUploads: 1 } });
      } else {
        const allowedTypes = ALLOWED_IMAGE_TYPES.join(', ');
        throw new ValidationError(
          `invalid media type "${imageType}", must be one of: ${allowedTypes}`
        );
      }
    } else {
      throw new ValidationError('invalid base64 data URL; see https://mzl.la/3AasmwQ');
    }
  }

  return imageUrl;
}

export async function getSystemInfo(): Promise<InternalInfo> {
  return (
    (await (await getDb())
      .collection<WithId<InternalInfo>>('info')
      .find()
      .project<InternalInfo>({ _id: false })
      .next()) ?? toss(new GuruMeditationError())
  );
}

export async function createMeme({
  creatorKey,
  data
}: {
  creatorKey: string;
  data: Partial<NewMeme>;
}): Promise<PublicMeme> {
  if (!isPlainObject(data)) {
    throw new ValidationError('only JSON content is allowed');
  } else if (
    data.description !== null &&
    (typeof data.description != 'string' ||
      !data.description.length ||
      data.description.length > 500)
  ) {
    throw new ValidationError(
      '`description` must be a non-zero length string <= 500 characters or null'
    );
  } else if (typeof data.private != 'boolean') {
    throw new ValidationError('`private` must be a boolean');
  } else if (!creatorKey || typeof creatorKey != 'string') {
    throw new InvalidKeyError();
  } else if (data.imageUrl !== null && typeof data.imageUrl != 'string') {
    throw new ValidationError('`imageUrl` must be a string or null');
  } else if (
    data.imageBase64 !== null &&
    (typeof data.imageBase64 != 'string' || !data.imageBase64.length)
  ) {
    throw new ValidationError(
      '`imageBase64` must be a valid base64 string, data uri, or null'
    );
  } else if (data.imageBase64 && data.imageUrl) {
    throw new ValidationError('cannot use `imageUrl` and `imageBase64` at the same time');
  } else if (typeof data.expiredAt != 'number') {
    throw new ValidationError('`expiredAt` must be a number');
  } else if (!data.description && !data.imageUrl && !data.imageBase64) {
    throw new ValidationError('cannot create an empty meme');
  }

  let owner: UserId | undefined = undefined;
  let receiver: UserId | null | undefined = undefined;
  let replyTo: MemeId | null | undefined = undefined;

  if (typeof data.owner == 'string' && data.owner.length) {
    try {
      owner = new ObjectId(data.owner);
    } catch {
      throw new ValidationError('invalid user_id for `owner`');
    }
  } else {
    throw new ValidationError('`owner` property is required');
  }

  if (typeof data.receiver == 'string' && data.receiver.length) {
    try {
      receiver = new ObjectId(data.receiver);
    } catch {
      throw new ValidationError('invalid user_id for `receiver`');
    }
  } else receiver = null;

  if (typeof data.replyTo == 'string' && data.replyTo.length) {
    try {
      replyTo = new ObjectId(data.replyTo);
    } catch {
      throw new ValidationError('invalid meme_id for `replyTo`');
    }
  } else replyTo = null;

  const { description, private: priv, expiredAt, ...rest } = data;

  const db = await getDb();
  const memes = db.collection<InternalMeme>('memes');
  const users = db.collection<InternalUser>('users');

  if (Object.keys(rest).length != 5) {
    throw new ValidationError('unexpected properties encountered');
  } else if (
    !(receiver && priv && !replyTo) &&
    !(!receiver && priv) &&
    !(!receiver && !priv && !replyTo)
  ) {
    throw new ValidationError(
      'illegal receiver-private-replyTo combination (check problem statement)'
    );
  } else if (!(await itemExists(users, owner))) {
    throw new ItemNotFoundError(owner);
  } else if (receiver && !(await itemExists(users, receiver))) {
    throw new ItemNotFoundError(receiver);
  } else if (replyTo && !(await itemExists(memes, replyTo))) {
    throw new ItemNotFoundError(replyTo);
  }

  // * At this point, we can finally trust this data is not malicious
  const newMeme: InternalMeme = {
    owner,
    receiver,
    createdAt: Date.now(),
    expiredAt,
    description,
    likes: [],
    totalLikes: 0,
    private: priv,
    replyTo,
    imageUrl: data.imageUrl || (await handleImageUpload(creatorKey, data.imageBase64)),
    meta: {
      creator: creatorKey,
      likeability: 1 / randomInt(100),
      gregariousness: 1 / randomInt(100)
    }
  };

  await memes.insertOne(newMeme);
  await db.collection<InternalInfo>('info').updateOne({}, { $inc: { totalMemes: 1 } });

  return getMemes({ meme_ids: [(newMeme as WithId<InternalMeme>)._id] }).then(
    (ids) => ids[0]
  );
}

export async function updateMemes({
  meme_ids,
  data
}: {
  meme_ids: MemeId[];
  data: Partial<PatchMeme>;
}): Promise<void> {
  if (!Array.isArray(meme_ids)) {
    throw new InvalidIdError();
  } else if (!isPlainObject(data)) {
    throw new ValidationError('only JSON content is allowed');
  } else if (typeof data.expiredAt != 'number') {
    throw new ValidationError('`expiredAt` must be a number');
  } else if (meme_ids.length > getEnv().RESULTS_PER_PAGE) {
    throw new ValidationError('too many meme_ids specified');
  } else if (!meme_ids.every((id) => id instanceof ObjectId)) {
    throw new InvalidIdError();
  } else if (meme_ids.length) {
    const db = await getDb();
    await db
      .collection<InternalMeme>('memes')
      .updateMany({ _id: { $in: meme_ids } }, { $set: { expiredAt: data.expiredAt } });
  }
}

export async function getMemes({
  meme_ids
}: {
  meme_ids: MemeId[];
}): Promise<PublicMeme[]> {
  if (!Array.isArray(meme_ids)) {
    throw new InvalidIdError();
  } else if (meme_ids.length > getEnv().RESULTS_PER_PAGE) {
    throw new ValidationError('too many meme_ids specified');
  } else if (!meme_ids.every((id) => id instanceof ObjectId)) {
    throw new InvalidIdError();
  } else if (!meme_ids.length) {
    return [];
  } else {
    const memes = await (
      await getDb()
    )
      .collection<InternalMeme>('memes')
      .find({ _id: { $in: meme_ids } })
      .sort({ _id: -1 })
      .limit(getEnv().RESULTS_PER_PAGE)
      .project<PublicMeme>(publicMemeProjection)
      .toArray();

    if (memes.length != meme_ids.length) {
      throw new NotFoundError('some or all meme_ids could not be found');
    } else return memes;
  }
}

export async function getMemeLikesUserIds({
  meme_id,
  after
}: {
  meme_id: MemeId;
  after: UserId | null;
}): Promise<string[]> {
  if (!(meme_id instanceof ObjectId)) {
    throw new InvalidIdError(meme_id);
  } else if (after !== null && !(after instanceof ObjectId)) {
    throw new InvalidIdError(after);
  } else {
    const db = await getDb();
    const memes = db.collection<InternalMeme>('memes');
    const users = db.collection<InternalUser>('users');

    if (!(await itemExists(memes, meme_id))) {
      throw new ItemNotFoundError(meme_id);
    } else if (after && !(await itemExists(users, after))) {
      throw new ItemNotFoundError(after);
    }

    return (
      (await memes
        .find({ _id: meme_id })
        .project<{ likes: UserId[] }>({
          likes: {
            $slice: [
              '$likes',
              after ? { $sum: [{ $indexOfArray: ['$likes', after] }, 1] } : 0,
              getEnv().RESULTS_PER_PAGE
            ]
          }
        })
        .next()
        .then((r) => itemToStringId(r?.likes))) ?? toss(new GuruMeditationError())
    );
  }
}

export async function getUserLikedMemeIds({
  user_id,
  after
}: {
  user_id: UserId;
  after: MemeId | null;
}): Promise<string[]> {
  if (!(user_id instanceof ObjectId)) {
    throw new InvalidIdError(user_id);
  } else if (after !== null && !(after instanceof ObjectId)) {
    throw new InvalidIdError(after);
  } else {
    const db = await getDb();
    const users = db.collection<InternalUser>('users');
    const memes = db.collection<InternalMeme>('memes');

    if (!(await itemExists(users, user_id))) {
      throw new ItemNotFoundError(user_id);
    } else if (after && !(await itemExists(memes, after))) {
      throw new ItemNotFoundError(after);
    }

    return (
      (await users
        .find({ _id: user_id })
        .project<{ likes: MemeId[] }>({
          likes: {
            $slice: [
              '$liked',
              after ? { $sum: [{ $indexOfArray: ['$liked', after] }, 1] } : 0,
              getEnv().RESULTS_PER_PAGE
            ]
          }
        })
        .next()
        .then((r) => itemToStringId(r?.likes))) ?? toss(new GuruMeditationError())
    );
  }
}

export async function isMemeLiked({
  meme_id,
  user_id
}: {
  meme_id: MemeId;
  user_id: UserId;
}): Promise<boolean> {
  if (!(meme_id instanceof ObjectId)) {
    throw new InvalidIdError(meme_id);
  } else if (!(user_id instanceof ObjectId)) {
    throw new InvalidIdError(user_id);
  } else {
    const db = await getDb();
    const memes = db.collection<InternalMeme>('memes');
    const users = db.collection<InternalUser>('users');

    if (!(await itemExists(memes, meme_id))) throw new ItemNotFoundError(meme_id);
    if (!(await itemExists(users, user_id))) throw new ItemNotFoundError(user_id);

    return (
      (await memes
        .find({ _id: meme_id })
        .project<{ liked: boolean }>({
          liked: { $in: [user_id, '$likes'] }
        })
        .next()
        .then((r) => r?.liked)) ?? toss(new GuruMeditationError())
    );
  }
}

export async function removeLikedMeme({
  meme_id,
  user_id
}: {
  meme_id: MemeId;
  user_id: UserId;
}): Promise<void> {
  if (!(meme_id instanceof ObjectId)) {
    throw new InvalidIdError(meme_id);
  } else if (!(user_id instanceof ObjectId)) {
    throw new InvalidIdError(user_id);
  } else {
    const db = await getDb();
    const memes = db.collection<InternalMeme>('memes');
    const users = db.collection<InternalUser>('users');

    if (!(await itemExists(memes, meme_id))) throw new ItemNotFoundError(meme_id);
    if (!(await itemExists(users, user_id))) throw new ItemNotFoundError(user_id);

    await Promise.all([
      users.updateOne({ _id: user_id }, { $pull: { liked: meme_id } }),
      memes.updateOne(
        { _id: meme_id, likes: { $in: [user_id] } },
        { $pull: { likes: user_id }, $inc: { totalLikes: -1 } }
      )
    ]);
  }
}

export async function addLikedMeme({
  meme_id,
  user_id
}: {
  meme_id: MemeId;
  user_id: UserId;
}): Promise<void> {
  if (!(meme_id instanceof ObjectId)) {
    throw new InvalidIdError(meme_id);
  } else if (!(user_id instanceof ObjectId)) {
    throw new InvalidIdError(user_id);
  } else {
    const db = await getDb();
    const memes = db.collection<InternalMeme>('memes');
    const users = db.collection<InternalUser>('users');

    if (!(await itemExists(memes, meme_id))) throw new ItemNotFoundError(meme_id);
    if (!(await itemExists(users, user_id))) throw new ItemNotFoundError(user_id);

    await Promise.all([
      users.updateOne(
        { _id: user_id, liked: { $nin: [meme_id] } },
        { $push: { liked: { $each: [meme_id], $position: 0 } } }
      ),
      memes.updateOne(
        { _id: meme_id, likes: { $nin: [user_id] } },
        { $push: { likes: { $each: [user_id], $position: 0 } }, $inc: { totalLikes: 1 } }
      )
    ]);
  }
}

export async function createUser({
  creatorKey,
  data
}: {
  creatorKey: string;
  data: Partial<NewUser>;
}): Promise<PublicUser> {
  validateUserData(data);

  if (typeof data.username != 'string' || !usernameRegex.test(data.username)) {
    throw new ValidationError(
      '`username` must be an alphanumeric string between 5 and 20 characters'
    );
  } else if (!creatorKey || typeof creatorKey != 'string') {
    throw new InvalidKeyError();
  } else if (
    data.imageBase64 !== null &&
    (typeof data.imageBase64 != 'string' || !data.imageBase64.length)
  ) {
    throw new ValidationError(
      '`imageBase64` must be a valid non-empty base64 string, data uri, or null'
    );
  }

  const { email, name, phone, username, ...rest } = data as NewUser;

  if (Object.keys(rest).length != 1) {
    throw new ValidationError('unexpected properties encountered');
  }

  const db = await getDb();
  const users = db.collection<InternalUser>('users');

  if (await itemExists(users, username, 'username', { caseInsensitive: true })) {
    throw new ValidationError('a user with that username already exists');
  } else if (await itemExists(users, email, 'email', { caseInsensitive: true })) {
    throw new ValidationError('a user with that email address already exists');
  } else if (phone && (await itemExists(users, phone, 'phone'))) {
    throw new ValidationError('a user with that phone number already exists');
  }

  // * At this point, we can finally trust this data is not malicious
  const newUser: InternalUser = {
    name,
    email,
    phone,
    username,
    friends: [],
    imageUrl: await handleImageUpload(creatorKey, data.imageBase64),
    requests: { incoming: [], outgoing: [] },
    liked: [],
    deleted: false,
    meta: {
      creator: creatorKey
    }
  };

  await users.insertOne(newUser);
  await db.collection<InternalInfo>('info').updateOne({}, { $inc: { totalUsers: 1 } });

  return getUser({ user_id: (newUser as WithId<InternalUser>)._id });
}

export async function updateUser({
  creatorKey,
  user_id,
  data
}: {
  creatorKey: string;
  user_id: UserId;
  data: Partial<PatchUser>;
}): Promise<void> {
  validateUserData(data);

  if (!(user_id instanceof ObjectId)) {
    throw new InvalidIdError(user_id);
  } else if (!creatorKey || typeof creatorKey != 'string') {
    throw new InvalidKeyError();
  } else if (
    data.imageBase64 !== null &&
    data.imageBase64 !== undefined &&
    (typeof data.imageBase64 != 'string' || !data.imageBase64.length)
  ) {
    throw new ValidationError(
      '`imageBase64` must be a valid non-empty base64 string, data uri, or null'
    );
  }

  const { email, name, phone, imageBase64, ...rest } = data as PatchUser;

  if (Object.keys(rest).length > 0)
    throw new ValidationError('unexpected properties encountered');

  const db = await getDb();
  const users = db.collection<InternalUser>('users');

  if (
    await itemExists(users, email, 'email', {
      exclude_id: user_id,
      caseInsensitive: true
    })
  ) {
    throw new ValidationError('a user with that email address already exists');
  } else if (
    phone &&
    (await itemExists(users, phone, 'phone', { exclude_id: user_id }))
  ) {
    throw new ValidationError('a user with that phone number already exists');
  }

  // * At this point, we can finally trust this data is not malicious
  const patchUser: Omit<PatchUser, 'imageBase64'> & { imageUrl?: string | null } = {
    name,
    email,
    phone,
    ...(imageBase64 !== undefined
      ? { imageUrl: await handleImageUpload(creatorKey, imageBase64) }
      : {})
  };

  if (!(await itemExists(users, user_id))) throw new ItemNotFoundError(user_id);
  await users.updateOne({ _id: user_id }, { $set: patchUser });
}

export async function deleteUser({ user_id }: { user_id: UserId }): Promise<void> {
  if (!(user_id instanceof ObjectId)) {
    throw new InvalidIdError();
  } else {
    const db = await getDb();
    const users = db.collection<InternalUser>('users');

    if (!(await itemExists(users, user_id))) throw new ItemNotFoundError(user_id);

    const numUpdated = await users
      .updateOne({ _id: user_id, deleted: false }, { $set: { deleted: true } })
      .then((r) => r.matchedCount);

    await db
      .collection<InternalInfo>('info')
      .updateOne({}, { $inc: { totalUsers: -numUpdated } });
  }
}

export async function getAllUsers({
  after
}: {
  after: UserId | null;
}): Promise<PublicUser[]> {
  if (after !== null && !(after instanceof ObjectId)) {
    throw new InvalidIdError(after);
  } else {
    const db = await getDb();
    const users = db.collection<InternalUser>('users');

    if (after && !(await itemExists(users, after))) {
      throw new ItemNotFoundError(after);
    }

    return users
      .find(after ? { _id: { $lt: after } } : {})
      .sort({ _id: -1 })
      .limit(getEnv().RESULTS_PER_PAGE)
      .project<PublicUser>(publicUserProjection)
      .toArray();
  }
}

export async function getUser({
  user_id,
  username
}: {
  user_id?: UserId;
  username?: string;
}): Promise<PublicUser> {
  if (!user_id && !username) {
    throw new ValidationError('must provide either user_id or username');
  } else if (user_id && !(user_id instanceof ObjectId)) {
    throw new InvalidIdError(user_id);
  } else if (typeof username == 'string' && !username) {
    throw new ValidationError('username cannot be empty');
  } else {
    const db = await getDb();
    const users = db.collection<InternalUser>('users');

    return (
      (await users
        .find(user_id ? { _id: user_id } : { username })
        .project<PublicUser>(publicUserProjection)
        .next()) ?? toss(new ItemNotFoundError(user_id || username))
    );
  }
}

export async function getUserFriendsUserIds({
  user_id,
  after
}: {
  user_id: UserId;
  after: UserId | null;
}): Promise<string[]> {
  if (!(user_id instanceof ObjectId)) {
    throw new InvalidIdError(user_id);
  } else if (after !== null && !(after instanceof ObjectId)) {
    throw new InvalidIdError(after);
  } else {
    const db = await getDb();
    const users = db.collection<InternalUser>('users');

    if (!(await itemExists(users, user_id))) {
      throw new ItemNotFoundError(user_id);
    } else if (after && !(await itemExists(users, after))) {
      throw new ItemNotFoundError(after);
    }

    const result = await users
      .find({ _id: user_id })
      .project<{ friends: UserId[] }>({
        friends: {
          $slice: [
            '$friends',
            after ? { $sum: [{ $indexOfArray: ['$friends', after] }, 1] } : 0,
            getEnv().RESULTS_PER_PAGE
          ]
        }
      })
      .next()
      .then((r) => itemToStringId(r?.friends));

    return result ?? toss(new GuruMeditationError());
  }
}

export async function isUserAFriend({
  user_id,
  friend_id
}: {
  user_id: UserId;
  friend_id: UserId;
}): Promise<boolean> {
  if (!(friend_id instanceof ObjectId)) {
    throw new InvalidIdError(friend_id);
  } else if (!(user_id instanceof ObjectId)) {
    throw new InvalidIdError(user_id);
  } else {
    const db = await getDb();
    const users = db.collection<InternalUser>('users');

    if (!(await itemExists(users, friend_id))) throw new ItemNotFoundError(friend_id);
    if (!(await itemExists(users, user_id))) throw new ItemNotFoundError(user_id);

    return (
      (await users
        .find({ _id: user_id })
        .project<{ friend: boolean }>({
          friend: { $in: [friend_id, '$friends'] }
        })
        .next()
        .then((r) => r?.friend)) ?? toss(new GuruMeditationError())
    );
  }
}

export async function removeUserAsFriend({
  user_id,
  friend_id
}: {
  user_id: UserId;
  friend_id: UserId;
}): Promise<void> {
  if (!(friend_id instanceof ObjectId)) {
    throw new InvalidIdError(friend_id);
  } else if (!(user_id instanceof ObjectId)) {
    throw new InvalidIdError(user_id);
  } else {
    const db = await getDb();
    const users = db.collection<InternalUser>('users');

    if (!(await itemExists(users, friend_id))) throw new ItemNotFoundError(friend_id);
    if (!(await itemExists(users, user_id))) throw new ItemNotFoundError(user_id);

    await users.updateOne({ _id: user_id }, { $pull: { friends: friend_id } });
  }
}

export async function addUserAsFriend({
  user_id,
  friend_id
}: {
  user_id: UserId;
  friend_id: UserId;
}): Promise<void> {
  if (!(friend_id instanceof ObjectId)) {
    throw new InvalidIdError(friend_id);
  } else if (!(user_id instanceof ObjectId)) {
    throw new InvalidIdError(user_id);
  } else if (user_id.equals(friend_id)) {
    throw new ValidationError('users cannot friend themselves');
  } else {
    const db = await getDb();
    const users = db.collection<InternalUser>('users');

    if (!(await itemExists(users, friend_id))) throw new ItemNotFoundError(friend_id);
    if (!(await itemExists(users, user_id))) throw new ItemNotFoundError(user_id);

    await users.updateOne(
      { _id: user_id, friends: { $nin: [friend_id] } },
      { $push: { friends: { $each: [friend_id], $position: 0 } } }
    );
  }
}

export async function getFriendRequestsOfType({
  user_id,
  request_type,
  after
}: {
  user_id: UserId;
  request_type: FriendRequestType;
  after: FriendRequestId | null;
}): Promise<string[]> {
  if (!(user_id instanceof ObjectId)) {
    throw new InvalidIdError(user_id);
  } else if (after !== null && !(after instanceof ObjectId)) {
    throw new InvalidIdError(after);
  } else {
    const db = await getDb();
    const users = db.collection<InternalUser>('users');

    if (!(await itemExists(users, user_id))) {
      throw new ItemNotFoundError(user_id);
    } else if (after && !(await itemExists(users, after))) {
      throw new ItemNotFoundError(after);
    }

    return (
      (await users
        .find({ _id: user_id })
        .project<{ requests: FriendRequestId[] }>({
          requests: {
            $slice: [
              `$requests.${request_type}`,
              after
                ? { $sum: [{ $indexOfArray: [`$requests.${request_type}`, after] }, 1] }
                : 0,
              getEnv().RESULTS_PER_PAGE
            ]
          }
        })
        .next()
        .then((r) => itemToStringId(r?.requests))) ?? toss(new GuruMeditationError())
    );
  }
}

export async function isFriendRequestOfType({
  user_id,
  request_type,
  target_id
}: {
  user_id: UserId;
  request_type: FriendRequestType;
  target_id: UserId;
}): Promise<boolean> {
  if (!(target_id instanceof ObjectId)) {
    throw new InvalidIdError(target_id);
  } else if (!(user_id instanceof ObjectId)) {
    throw new InvalidIdError(user_id);
  } else {
    const db = await getDb();
    const users = db.collection<InternalUser>('users');

    if (!(await itemExists(users, target_id))) throw new ItemNotFoundError(target_id);
    if (!(await itemExists(users, user_id))) throw new ItemNotFoundError(user_id);

    return (
      (await users
        .find({ _id: user_id })
        .project<{ request: boolean }>({
          request: { $in: [target_id, `$requests.${request_type}`] }
        })
        .next()
        .then((r) => r?.request)) ?? toss(new GuruMeditationError())
    );
  }
}

export async function removeFriendRequest({
  user_id,
  request_type,
  target_id
}: {
  user_id: UserId;
  request_type: FriendRequestType;
  target_id: UserId;
}): Promise<void> {
  if (!(target_id instanceof ObjectId)) {
    throw new InvalidIdError(target_id);
  } else if (!(user_id instanceof ObjectId)) {
    throw new InvalidIdError(user_id);
  } else {
    const db = await getDb();
    const users = db.collection<InternalUser>('users');

    if (!(await itemExists(users, target_id))) throw new ItemNotFoundError(target_id);
    if (!(await itemExists(users, user_id))) throw new ItemNotFoundError(user_id);

    await users.updateOne(
      { _id: user_id },
      { $pull: { [`requests.${request_type}`]: target_id } }
    );
  }
}

export async function addFriendRequest({
  user_id,
  request_type,
  target_id
}: {
  user_id: UserId;
  request_type: FriendRequestType;
  target_id: UserId;
}): Promise<void> {
  if (!(target_id instanceof ObjectId)) {
    throw new InvalidIdError(target_id);
  } else if (!(user_id instanceof ObjectId)) {
    throw new InvalidIdError(user_id);
  } else if (user_id.equals(target_id)) {
    throw new ValidationError('users cannot send a friend request to themselves');
  } else {
    const db = await getDb();
    const users = db.collection<InternalUser>('users');

    if (!(await itemExists(users, target_id))) throw new ItemNotFoundError(target_id);
    if (!(await itemExists(users, user_id))) throw new ItemNotFoundError(user_id);

    await users.updateOne(
      { _id: user_id, [`requests.${request_type}`]: { $nin: [target_id] } },
      { $push: { [`requests.${request_type}`]: { $each: [target_id], $position: 0 } } }
    );
  }
}

type SubSpecifierObject = { [subspecifier in '$gt' | '$lt' | '$gte' | '$lte']?: number };

export async function searchMemes({
  after,
  match,
  regexMatch
}: {
  after: MemeId | null;
  match: {
    [specifier: string]:
      | string
      | number
      | boolean
      | SubSpecifierObject
      | { $or: SubSpecifierObject[] };
  };
  regexMatch: {
    [specifier: string]: string;
  };
}) {
  // ? Initial validation

  if (after !== null && !(after instanceof ObjectId)) {
    throw new InvalidIdError(after);
  } else if (!isPlainObject(match) || !isPlainObject(regexMatch)) {
    throw new ValidationError('match and regexMatch must be objects');
  } else if (match._id || match.meme_id || match.user_id) {
    throw new ValidationError('match object has illegal id-related specifier');
  } else if (regexMatch._id || regexMatch.meme_id || regexMatch.user_id) {
    throw new ValidationError('regexMatch object has illegal id-related specifier');
  }

  const matchIds: {
    owner?: UserId[];
    receiver?: UserId[];
    replyTo?: MemeId[];
  } = {};

  const split = (str: string) => str.toString().split('|');

  [regexMatch, match].forEach((matchSpec) => {
    // ? Transform all the "or" queries that might appear in the match objects

    if (matchSpec.owner) {
      matchIds.owner = itemToObjectId(split(matchSpec.owner.toString()));
      delete matchSpec.owner;
    }

    if (matchSpec.receiver) {
      matchIds.receiver = itemToObjectId(split(matchSpec.receiver.toString()));
      delete matchSpec.receiver;
    }

    if (matchSpec.replyTo) {
      matchIds.replyTo = itemToObjectId(split(matchSpec.replyTo.toString()));
      delete matchSpec.replyTo;
    }

    // ? Handle aliasing/proxying

    if (matchSpec.likes) {
      matchSpec.totalLikes = matchSpec.likes;
      delete matchSpec.likes;
    }
  });

  // ? Next, we validate everything

  // * Validate id matchers

  if ((matchIds.owner?.length || 0) > getEnv().RESULTS_PER_PAGE) {
    throw new ValidationError(`match object validation failed on "owner": too many ids`);
  }

  if ((matchIds.receiver?.length || 0) > getEnv().RESULTS_PER_PAGE) {
    throw new ValidationError(
      `match object validation failed on "receiver": too many ids`
    );
  }

  if ((matchIds.replyTo?.length || 0) > getEnv().RESULTS_PER_PAGE) {
    throw new ValidationError(
      `match object validation failed on "replyTo": too many ids`
    );
  }

  // * Validate the match object
  for (const [key, val] of Object.entries(match)) {
    const err = (error?: string) => {
      throw new ValidationError(`match object validation failed on "${key}": ${error}`);
    };

    if (!matchableStrings.includes(key)) err('invalid specifier');
    if (Array.isArray(val)) err('value cannot be array');

    if (isPlainObject(val)) {
      let valNotEmpty = false;

      for (const [subkey, subval] of Object.entries(val)) {
        if (subkey == '$or') {
          if (!Array.isArray(subval)) {
            err('invalid $or sub-specifier: value must be array');
          } else if (subval.length != 2) {
            err('invalid $or sub-specifier: must be exactly two elements in array');
          } else if (
            subval.every((sv, ndx) => {
              const errText = `invalid $or sub-specifier at index ${ndx}`;

              if (!isPlainObject(sv)) {
                err(`${errText}: all array elements must be objects`);
              }

              const entries = Object.entries(sv);

              if (!entries.length) return false;
              if (entries.length != 1) {
                err(`${errText}: only one sub-specifier allowed per array element`);
              }

              entries.forEach(([k, v]) => {
                if (!matchableSubStrings.includes(k)) {
                  err(`${errText}: invalid sub-specifier "${k}"`);
                } else if (typeof v != 'number') {
                  err(`${errText}: "${k}" has invalid sub-value type (must be a number)`);
                }
              });
              return true;
            })
          ) {
            valNotEmpty = true;
          }
        } else {
          valNotEmpty = true;
          if (!matchableSubStrings.includes(subkey)) {
            err(`invalid sub-specifier "${subkey}"`);
          } else if (typeof subval != 'number') {
            err(`"${subkey}" has invalid sub-value type (must be a number)`);
          }
        }
      }

      if (!valNotEmpty) err('invalid value type encountered: no empty objects allowed');
    } else if (val !== null && !['number', 'string', 'boolean'].includes(typeof val)) {
      err('invalid value type; must be number, string, or boolean');
    }
  }

  // * Validate the regexMatch object
  for (const [key, val] of Object.entries(regexMatch)) {
    const err = (error?: string) => {
      throw new ValidationError(
        `regexMatch object validation failed on "${key}": ${error}`
      );
    };

    if (!matchableStrings.includes(key)) err('invalid specifier');
    if (!val || typeof val != 'string') {
      err('invalid value type; must be non-empty (regex) string');
    }
  }

  // ? Finally, we construct the pristine params objects and perform the search

  const finalRegexMatch = {} as Record<string, unknown>;

  Object.entries(regexMatch).forEach(([k, v]) => {
    finalRegexMatch[k] = { $regex: v, $options: 'i' };
  });

  const orMatcher: { [key: string]: SubSpecifierObject }[] = [];

  Object.entries(match).forEach(([k, v]) => {
    if (isPlainObject(v)) {
      const obj = v as { $or?: unknown };

      if (obj.$or) {
        (obj.$or as SubSpecifierObject[]).forEach((operand) =>
          orMatcher.push({
            [k]: operand
          })
        );
        delete obj.$or;
      }

      if (obj && !Object.keys(obj).length) delete match[k];
    }
  });

  const primaryMatchStage = {
    $match: {
      ...(after ? { _id: { $lt: after } } : {}),
      ...match,
      ...(orMatcher.length ? { $or: orMatcher } : {}),
      ...finalRegexMatch
    }
  };

  const aggregation = [
    ...(Object.keys(primaryMatchStage).length ? [primaryMatchStage] : []),
    ...Object.entries(matchIds).map(([k, v]) => ({ $match: { [k]: { $in: v } } })),
    { $sort: { _id: -1 } },
    { $limit: getEnv().RESULTS_PER_PAGE },
    { $project: publicMemeProjection }
  ];

  return (await getDb())
    .collection<InternalMeme>('memes')
    .aggregate<PublicMeme>(aggregation)
    .toArray();
}

export async function isKeyAuthentic(key: string) {
  if (!key || typeof key != 'string') throw new InvalidKeyError();

  return (await getDb())
    .collection<InternalApiKey>('keys')
    .findOne({ key })
    .then((r) => !!r);
}

export async function isRateLimited(req: NextApiRequest) {
  const ip = getClientIp(req);
  const key = req.headers?.key?.toString() || null;

  const limited = await (
    await getDb()
  )
    .collection<InternalLimitedLogEntry>('limited-log-mview')
    .find({
      $or: [...(ip ? [{ ip }] : []), ...(key ? [{ key }] : [])],
      until: { $gt: Date.now() } // ? Skip the recently unbanned
    })
    .sort({ until: -1 })
    .limit(1)
    .next();

  return {
    limited: !!limited,
    retryAfter: Math.max(0, (limited?.until || Date.now()) - Date.now())
  };
}

/**
 * Note that this is a per-serverless-function request counter and not global
 * across all Vercel virtual machines.
 */
export function isDueForContrivedError() {
  const reqPerErr = getEnv().REQUESTS_PER_CONTRIVED_ERROR;

  if (reqPerErr && ++requestCounter >= reqPerErr) {
    requestCounter = 0;
    return true;
  }

  return false;
}

/**
 * Note that this async function does not have to be awaited. It's fire and
 * forget!
 */
export async function addToRequestLog({ req, res }: NextApiState) {
  await (await getDb()).collection<InternalRequestLogEntry>('request-log').insertOne({
    ip: getClientIp(req),
    key: req.headers?.key?.toString() || null,
    method: req.method || null,
    route: req.url?.replace(/^\/api\//, '') || null,
    resStatusCode: res.statusCode,
    time: Date.now()
  });
}

export async function getApiKeys() {
  return (await getDb())
    .collection('keys')
    .find()
    .sort({ _id: 1 })
    .project<InternalApiKey>({
      _id: false
    })
    .toArray()
    .then((a) =>
      a.map((apiKey) => ({
        ...apiKey,
        key: createHash('sha256').update(apiKey.key).digest('hex')
      }))
    );
}
