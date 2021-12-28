import type { ObjectId } from 'mongodb';
import type { UnixEpochMs } from '@xunnamius/types';
import type { DbSchema } from 'multiverse/mongo-schema';

/**
 * A JSON representation of the backend Mongo database structure. This is used
 * for consistent app-wide db access across projects and to generate transient
 * versions of the db during testing.
 */
export function getSchemaConfig(): DbSchema {
  return {
    databases: {
      'global-api--system': {
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
            name: 'limited-log-mview',
            indices: [{ spec: 'header' }, { spec: 'ip' }]
          }
        ]
      },
      'global-api--xunn-at': {
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
      }
    },
    aliases: {
      system: 'global-api--system',
      'xunn-at': 'global-api--xunn-at'
    }
  };
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UserId extends ObjectId {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface LinkId extends ObjectId {}

/**
 * The shape of a link mapping headers field entry. Headers are sent to the user
 * as part of the HTTP response. A string will cause the header to be forwarded
 * as-is if it exists. Otherwise, the header will be set/overwritten to the
 * given value.
 */
export type InternalLinkMapHeader = string | { [header: string]: string };
export type InternalLinkMapHeaders = InternalLinkMapHeader | InternalLinkMapHeader[];

/**
 * The shape of a bare URI type link mapping.
 */
export type InternalLinkMapEntryUri = {
  type: 'uri';
  shortId: string;
  createdAt: UnixEpochMs;
  realLink: string;
  headers?: InternalLinkMapHeaders;
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
  headers?: InternalLinkMapHeaders;
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
  headers?: InternalLinkMapHeaders;
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
