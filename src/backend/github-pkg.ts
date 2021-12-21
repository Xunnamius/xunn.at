import fetch, { FetchError } from 'node-fetch';
import { pipeline } from 'stream/promises';
import { HttpError } from 'named-app-errors';
import { extractAndRepack } from 'universe/backend/tar';

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
      // TODO: prepend?
      await pipeline([codeloadRes.body, extractAndRepack({ subdir, prepend: '' }), res]);
    } catch (e) {
      if (e instanceof FetchError) {
        throw new HttpError(e.message);
      } else throw e;
    }
  }
}
