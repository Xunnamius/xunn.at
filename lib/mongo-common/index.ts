import cloneDeep from 'clone-deep';
import { ObjectId } from 'mongodb';
import { mockDateNowMs } from 'multiverse/jest-mock-date';

import {
  BANNED_BEARER_TOKEN,
  DEV_BEARER_TOKEN,
  DUMMY_BEARER_TOKEN
} from 'multiverse/next-auth';

import type { DbSchema } from 'multiverse/mongo-schema';
import type { DummyData } from 'multiverse/mongo-test';
import type { InternalAuthEntry } from 'multiverse/next-auth';
import type { InternalLimitedLogEntry } from 'multiverse/next-limit';
import type { InternalRequestLogEntry } from 'multiverse/next-log';

export * from 'multiverse/jest-mock-date';

/**
 * A JSON representation of the backend Mongo database structure. This is used
 * for common consistent "well-known" db structure across projects.
 *
 * Well-known databases and their well-known collections currently include:
 *   - `root` (collections: `auth`, `request-log`, `limited-log`)
 */
export function getCommonSchemaConfig(additionalSchemaConfig?: DbSchema): DbSchema {
  return {
    databases: {
      root: {
        collections: [
          {
            name: 'auth',
            indices: [
              { spec: 'attributes.owner' },
              // ! When performing equality matches on embedded documents, field
              // ! order matters and the embedded documents must match exactly.
              // * https://xunn.at/mongo-docs-query-embedded-docs
              // ! Additionally, field order determines internal sort order.
              { spec: ['scheme', 'token'], options: { unique: true } }
            ]
          },
          {
            name: 'request-log',
            indices: [{ spec: 'header' }, { spec: 'ip' }]
          },
          {
            name: 'limited-log',
            indices: [{ spec: 'header' }, { spec: 'ip' }, { spec: { until: -1 } }]
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
  auth: InternalAuthEntry[];
  'request-log': InternalRequestLogEntry[];
  'limited-log': InternalLimitedLogEntry[];
};

/**
 * Test data for the well-known `root` database.
 */
export const dummyRootData: DummyRootData = {
  _generatedAt: mockDateNowMs,
  auth: [
    // ! Must maintain order or various unit tests will fail
    {
      _id: new ObjectId(),
      attributes: { owner: 'local developer', isGlobalAdmin: true },
      scheme: 'bearer',
      token: { bearer: DEV_BEARER_TOKEN }
    },
    {
      _id: new ObjectId(),
      attributes: { owner: 'dummy owner' },
      scheme: 'bearer',
      token: { bearer: DUMMY_BEARER_TOKEN }
    },
    {
      _id: new ObjectId(),
      attributes: { owner: 'banned dummy owner' },
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
    createdAt: mockDateNowMs + 10 ** 6,
    resStatusCode: 200
  })),
  'limited-log': [
    // ! Must maintain order or various unit tests will fail
    { _id: new ObjectId(), ip: '1.2.3.4', until: mockDateNowMs + 1000 * 60 * 15 },
    { _id: new ObjectId(), ip: '5.6.7.8', until: mockDateNowMs + 1000 * 60 * 15 },
    {
      _id: new ObjectId(),
      header: `bearer ${BANNED_BEARER_TOKEN}`,
      until: mockDateNowMs + 1000 * 60 * 60
    }
  ]
};
