import { MongoClient, ObjectId } from 'mongodb';
import { DUMMY_KEY, BANNED_KEY, DEV_KEY } from 'universe/backend';
import { randomInt } from 'crypto';
import { usernames as Usernames, memes as Memes } from '../data/corpus.json';
import { getEnv } from 'universe/backend/env';
import { GuruMeditationError } from 'universe/backend/error';
import { MongoMemoryServer } from 'mongodb-memory-server';
import cloneDeep from 'clone-deep';

import {
  getDb,
  setClientAndDb,
  destroyDb,
  initializeDb,
  getDbClient
} from 'universe/backend/db';

import type { Db, WithId } from 'mongodb';

import type {
  InternalApiKey,
  InternalRequestLogEntry,
  InternalLimitedLogEntry,
  InternalMeme,
  InternalUser,
  InternalInfo,
  InternalUpload
} from 'types/global';

import { toss } from 'toss-expression';

/**
 * Number of fake users to create (also determines # of memes)
 */
const DUMMY_USER_COUNT = 10;

export type DummyDbData = {
  /**
   * Timestamp of when this dummy data was generated (in ms since unix epoch).
   */
  generatedAt: number;
  keys: WithId<InternalApiKey>[];
  memes: WithId<InternalMeme>[];
  users: WithId<InternalUser>[];
  uploads: WithId<InternalUpload>[];
  info: WithId<InternalInfo>;
  logs: WithId<InternalRequestLogEntry>[];
  bans: WithId<InternalLimitedLogEntry>[];
};

// ? Expand the 100 corpus memes into something bigger
const memes = Array.from({ length: Math.ceil(DUMMY_USER_COUNT / 10) })
  .map((_, ndx) => (ndx % 2 == 0 ? Memes.slice() : Memes.slice().reverse()))
  .flat();

const now = Date.now();

export const dummyDbData: DummyDbData = {
  generatedAt: now,
  keys: [
    {
      _id: new ObjectId(),
      owner: 'local developer',
      key: DEV_KEY
    },
    {
      _id: new ObjectId(),
      owner: 'dummy chapter',
      key: DUMMY_KEY
    },
    {
      _id: new ObjectId(),
      owner: 'banned dummy chapter',
      key: BANNED_KEY
    }
  ],
  memes: [],
  users: Array.from({ length: DUMMY_USER_COUNT }).map<WithId<InternalUser>>((_, ndx) => ({
    _id: new ObjectId(),
    name: `Fake${ndx} User${ndx}`,
    email: `${ndx}-user-email@site.com`,
    phone: `555-555-555${ndx}`,
    username:
      ndx < Usernames.length
        ? Usernames[ndx]
        : toss(new GuruMeditationError('ran out of usernames')),
    friends: [],
    requests: {
      incoming: [],
      outgoing: []
    },
    liked: [],
    deleted: false,
    imageUrl: null,
    meta: { creator: DUMMY_KEY }
  })),
  uploads: [
    {
      _id: new ObjectId(),
      uri: 'https://uri1',
      hash: 'hash-1',
      lastUsedAt: now - 1000
    },
    {
      _id: new ObjectId(),
      uri: 'https://uri2',
      hash: 'hash-2',
      lastUsedAt: now
    },
    {
      _id: new ObjectId(),
      uri: 'https://uri3',
      hash: 'hash-3',
      lastUsedAt: now + 1000
    }
  ],
  info: {
    _id: new ObjectId(),
    totalMemes: memes.length,
    totalUsers: DUMMY_USER_COUNT,
    totalUploads: 3
  },
  logs: [...Array(22)].map((_, ndx) => ({
    _id: new ObjectId(),
    ip: '1.2.3.4',
    key: ndx % 2 ? null : BANNED_KEY,
    method: ndx % 3 ? 'GET' : 'POST',
    route: 'fake/route',
    time: now + 10 ** 6,
    resStatusCode: 200
  })),
  bans: [
    { _id: new ObjectId(), ip: '1.2.3.4', until: now + 1000 * 60 * 15 },
    { _id: new ObjectId(), ip: '5.6.7.8', until: now + 1000 * 60 * 15 },
    { _id: new ObjectId(), key: BANNED_KEY, until: now + 1000 * 60 * 60 }
  ]
};

let lastRandomMoment = Math.floor(now / randomInt(10000000));

// ? Monotonically increasing moments occurring after one another but not
// ? bunching up at the end
const getRandomMoment = () =>
  (lastRandomMoment += Math.floor(randomInt(now - lastRandomMoment) / 2));

const unique = <T>(...args: T[]) => Array.from(new Set(args.flat()));

// * Generate friendships
dummyDbData.users
  .slice(0, Math.trunc(dummyDbData.users.length / 2))
  .forEach((user, ndx) => {
    const newFriends = dummyDbData.users.slice(
      ndx + 1,
      ndx % 2 == 0 ? dummyDbData.users.length : Math.trunc(dummyDbData.users.length / 2)
    );

    user.friends = unique(
      newFriends.map((internal) => internal._id),
      user.friends
    );

    newFriends.forEach((friend) => {
      friend.friends = unique([user._id], friend.friends);
    });
  });

