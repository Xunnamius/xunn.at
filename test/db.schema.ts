import { ObjectId } from 'mongodb';
import { BANNED_TOKEN, DUMMY_TOKEN, DEV_TOKEN } from 'universe/backend';
import cloneDeep from 'clone-deep';

import type { DummyData } from 'testverse/db';
import type { WithId } from 'mongodb';

import type {
  InternalApiCredential,
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
  tokens: WithId<InternalApiCredential>[];
  'request-log': WithId<InternalRequestLogEntry>[];
  'limited-log-mview': WithId<InternalLimitedLogEntry>[];
};

export type DummyLinkData = {
  generatedAt: number;
  'link-map': WithId<InternalLinkMapEntry>[];
};

export const dummySystemData: DummySystemData = {
  generatedAt: now,
  tokens: [
    {
      _id: new ObjectId(),
      owner: 'local developer',
      scheme: 'bearer',
      token: DEV_TOKEN
    },
    {
      _id: new ObjectId(),
      owner: 'dummy owner',
      scheme: 'bearer',
      token: DUMMY_TOKEN
    },
    {
      _id: new ObjectId(),
      owner: 'banned dummy owner',
      scheme: 'bearer',
      token: BANNED_TOKEN
    }
  ],
  'request-log': [...Array(22)].map((_, ndx) => ({
    _id: new ObjectId(),
    ip: '1.2.3.4',
    token: ndx % 2 ? null : BANNED_TOKEN,
    method: ndx % 3 ? 'GET' : 'POST',
    route: 'fake/route',
    time: now + 10 ** 6,
    resStatusCode: 200
  })),
  'limited-log-mview': [
    { _id: new ObjectId(), ip: '1.2.3.4', until: now + 1000 * 60 * 15 },
    { _id: new ObjectId(), ip: '5.6.7.8', until: now + 1000 * 60 * 15 },
    { _id: new ObjectId(), token: BANNED_TOKEN, until: now + 1000 * 60 * 60 }
  ]
};

export const dummyLinkData: DummyLinkData = {
  generatedAt: now,
  'link-map': [
    {
      _id: new ObjectId(),
      type: 'uri',
      shortId: 'aaa',
      createdAt: now,
      realLink: 'https://fake1.fake1'
    },
    {
      _id: new ObjectId(),
      type: 'file',
      shortId: 'bbb',
      createdAt: now,
      name: 'file-b',
      resourceLink: 'https://fake2.fake2'
    },
    {
      _id: new ObjectId(),
      type: 'media',
      shortId: 'ccc',
      createdAt: now,
      name: 'file-c',
      resourceLink: 'https://fake3.fake3'
    },
    {
      _id: new ObjectId(),
      type: 'github-pkg',
      shortId: 'ddd',
      createdAt: now,
      defaultCommit: 'commit',
      owner: 'owner',
      repo: 'repo',
      subdir: null,
      tagPrefix: 'prefix-'
    },
    {
      _id: new ObjectId(),
      type: 'github-pkg',
      shortId: 'eee',
      createdAt: now,
      defaultCommit: 'commit',
      owner: 'owner',
      repo: 'repo',
      subdir: 'subdir',
      tagPrefix: 'prefix-'
    },
    {
      _id: new ObjectId(),
      type: 'github-pkg',
      shortId: 'fff',
      createdAt: now,
      defaultCommit: 'commit-2',
      owner: 'owner-2',
      repo: 'repo-2',
      subdir: 'sub/d/i/r',
      tagPrefix: 'prefix-'
    }
  ]
};
