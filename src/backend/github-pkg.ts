import fetch, { FetchError } from 'node-fetch';
import { pipeline as promisedPipeline } from 'stream/promises';
import { GuruMeditationError, HttpError } from 'universe/error';
import { extractSubdirAndRepack } from 'universe/backend/tar';
import { Gzip, Gunzip, constants } from 'minizlib';
import { toss } from 'toss-expression';

import type { NextApiResponse } from 'next';
import type { Response } from 'node-fetch';
import { NotFoundError } from 'named-app-errors';

const codeloadUrl = (repo: string, commit: string) =>
  `https://codeload.github.com/${repo}/tar.gz/${commit}`;

export async function githubPackageDownloadPipeline({
  res,
  repo: { user, repo, potentialCommits, subdir }
}: {
  res: NextApiResponse;
  repo: { user: string; repo: string; potentialCommits: string[]; subdir: string };
}) {
  let codeloadRes: Response;
  const errorReport = codeloadUrl(`${user}/${repo}`, `[${potentialCommits.join(', ')}]`);

  do {
    const url = codeloadUrl(
      `${user}/${repo}`,
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
