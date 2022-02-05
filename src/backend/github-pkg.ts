import * as util from 'util';
import fetch, { FetchError } from 'node-fetch';
import { pipeline } from 'stream';
import { GuruMeditationError, HttpError } from 'universe/error';
import { extractSubdirAndRepack } from 'universe/backend/tar';
import { createGzip, createGunzip } from 'zlib';
import { AppError, NotFoundError } from 'named-app-errors';
import { toss } from 'toss-expression';
import { name as pkgName } from 'package';
import { debugFactory } from 'multiverse/debug-extended';

import type { NextApiResponse } from 'next';
import type { Response } from 'node-fetch';

const promisedPipeline = util.promisify(pipeline);
const debug = debugFactory(`${pkgName}:github-pkg`);

/**
 * This is a special GitHub url that makes it easy to grab gzipped source
 * archives.
 */
export const codeloadUrl = (repo: string, commit: string) =>
  `https://codeload.github.com/${repo}/tar.gz/${commit}`;

/**
 * This is the GitHub url used to check if a subdir actually exists before
 * attempting a codeload. This is done to prevent the response body pipe from
 * breaking after failing to find a tar archive subdir that didn't exist.
 */
export const treeExistsUrl = (repo: string, commit: string, subdir: string) =>
  `https://github.com/${repo}/tree/${commit}/${subdir}`;

/**
 * Responds to a client with a GitHub-hosted tar archive, potentially repacked,
 * containing an npm package.
 */
export async function githubPackageDownloadPipeline({
  res,
  repoData: { owner, repo, potentialCommits, subdir }
}: {
  res: NextApiResponse;
  repoData: {
    owner: string;
    repo: string;
    potentialCommits: string[];
    subdir: string | null;
  };
}) {
  let codeloadRes: Response;
  let actualCommit: string;
  const errorReport = codeloadUrl(`${owner}/${repo}`, `[${potentialCommits.join(', ')}]`);

  do {
    const url = codeloadUrl(
      `${owner}/${repo}`,
      (actualCommit =
        potentialCommits.shift() ||
        toss(new GuruMeditationError('walked off potential commits array')))
    );

    debug(`attempting codeload from ${url}`);
    // eslint-disable-next-line no-await-in-loop
    codeloadRes = await fetch(url);
  } while (potentialCommits.length && !codeloadRes.ok);

  if (!codeloadRes.ok) {
    throw new NotFoundError(`could not find package at url(s): ${errorReport}`);
  } else {
    try {
      if (subdir) {
        const url = treeExistsUrl(`${owner}/${repo}`, actualCommit, subdir);
        debug(`checking for subdir existence at ${url}`);
        const treeExistsRes = await fetch(url, { method: 'HEAD' });

        if (!treeExistsRes.ok) {
          throw new AppError(
            `GitHub repository ${owner}/${repo}@${actualCommit} does not contain sub directory "${subdir}"`
          );
        }
      }

      debug('starting pipeline');

      await promisedPipeline([
        codeloadRes.body,
        ...(subdir
          ? [createGunzip(), /*extractSubdirAndRepack({ subdir }),*/ createGzip()]
          : []),
        res
      ]);
    } catch (e) {
      if (e instanceof FetchError) {
        throw new HttpError(e.message);
      } else throw e;
    }
  }
}
