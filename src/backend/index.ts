import { getDb } from 'multiverse/mongo-schema';
import { getEnv } from 'multiverse/next-env';
import { Octokit } from '@octokit/rest';
import fetch from 'node-fetch';

import type { NextApiResponse } from 'next';

import type {
  InternalLinkMapEntryGithubPkg,
  InternalLinkMapEntryUri,
  InternalLinkMapEntryFile,
  InternalLinkMapEntryBadge
} from 'universe/backend/db';

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
