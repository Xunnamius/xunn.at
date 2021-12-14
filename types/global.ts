import type { ObjectId } from 'mongodb';
import type { HttpStatusCode } from '@xunnamius/types';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UserId extends ObjectId {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface LinkId extends ObjectId {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UnixEpochMs extends Number {}

/**
 * The shape of a link map entry.
 */
export type InternalLinkMapEntry =
  | {
      type: 'uri';
      shortLink: string;
      createdAt: UnixEpochMs;
      realLink: string;
    }
  | {
      type: 'file';
      shortLink: string;
      createdAt: UnixEpochMs;
      resourceLink: string;
      name: string;
    }
  | {
      type: 'media';
      shortLink: string;
      createdAt: UnixEpochMs;
      resourceLink: string;
      name: string;
    }
  | {
      type: 'github-pkg';
      shortLink: string;
      createdAt: UnixEpochMs;
      owner: string;
      repo: string;
      commit: string;
      subdir: string | null;
    };

/**
 * The shape of an API key.
 */
export type InternalApiKey = {
  owner: string;
  key: string;
};

/**
 * The shape of a request log entry.
 */
export type InternalRequestLogEntry = {
  ip: string | null;
  key: string | null;
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
      key?: never;
    }
  | {
      until: UnixEpochMs;
      ip?: never;
      key: string | null;
    };
