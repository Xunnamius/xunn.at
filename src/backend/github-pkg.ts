import fetch, { FetchError } from 'node-fetch';
import { pipeline as promisedPipeline } from 'stream/promises';
import { HttpError } from 'named-app-errors';
import { extractSubdirAndRepack } from 'universe/backend/tar';
import { Gzip, Gunzip, constants } from 'minizlib';

import type { NextApiResponse } from 'next';

const codeloadUrl = (repo: string, commit: string) =>
  `https://codeload.github.com/${repo}/tar.gz/${commit}`;

export async function githubPackageDownloadPipeline({
  res,
  repoData: { user, repo, commit, subdir }
}: {
  res: NextApiResponse;
  repoData: { user: string; repo: string; commit: string; subdir: string };
}) {
  const url = codeloadUrl(`${user}/${repo}`, commit);
  const codeloadRes = await fetch(url);

  if (!codeloadRes.ok) {
    throw new HttpError(codeloadRes, `download from url failed: ${url}`);
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
