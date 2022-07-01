import { ObjectId } from 'mongodb';
import { getCommonDummyData, mockDateNowMs } from 'multiverse/mongo-common';

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
  return getCommonDummyData({
    'xunn-at': dummyAppData,
    'pkg-compat': dummyCompatData
  });
}

/**
 * The shape of the application database's test data.
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
 * Test data for the application database.
 */
export const dummyAppData: DummyAppData = {
  _generatedAt: mockDateNowMs,
  // ! In unit-index.test.ts and integration tests order matters, so APPEND ONLY
  'link-map': [
    {
      _id: new ObjectId(),
      type: 'uri',
      shortId: 'aaa',
      createdAt: mockDateNowMs,
      realLink: 'https://fake1.fake1',
      headers: { 'header-1': 'header-1-value' }
    },
    {
      _id: new ObjectId(),
      type: 'file',
      shortId: 'bbb',
      createdAt: mockDateNowMs,
      name: 'file-b.xml',
      resourceLink: 'https://fake2.fake2',
      headers: { 'header-2': 'header-2-value', 'header-3': 'header-3-value' }
    },
    {
      _id: new ObjectId(),
      type: 'badge',
      shortId: 'ccc',
      createdAt: mockDateNowMs,
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
      createdAt: mockDateNowMs,
      defaultCommit: 'commit',
      owner: 'owner',
      repo: 'repo',
      subdir: null,
      tagPrefix: 'prefix-',
      headers: { 'header-5': 'header-5-value' }
    },
    {
      _id: new ObjectId(),
      type: 'github-pkg',
      shortId: 'eee',
      createdAt: mockDateNowMs,
      defaultCommit: 'commit',
      owner: 'ownr',
      repo: 'rpo',
      subdir: 'subdir/does/not/exist',
      tagPrefix: 'pre-',
      headers: { 'header-6': 'header-6-value' }
    },
    {
      _id: new ObjectId(),
      type: 'github-pkg',
      shortId: 'fff',
      createdAt: mockDateNowMs,
      defaultCommit: 'commit-2',
      owner: 'owner-2',
      repo: 'repo-2',
      subdir: 'packages/pkg-1',
      tagPrefix: 'fix-',
      headers: { 'header-7': 'header-7-value', 'header-8': 'header-8-value' }
    },
    {
      _id: new ObjectId(),
      type: 'badge',
      shortId: 'zzz',
      createdAt: mockDateNowMs + 12345,
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
  _generatedAt: mockDateNowMs,
  flags: [
    { _id: new ObjectId(), name: 'ntarh-next', value: '5.7.9' },
    { _id: new ObjectId(), name: 'fake-flag', value: 5 }
  ]
};