// * Generate memes
dummyDbData.memes = memes.map(({ url: imageUrl }, ndx) => ({
  _id: new ObjectId(),
  owner: dummyDbData.users[ndx % DUMMY_USER_COUNT]._id,
  receiver:
    (ndx + 1) % 4 == 0
      ? dummyDbData.users[(ndx + (ndx % 5 == 0 ? 3 : 1)) % DUMMY_USER_COUNT]._id
      : null,
  description:
    ndx % 2 == 0
      ? `meme ${ndx} with` +
        (ndx % 4 == 0 ? ' #hashtags #and ' : ' ') +
        'witty meme description' +
        ((ndx + 4) % 6 == 0
          ? ` mentioning @${
              dummyDbData.users[(ndx + 2) % DUMMY_USER_COUNT].username
            } the user!`
          : '.')
      : null,
  createdAt: getRandomMoment(),
  expiredAt: ndx % 3 == 0 ? -1 : now + (ndx % 2 == 0 ? randomInt(10 ** 6) : now),
  likes: [],
  totalLikes: (ndx + 3) % 10 == 0 ? DUMMY_USER_COUNT : 0,
  private: true,
  replyTo: null,
  imageUrl: ndx % 2 == 0 && ndx % 5 == 0 ? null : imageUrl,
  meta: {
    creator: DUMMY_KEY,
    gregariousness: (ndx % 2 == 0 ? 0 : 0.75) + 0.25 * Math.random(),
    likeability: (ndx % 3 == 0 ? 0.75 : 0) + 0.25 * Math.random()
  }
}));

// * Determine story view replies between friends
dummyDbData.memes.forEach((meme, ndx) => {
  // ! XXX: skipping the first one (ndx == 0)
  if (ndx && (ndx + 2) % 4 == 0 && !meme.receiver) {
    const owner =
      dummyDbData.users.find((user) => user._id.equals(meme.owner)) ||
      toss(new GuruMeditationError('failed to find owner by user_id'));

    const ownerFriend = dummyDbData.users.find((user) =>
      user._id.equals(owner.friends[ndx % owner.friends.length])
    );

    if (ownerFriend) {
      const ownerFriendFirstMemeId =
        dummyDbData.memes.find((meme) => meme.owner.equals(ownerFriend._id)) ||
        toss(new GuruMeditationError('failed to find friend first meme'));
      meme.replyTo = ownerFriendFirstMemeId._id;
    }
  }
});

// * Generate likes between friends
dummyDbData.users.forEach((user, userIndex) => {
  dummyDbData.memes
    .filter((meme) => !!user.friends.find((m) => m.equals(meme.owner)))
    .forEach((meme, memeIndex) => {
      // ? Like a good chunk of each friends' memes
      if (userIndex % 2 == 0 || memeIndex % 2 == 0) {
        user.liked.push(meme._id);
        meme.likes.push(user._id);
        meme.totalLikes += 1;
      }
    });
});

export async function hydrateDb(db: Db, data: DummyDbData) {
  const newData = cloneDeep(data);

  await Promise.all([
    ...[newData.info ? db.collection('info').insertMany([newData.info]) : null],

    ...[newData.keys.length ? db.collection('keys').insertMany(newData.keys) : null],
    ...[newData.users.length ? db.collection('users').insertMany(newData.users) : null],
    ...[newData.memes.length ? db.collection('memes').insertMany(newData.memes) : null],
    ...[
      newData.uploads.length ? db.collection('uploads').insertMany(newData.uploads) : null
    ],
    ...[newData.logs ? db.collection('request-log').insertMany(newData.logs) : null],
    ...[newData.bans ? db.collection('limited-log-mview').insertMany(newData.bans) : null]
  ]);

  return newData;
}

/**
 * Setup a test version of the database using jest lifecycle hooks.
 *
 * @param defer If `true`, `beforeEach` and `afterEach` lifecycle hooks are
 * skipped and the database is initialized and hydrated once before all tests
 * are run. **In this mode, all tests will share the same database state!**
 */
export function setupTestDb(defer = false) {
  const port = (getEnv().DEBUG_INSPECTING && getEnv().MONGODB_MS_PORT) || undefined;

  // * The in-memory server is not started until it's needed later on
  const server = new MongoMemoryServer({
    instance: {
      port,
      // ? Latest mongo versions error without this line
      args: ['--enableMajorityReadConcern=0']
    }
  });

  let uri: string;

  /**
   * Similar to getDb except it creates a new MongoClient connection before
   * selecting and returning the database.
   */
  const getNewClientAndDb = async () => {
    await server.ensureInstance();
    uri = uri ?? (await server.getUri('test')); // ? Ensure singleton
    const client = await MongoClient.connect(uri);
    const db = client.db();

    if (!db) throw new GuruMeditationError('unable to connect to database');

    return { client, db };
  };

  const initializeAndHydrate = async () => {
    const db = await getDb();
    await initializeDb(db);
    await hydrateDb(db, dummyDbData);
  };

  beforeAll(async () => {
    setClientAndDb(await getNewClientAndDb());
    if (defer) await initializeAndHydrate();
  });

  if (!defer) {
    beforeEach(initializeAndHydrate);
    afterEach(async () => {
      const db = await getDb();
      await destroyDb(db);
    });
  }

  afterAll(async () => {
    await (await getDbClient()).close(true);
    await server.stop();
  });

  return {
    getDb,
    getDbClient,
    getNewClientAndDb
  };
}
