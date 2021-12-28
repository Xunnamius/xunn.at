import { ObjectId } from 'mongodb';
import cloneDeep from 'clone-deep';

import {
  BANNED_BEARER_TOKEN,
  DUMMY_BEARER_TOKEN,
  DEV_BEARER_TOKEN
} from 'multiverse/next-auth';

import type { DummyData } from 'multiverse/mongo-test';
import type { WithId } from 'mongodb';
import type { InternalLinkMapEntry } from 'universe/backend/db';
import type { InternalAuthEntry } from 'multiverse/next-auth';
import type { InternalRequestLogEntry } from 'multiverse/next-log';
import type { InternalLimitedLogEntry } from 'multiverse/next-limit';

// ! This module MUST export a `getDummyData` fn with return type `DummyData` !

// ? Ensures consistent results by reusing the same epoch moment across all test
// ? data.
const now = Date.now();

/**
 * Returns data used to hydrate databases and their collections.
 */
export function getDummyData(): DummyData {
  return cloneDeep({
    'global-api--system': dummySystemData,
    'global-api--xunn-at': dummyLinkData
  });
}

/**
 * The shape of the primary global database test data.
 */
export type DummySystemData = {
  _generatedAt: number;
  tokens: WithId<InternalAuthEntry>[];
  'request-log': WithId<InternalRequestLogEntry>[];
  'limited-log-mview': WithId<InternalLimitedLogEntry>[];
};

/**
 * The shape of the link map database test data.
 */
export type DummyLinkData = {
  _generatedAt: number;
  'link-map': WithId<InternalLinkMapEntry>[];
};

/**
 * Test data for the primary global database.
 */
export const dummySystemData: DummySystemData = {
  _generatedAt: now,
  tokens: [
    {
      _id: new ObjectId(),
      owner: { name: 'local developer' },
      scheme: 'bearer',
      token: { bearer: DEV_BEARER_TOKEN }
    },
    {
      _id: new ObjectId(),
      owner: { name: 'dummy owner' },
      scheme: 'bearer',
      token: { bearer: DUMMY_BEARER_TOKEN }
    },
    {
      _id: new ObjectId(),
      owner: { name: 'banned dummy owner' },
      scheme: 'bearer',
      token: { bearer: BANNED_BEARER_TOKEN }
    }
  ],
  'request-log': [...Array(22)].map((_, ndx) => ({
    _id: new ObjectId(),
    ip: '1.2.3.4',
    header: ndx % 2 ? null : `Bearer ${BANNED_BEARER_TOKEN}`,
    method: ndx % 3 ? 'GET' : 'POST',
    route: 'fake/route',
    createdAt: now + 10 ** 6,
    resStatusCode: 200
  })),
  'limited-log-mview': [
    { _id: new ObjectId(), ip: '1.2.3.4', until: now + 1000 * 60 * 15 },
    { _id: new ObjectId(), ip: '5.6.7.8', until: now + 1000 * 60 * 15 },
    {
      _id: new ObjectId(),
      header: `Bearer ${BANNED_BEARER_TOKEN}`,
      until: now + 1000 * 60 * 60
    }
  ]
};

/**
 * Test data for the link map database.
 */
export const dummyLinkData: DummyLinkData = {
  _generatedAt: now,
  'link-map': [
    {
      _id: new ObjectId(),
      type: 'uri',
      shortId: 'aaa',
      createdAt: now,
      realLink: 'https://fake1.fake1',
      headers: 'header-1'
    },
    {
      _id: new ObjectId(),
      type: 'file',
      shortId: 'bbb',
      createdAt: now,
      name: 'file-b.xml',
      resourceLink: 'https://fake2.fake2',
      headers: ['header-2', { 'header-3': 'header-3-value' }]
    },
    {
      _id: new ObjectId(),
      type: 'badge',
      shortId: 'ccc',
      createdAt: now,
      color: 'yellow',
      label: 'label-1',
      labelColor: 'black',
      message: 'message-1',
      headers: { 'header-4': 'header-4-value' }
    },
    {
      _id: new ObjectId(),
      type: 'badge',
      shortId: 'zzz',
      createdAt: now + 12345,
      color: 'green',
      label: 'label-2',
      labelColor: 'white',
      message: 'message-2'
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
