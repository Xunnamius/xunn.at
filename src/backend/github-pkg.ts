import fetch, { FetchError } from 'node-fetch';
import { pipeline as promisedPipeline } from 'stream/promises';
import { GuruMeditationError, HttpError } from 'universe/error';
import { extractSubdirAndRepack } from 'universe/backend/tar';
import { Gzip, Gunzip, constants } from 'minizlib';
import { toss } from 'toss-expression';

import type { NextApiResponse } from 'next';
import type { Response } from 'node-fetch';
import { NotFoundError } from 'named-app-errors';

/**
 * This is a special GitHub url that makes it easy to grab gzipped source
 * archives.
 */
const codeloadUrl = (repo: string, commit: string) =>
  `https://codeload.github.com/${repo}/tar.gz/${commit}`;

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
  const errorReport = codeloadUrl(`${owner}/${repo}`, `[${potentialCommits.join(', ')}]`);

  do {
    const url = codeloadUrl(
      `${owner}/${repo}`,
      potentialCommits.shift() ||
        toss(new GuruMeditationError('walked off potential commits array'))
    );
    // eslint-disable-next-line no-await-in-loop
    codeloadRes = await fetch(url);
  } while (potentialCommits.length && !codeloadRes.ok);

  if (!codeloadRes.ok) {
    throw new NotFoundError(`could not find package at url(s): ${errorReport}`);
  } else {
    try {
      await promisedPipeline([
        codeloadRes.body,
        ...(subdir
          ? [
              new Gunzip(),
              extractSubdirAndRepack({ subdir }),
              new Gzip({ level: constants.Z_BEST_COMPRESSION })
            ]
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
