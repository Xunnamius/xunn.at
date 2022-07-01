import * as util from 'util';
import { getDb } from 'multiverse/mongo-schema';
import { pipeline } from 'node:stream';
import { jsonFetch } from 'multiverse/json-node-fetch';
import { HttpError, ItemNotFoundError } from 'universe/error';
import fetch from 'node-fetch';

import type { NextApiResponse } from 'next';
import type {
  InternalLinkMapEntry,
  InternalLinkMapEntryGithubPkg,
  InternalLinkMapEntryUri,
  InternalLinkMapEntryFile,
  InternalLinkMapEntryBadge,
  InternalPkgCompatFlagEntry
} from 'universe/backend/db';

const promisedPipeline = util.promisify(pipeline);

/**
 * Translates a short link identifier into a link map entry.
 */
export async function resolveShortId({ shortId }: { shortId: string }): Promise<
  | (Omit<InternalLinkMapEntryGithubPkg, 'shortId' | 'createdAt'> & {
      pseudoFilename: (commit: string) => string;
    })
  | Omit<InternalLinkMapEntryUri, 'shortId' | 'createdAt'>
  | Omit<InternalLinkMapEntryFile, 'shortId' | 'createdAt'>
  | Omit<InternalLinkMapEntryBadge, 'shortId' | 'createdAt'>
> {
  const db = (await getDb({ name: 'xunn-at' })).collection<InternalLinkMapEntry>(
    'link-map'
  );
  const entry = await db.findOne({ shortId });

  if (!entry) {
    throw new ItemNotFoundError(shortId, 'short-id');
  }

  const {
    _id: _,
    createdAt: __,
    shortId: ___,
    ...shortData
  } = entry.type == 'github-pkg'
    ? {
        ...entry,
        pseudoFilename: (commit: string) =>
          `${[entry.owner, entry.repo, entry.subdir, commit]
            .filter(Boolean)
            .join('-')
            .replace(/[^a-z0-9-]/gi, '-')}.tgz`
      }
    : entry;

  return shortData;
}

/**
 * Returns the latest version of NTARH that passed GHA integration testing or
 * `null` if no such version exists.
 */
export async function getCompatVersion() {
  return (
    (
      await (await getDb({ name: 'pkg-compat' }))
        .collection<InternalPkgCompatFlagEntry>('flags')
        .findOne({ name: 'ntarh-next' })
    )?.value || null
  );
}

/**
 * Returns the latest version of a package or null if the data is unavailable.
 */
export async function getNpmPackageVersion(pkgName: string) {
  const target = `https://registry.npmjs.com/${encodeURIComponent(pkgName)}/latest`;
  return (await jsonFetch<{ version: string }>(target)).json?.version || null;
}

/**
 * Pipes SVG badge data from https://shields.io through a response.
 *
 * @see https://shields.io
 */
export async function sendBadgeSvgResponse({
  res,
  label,
  message,
  color,
  labelColor
}: {
  res: NextApiResponse;
  label?: string;
  message?: string;
  color?: string;
  labelColor?: string;
}) {
  const svgRes = await fetch(
    'https://img.shields.io/static/v1?' +
      (label ? `&label=${label}` : '') +
      (message ? `&message=${message}` : '') +
      (color ? `&color=${color}` : '') +
      (labelColor ? `&labelColor=${labelColor}` : '')
  );

  if (!svgRes.ok) {
    throw new HttpError(svgRes);
  }

  res.setHeader('content-type', 'image/svg+xml;charset=utf-8');
  await promisedPipeline(svgRes.body, res);
}
