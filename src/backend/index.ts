import { getDb } from 'multiverse/mongo-schema';
import { pipeline } from 'stream/promises';
import { jsonFetch } from 'multiverse/json-node-fetch';
import fetch from 'node-fetch';

import type { NextApiResponse } from 'next';
import type {
  InternalLinkMapEntryGithubPkg,
  InternalLinkMapEntryUri,
  InternalLinkMapEntryFile,
  InternalLinkMapEntryBadge
} from 'universe/backend/db';

/**
 * Translates a short link identifier into a link map entry.
 */
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

  // TODO: 404 not found

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
    subdir,
    headers: {}
  };
}

/**
 * Response to a client with SVG badge data from shields.io.
 *
 * @see https://shields.io
 */
export async function sendBadgeSvgResponse(
  res: NextApiResponse,
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
  const svgRes = await fetch(
    'https://img.shields.io/static/v1?' +
      (label ? `&label=${label}` : '') +
      (message ? `&message=${message}` : '') +
      (color ? `&color=${color}` : '') +
      (labelColor ? `&labelColor=${labelColor}` : '')
  );

  res.setHeader('content-type', 'image/svg+xml;charset=utf-8');
  res.status(svgRes.ok ? 200 : 500); // TODO: just throw if svgRes not ok
  await pipeline(svgRes.body, res);
}

/**
 * Returns the latest version of NTARH that passed GHA integration testing or
 * `null` if no such version exists.
 */
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

/**
 * Returns the latest version of a package or null if the data is unavailable.
 */
export async function getNpmPackageVersion(pkgName: string) {
  const target = `https://registry.npmjs.com/${encodeURIComponent(pkgName)}/latest`;
  return (await jsonFetch<{ version: string }>(target)).json?.version || null;
}
