import { getClientIp } from 'request-ip';
import { getDb } from 'universe/backend/db';

import type { HttpStatusCode } from '@xunnamius/types';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { InternalRequestLogEntry, InternalLimitedLogEntry } from 'types/global';

type ShortLinkTypes = 'link' | 'github-pkg';

export async function isRateLimited(req: NextApiRequest) {
  const ip = getClientIp(req);
  const key = req.headers?.key?.toString() || null;

  const limited = await (
    await getDb({ name: 'system' })
  )
    .collection<InternalLimitedLogEntry>('limited-log-mview')
    .find({
      $or: [...(ip ? [{ ip }] : []), ...(key ? [{ key }] : [])],
      until: { $gt: Date.now() } // ? Skip the recently unbanned
    })
    .sort({ until: -1 })
    .limit(1)
    .next();

  return {
    limited: !!limited,
    retryAfter: Math.max(0, ((limited?.until as number) || Date.now()) - Date.now())
  };
}

/**
 * Note that this async function does not have to be awaited. It's fire and
 * forget!
 */
export async function addToRequestLog({
  req,
  res
}: {
  req: NextApiRequest;
  res: NextApiResponse;
}) {
  await (await getDb({ name: 'system' }))
    .collection<InternalRequestLogEntry>('request-log')
    .insertOne({
      ip: getClientIp(req),
      key: req.headers?.key?.toString() || null,
      method: req.method || null,
      route: req.url?.replace(/^\/api\//, '') || null,
      resStatusCode: res.statusCode as HttpStatusCode,
      time: Date.now()
    });
}

export function isDueForContrivedError() {
  // TODO
  return false;
}

export async function isValidAuthHeader(header: string) {
  // TODO
  return false;
}

export async function resolveShortId({
  shortId
}: {
  shortId: string | undefined;
}): Promise<
  | {
      type: 'github-pkg';
      pseudoFilename: (commit: string) => string;
      user: string;
      repo: string;
      tagPrefix: string;
      defaultCommit: string;
      subdir: string;
    }
  | { type: 'link'; fullLink: string }
> {
  // const { customScripts: cs, commitIshInfo: cii } = pkgOpts;
  // const { commitIshInfo: cii } = pkgOpts;

  void shortId;
  const user = '';
  const repo = '';
  const tagPrefix = '';
  const defaultCommit = '';
  const subdir = '';

  return {
    type: 'github-pkg',
    pseudoFilename: (commit) =>
      `${[user, repo, subdir, commit]
        .filter(Boolean)
        .join('-')
        .replace(/[^a-z0-9-]/gi, '-')}.tgz`,
    user,
    repo,
    tagPrefix,
    defaultCommit,
    subdir
  };
}
