/* This file contains application-specific types */

import type { ObjectId } from 'mongodb';
import type { HttpStatusCode } from '@xunnamius/types';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UserId extends ObjectId {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface LinkId extends ObjectId {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UnixEpochMs extends Number {}

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

/**
 * The shape of an API bearer token credential.
 */
export type InternalApiCredential = {
  owner: string;
  scheme: string;
  token: string;
};

/**
 * The shape of a request log entry.
 */
export type InternalRequestLogEntry = {
  ip: string | null;
  token: string | null;
  route: string | null;
  method: string | null;
  resStatusCode: HttpStatusCode;
  time: UnixEpochMs;
};

/**
 * The shape of a limited log entry.
 */
export type InternalLimitedLogEntry =
  | {
      until: UnixEpochMs;
      ip: string | null;
      token?: never;
    }
  | {
      until: UnixEpochMs;
      ip?: never;
      token: string | null;
    };
