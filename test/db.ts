import { ObjectId } from 'mongodb';
import { getCommonDummyData, generatedAt } from 'multiverse/mongo-common';

import type { DummyData } from 'multiverse/mongo-test';
import type { WithId } from 'mongodb';
import type {
  InternalLinkMapEntry,
  InternalPkgCompatFlagEntry
} from 'universe/backend/db';

/**
 * Returns data used to hydrate databases and their collections.
 */
export function getDummyData(): DummyData {
  return getCommonDummyData({ 'xunn-at': dummyAppData, 'pkg-compat': dummyCompatData });
}

/**
 * The shape of the application database(s)' test data.
 */
export type DummyAppData = {
  _generatedAt: number;
  'link-map': WithId<InternalLinkMapEntry>[];
};

/**
 * The shape of the compat database's test data.
 */
export type DummyCompatData = {
  _generatedAt: number;
  flags: WithId<InternalPkgCompatFlagEntry>[];
};

/**
 * Test data for the application database(s).
 */
export const dummyAppData: DummyAppData = {
  _generatedAt: generatedAt,
  // ! In unit-index.test.ts, order matters, so only append!
  'link-map': [
    {
      _id: new ObjectId(),
      type: 'uri',
      shortId: 'aaa',
      createdAt: generatedAt,
      realLink: 'https://fake1.fake1',
      headers: { 'header-1': 'header-1-value' }
    },
    {
      _id: new ObjectId(),
      type: 'file',
      shortId: 'bbb',
      createdAt: generatedAt,
      name: 'file-b.xml',
      resourceLink: 'https://fake2.fake2',
      headers: { 'header-2': 'header-2-value', 'header-3': 'header-3-value' }
    },
    {
      _id: new ObjectId(),
      type: 'badge',
      shortId: 'ccc',
      createdAt: generatedAt,
      color: 'yellow',
      label: 'label-1',
      labelColor: 'black',
      message: 'message-1',
      headers: { 'header-4': 'header-4-value' }
    },
    {
      _id: new ObjectId(),
      type: 'github-pkg',
      shortId: 'ddd',
      createdAt: generatedAt,
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
      createdAt: generatedAt,
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
      createdAt: generatedAt,
      defaultCommit: 'commit-2',
      owner: 'owner-2',
      repo: 'repo-2',
      subdir: 'sub/d/i/r',
      tagPrefix: 'prefix-'
    },
    {
      _id: new ObjectId(),
      type: 'badge',
      shortId: 'zzz',
      createdAt: generatedAt + 12345,
      color: 'green',
      label: 'label-2',
      labelColor: 'white',
      message: 'message-2'
    }
  ]
};

/**
 * Test data for the compat database.
 */
export const dummyCompatData: DummyCompatData = {
  _generatedAt: generatedAt,
  flags: [
    { _id: new ObjectId(), name: 'ntarh-next', value: '5.7.9' },
    { _id: new ObjectId(), name: 'fake-flag', value: 5 }
  ]
};
