import { getClientIp } from 'request-ip';
import { getDb } from 'universe/backend/db';
import { InvalidSecretError, ValidationError } from 'universe/error';
import { getEnv } from 'universe/backend/env';
import { Octokit } from '@octokit/rest';
import fetch from 'node-fetch';

import type { HttpStatusCode } from '@xunnamius/types';
import type { NextApiRequest, NextApiResponse } from 'next';

import type {
  InternalRequestLogEntry,
  InternalLimitedLogEntry,
  InternalApiCredential,
  InternalLinkMapEntryGithubPkg,
  InternalLinkMapEntryUri,
  InternalLinkMapEntryFile,
  InternalLinkMapEntryBadge
} from 'types/global';

/**
 * Global (but only per serverless function instance) request counting state
 */
let requestCounter = 0;

export function authHeaderToCredentials(header: string | string[] | undefined) {
  if (!header || typeof header != 'string' || !/^\S+ \S/.test(header)) {
    throw new InvalidSecretError('missing or invalid authorization header');
  }

  const [rawScheme, ...rawCredentials] = header.split(/\s/gi);

  const scheme = rawScheme.toLowerCase();
  const credentials = rawCredentials.flatMap((c) => c.split(',')).filter(Boolean);

  if (scheme == 'bearer') {
    if (credentials.length == 1) {
      return { scheme, token: credentials[0] };
    } else {
      throw new InvalidSecretError('invalid auth parameters');
    }
  } else {
    throw new InvalidSecretError('invalid auth scheme');
  }
}

export async function isRateLimited(req: NextApiRequest) {
  const ip = getClientIp(req);
  let token: string | null = null;

  try {
    ({ token } = authHeaderToCredentials(req.headers.authorization));
  } catch {}

  const limited = await (
    await getDb({ name: 'system' })
  )
    .collection<InternalLimitedLogEntry>('limited-log-mview')
    .find({
      $or: [...(ip ? [{ ip }] : []), ...(token ? [{ token }] : [])],
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
  let token: string | null = null;
  try {
    ({ token } = authHeaderToCredentials(req.headers.authorization));
  } catch {}

  await (await getDb({ name: 'system' }))
    .collection<InternalRequestLogEntry>('request-log')
    .insertOne({
      ip: getClientIp(req),
      token,
      method: req.method || null,
      route: req.url || null,
      resStatusCode: res.statusCode as HttpStatusCode,
      time: Date.now()
    });
}

/**
 * Note that this is a per-serverless-function request counter and not global
 * across all Vercel virtual machines.
 */
export function isDueForContrivedError() {
  const env = getEnv();
  if ('REQUESTS_PER_CONTRIVED_ERROR' in env) {
    const reqPerErr = (env as unknown as { REQUESTS_PER_CONTRIVED_ERROR: number })
      .REQUESTS_PER_CONTRIVED_ERROR;

    if (reqPerErr && ++requestCounter >= reqPerErr) {
      requestCounter = 0;
      return true;
    }

    return false;
  } else {
    throw new ValidationError('environment is not setup for contrived errors');
  }
}

export async function isValidAuthHeader(header: string) {
  const { scheme, token } = authHeaderToCredentials(header);

  return (await getDb({ name: 'system' }))
    .collection<InternalApiCredential>('auth')
    .findOne({ scheme, token })
    .then((r) => !!r);
}

export async function resolveShortId({
  shortId
}: {
  shortId: string | undefined;
}): Promise<
  | (Omit<InternalLinkMapEntryGithubPkg, 'shortId' | 'createdAt'> & {
      pseudoFilename: (commit: string) => string;
    })
  | Omit<InternalLinkMapEntryUri, 'shortId' | 'createdAt'>
  | Omit<InternalLinkMapEntryFile, 'shortId' | 'createdAt'>
  | Omit<InternalLinkMapEntryBadge, 'shortId' | 'createdAt'>
> {
  void shortId;
  const owner = '';
  const repo = '';
  const tagPrefix = '';
  const defaultCommit = '';
  const subdir = '';

  return {
    type: 'github-pkg',
    pseudoFilename: (commit) =>
      `${[owner, repo, subdir, commit]
        .filter(Boolean)
        .join('-')
        .replace(/[^a-z0-9-]/gi, '-')}.tgz`,
    owner,
    repo,
    tagPrefix,
    defaultCommit,
    subdir
  };
}

export async function sendBadgeSvgResponse(
  res: NextApiResponse<ReadableStream<Uint8Array> | null>,
  {
    label,
    message,
    color,
    labelColor
  }: {
    label?: string;
    message?: string;
    color?: string;
    labelColor?: string;
  }
) {
  const resp = await fetch(
    'https://img.shields.io/static/v1?' +
      (label ? `&label=${label}` : '') +
      (message ? `&message=${message}` : '') +
      (color ? `&color=${color}` : '') +
      (labelColor ? `&labelColor=${labelColor}` : '')
  );

  res.setHeader('content-type', 'image/svg+xml;charset=utf-8');
  res.setHeader('cache-control', 's-maxage=60, stale-while-revalidate');
  res.status(resp.ok ? 200 : 500).send(resp.body);
}

export async function getCompatVersion() {
  return (
    (
      await (
        await getDb({
          name: 'global-api--is-next-compat'
        })
      )
        .collection<{ compat: string }>('flags')
        .findOne({})
    )?.compat || null
  );
}

export async function getNpmPackageVersion(pkgName: string) {
  const target = `https://registry.npmjs.com/${encodeURIComponent(pkgName)}/latest`;
  return (await fetch.get<{ version: string }>(target)).json?.version || null;
}

export async function getGitHubRepoTagDate({
  owner,
  repo,
  tag
}: {
  owner: string;
  repo: string;
  tag: string;
}) {
  const { repos } = new Octokit({
    ...(getEnv().GITHUB_PAT ? { auth: getEnv().GITHUB_PAT } : {}),
    userAgent: 'github.com/ergodark/api.ergodark.com'
  });

  let page = 1;
  let tags = null;
  let commit = null;

  do {
    // eslint-disable-next-line no-await-in-loop
    ({ data: tags } = await repos.listTags({
      owner: owner,
      repo: repo,
      page: page++
    }));

    ({ commit } = tags.find((val) => val.name == tag) || {});
  } while (!commit && tags.length);

  // if(commit) {
  //     const { data: { commit: { author: { date: rawDate }}}} = await repos.getCommit({
  //         owner: owner,
  //         repo: repo,
  //         ref: commit.sha
  //     });

  //     const d = new Date(rawDate);
  //     return d.toDateString();
  // }

  return null;
}
