import { getCommonSchemaConfig } from 'multiverse/mongo-common';

import type { ObjectId } from 'mongodb';
import type { UnixEpochMs } from '@xunnamius/types';
import type { DbSchema } from 'multiverse/mongo-schema';

/**
 * A JSON representation of the backend Mongo database structure. This is used
 * for consistent app-wide db access across projects and to generate transient
 * versions of the db during testing.
 */
export function getSchemaConfig(): DbSchema {
  return getCommonSchemaConfig({
    databases: {
      'xunn-at': {
        collections: [
          {
            name: 'link-map',
            indices: [
              {
                spec: 'shortId',
                options: { unique: true }
              }
            ]
          }
        ]
      },
      'pkg-compat': {
        collections: [{ name: 'flags', indices: [{ spec: 'name' }] }]
      }
    },
    aliases: {}
  });
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UserId extends ObjectId {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface LinkId extends ObjectId {}

/**
 * The shape of a bare URI type link mapping.
 */
export type InternalLinkMapEntryUri = {
  type: 'uri';
  shortId: string;
  createdAt: UnixEpochMs;
  realLink: string;
  headers?: Record<string, string | string[]>;
};

/**
 * The shape of a file type link mapping.
 */
export type InternalLinkMapEntryFile = {
  type: 'file';
  shortId: string;
  createdAt: UnixEpochMs;
  resourceLink: string;
  name: string;
  headers?: Record<string, string>;
};

/**
 * The shape of a svg badge type link mapping.
 */
export type InternalLinkMapEntryBadge = {
  type: 'badge';
  shortId: string;
  createdAt: UnixEpochMs;
  label: string;
  message: string;
  color: string;
  labelColor: string;
  style: string;
  headers?: Record<string, string>;
};

/**
 * The shape of a GitHub-hosted package type link mapping.
 */
export type InternalLinkMapEntryGithubPkg = {
  type: 'github-pkg';
  shortId: string;
  createdAt: UnixEpochMs;
  owner: string;
  repo: string;
  defaultCommit: string;
  subdir: string | null;
  tagPrefix: string;
  headers?: Record<string, string>;
};

/* All valid link map entry types. */
export type LinkMapEntryType =
  | InternalLinkMapEntryUri['type']
  | InternalLinkMapEntryFile['type']
  | InternalLinkMapEntryBadge['type']
  | InternalLinkMapEntryGithubPkg['type'];

/**
 * The shape of a link map entry.
 */
export type InternalLinkMapEntry =
  | InternalLinkMapEntryUri
  | InternalLinkMapEntryFile
  | InternalLinkMapEntryBadge
  | InternalLinkMapEntryGithubPkg;

/**
 * The shape of a compatibility flag entry.
 */
export type InternalPkgCompatFlagEntry = { name: string; value: string | number };
