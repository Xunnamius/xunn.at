import { ObjectId } from 'mongodb';
import { BANNED_KEY, DUMMY_KEY, DEV_KEY } from 'universe/backend';
import cloneDeep from 'clone-deep';

import type { DummyData } from 'testverse/db';
import type { WithId } from 'mongodb';
import type {
  InternalApiKey,
  InternalRequestLogEntry,
  InternalLimitedLogEntry,
  InternalLinkMapEntry
} from 'types/global';

// ! This module MUST export a `getDummyData` fn with return type `DummyData` !

/**
 * Returns data used to hydrate databases and their collections.
 */
export function getDummyData(): DummyData {
  return cloneDeep({
    'global-api--system': dummySystemData,
    'global-api--xunn-at': dummyLinkData
  });
}

const now = Date.now();

export type DummySystemData = {
  generatedAt: number;
  keys: WithId<InternalApiKey>[];
  'request-log': WithId<InternalRequestLogEntry>[];
  'limited-log-mview': WithId<InternalLimitedLogEntry>[];
};

export type DummyLinkData = {
  generatedAt: number;
  'link-map': WithId<InternalLinkMapEntry>[];
};

export const dummySystemData: DummySystemData = {
  generatedAt: now,
  keys: [
    {
      _id: new ObjectId(),
      owner: 'local developer',
      key: DEV_KEY
    },
    {
      _id: new ObjectId(),
      owner: 'dummy owner',
      key: DUMMY_KEY
    },
    {
      _id: new ObjectId(),
      owner: 'banned dummy owner',
      key: BANNED_KEY
    }
  ],
  'request-log': [...Array(22)].map((_, ndx) => ({
    _id: new ObjectId(),
    ip: '1.2.3.4',
    key: ndx % 2 ? null : BANNED_KEY,
    method: ndx % 3 ? 'GET' : 'POST',
    route: 'fake/route',
    time: now + 10 ** 6,
    resStatusCode: 200
  })),
  'limited-log-mview': [
    { _id: new ObjectId(), ip: '1.2.3.4', until: now + 1000 * 60 * 15 },
    { _id: new ObjectId(), ip: '5.6.7.8', until: now + 1000 * 60 * 15 },
    { _id: new ObjectId(), key: BANNED_KEY, until: now + 1000 * 60 * 60 }
  ]
};

export const dummyLinkData: DummyLinkData = {
  generatedAt: now,
  'link-map': [
    {
      _id: new ObjectId(),
      type: 'uri',
      shortLink: 'aaa',
      createdAt: now,
      realLink: 'https://fake1.fake1'
    },
    {
      _id: new ObjectId(),
      type: 'file',
      shortLink: 'bbb',
      createdAt: now,
      name: 'file-b',
      resourceLink: 'https://fake2.fake2'
    },
    {
      _id: new ObjectId(),
      type: 'media',
      shortLink: 'ccc',
      createdAt: now,
      name: 'file-c',
      resourceLink: 'https://fake3.fake3'
    },
    {
      _id: new ObjectId(),
      type: 'github-pkg',
      shortLink: 'ddd',
      createdAt: now,
      commit: 'commit',
      owner: 'owner',
      repo: 'repo',
      subdir: null
    },
    {
      _id: new ObjectId(),
      type: 'github-pkg',
      shortLink: 'eee',
      createdAt: now,
      commit: 'commit',
      owner: 'owner',
      repo: 'repo',
      subdir: 'subdir'
    },
    {
      _id: new ObjectId(),
      type: 'github-pkg',
      shortLink: 'fff',
      createdAt: now,
      commit: 'commit-2',
      owner: 'owner-2',
      repo: 'repo-2',
      subdir: 'sub/d/i/r'
    }
  ]
};
