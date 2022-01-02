import cloneDeep from 'clone-deep';
import { ObjectId } from 'mongodb';

import {
  BANNED_BEARER_TOKEN,
  DEV_BEARER_TOKEN,
  DUMMY_BEARER_TOKEN
} from 'multiverse/next-auth';

import type { WithId } from 'mongodb';
import type { DbSchema } from 'multiverse/mongo-schema';
import type { DummyData } from 'multiverse/mongo-test';
import type { InternalAuthEntry } from 'multiverse/next-auth';
import type { InternalLimitedLogEntry } from 'multiverse/next-limit';
import type { InternalRequestLogEntry } from 'multiverse/next-log';

export const generatedAt = Date.now();

/**
 * Sets up a Jest spy on the `Date` object's `now` method such that it returns
 * `generatedAt` rather than the actual date. If you want to restore the mock,
 * you will have to do so manually (or use Jest configuration to do so
 * automatically).
 *
 * This is useful when testing against/playing with dummy data containing values
 * derived from the current time (i.e. unix epoch).
 */
export function useMockDateNow() {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockImplementation(() => generatedAt);
  });
}

/**
 * A JSON representation of the backend Mongo database structure. This is used
 * for common consistent "well-known" db structure across projects.
 */
export function getCommonSchemaConfig(additionalSchemaConfig?: DbSchema): DbSchema {
  return {
    databases: {
      root: {
        collections: [
          {
            name: 'auth',
            indices: [{ spec: 'token.bearer', options: { unique: true } }]
          },
          {
            name: 'request-log',
            indices: [{ spec: 'header' }, { spec: 'ip' }]
          },
          {
            name: 'limited-log',
            indices: [{ spec: 'header' }, { spec: 'ip' }]
          }
        ]
      },
      ...additionalSchemaConfig?.databases
    },
    aliases: { ...additionalSchemaConfig?.aliases }
  };
}

/**
 * Returns data used to hydrate well-known databases and their well-known
 * collections.
 *
 * Well-known databases and their well-known collections currently include:
 *   - `root` (collections: `auth`, `request-log`, `limited-log`)
 */
export function getCommonDummyData(additionalDummyData?: DummyData): DummyData {
  return cloneDeep({ root: dummyRootData, ...additionalDummyData });
}

/**
 * The shape of the well-known `root` database's collections and their test
 * data.
 */
export type DummyRootData = {
  _generatedAt: number;
  auth: WithId<InternalAuthEntry>[];
  'request-log': WithId<InternalRequestLogEntry>[];
  'limited-log': WithId<InternalLimitedLogEntry>[];
};

/**
 * Test data for the well-known `root` database.
 */
export const dummyRootData: DummyRootData = {
  _generatedAt: generatedAt,
  auth: [
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
    header: ndx % 2 ? null : `bearer ${BANNED_BEARER_TOKEN}`,
    method: ndx % 3 ? 'GET' : 'POST',
    route: 'fake/route',
    createdAt: generatedAt + 10 ** 6,
    resStatusCode: 200
  })),
  'limited-log': [
    { _id: new ObjectId(), ip: '1.2.3.4', until: generatedAt + 1000 * 60 * 15 },
    { _id: new ObjectId(), ip: '5.6.7.8', until: generatedAt + 1000 * 60 * 15 },
    {
      _id: new ObjectId(),
      header: `bearer ${BANNED_BEARER_TOKEN}`,
      until: generatedAt + 1000 * 60 * 60
    }
  ]
};
