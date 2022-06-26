import Endpoint, { config as Config } from 'universe/pages/api/[shortId]';
import { useMockDateNow } from 'multiverse/mongo-common';
import { setupMemoryServerOverride } from 'multiverse/mongo-test';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { dummyAppData } from 'testverse/db';
import { testApiHandler } from 'next-test-api-route-handler';
import { getEnv } from 'multiverse/next-env';
import { codeloadUrl, treeExistsUrl } from 'universe/backend/github-pkg';
import { readFileSync } from 'fs';
import { getEntries } from 'universe/backend/tar';
import { expectedEntries, withMockedOutput } from 'testverse/setup';
import { createGunzip } from 'zlib';
import { TrialError } from 'named-app-errors';
import { toss } from 'toss-expression';

import {
  InternalLinkMapEntryBadge,
  InternalLinkMapEntryFile,
  InternalLinkMapEntryGithubPkg,
  InternalLinkMapEntryUri
} from 'universe/backend/db';

const handler = Endpoint as typeof Endpoint & { config?: typeof Config };
handler.config = Config;

const server = setupServer();

const uriEntry = dummyAppData['link-map'][0] as InternalLinkMapEntryUri;
const badgeEntry = dummyAppData['link-map'][2] as InternalLinkMapEntryBadge;
const fileEntry = dummyAppData['link-map'][1] as InternalLinkMapEntryFile;
const githubPkgEntry = dummyAppData['link-map'][3] as InternalLinkMapEntryGithubPkg;

const githubPkgEntryWithDNESubdir = dummyAppData[
  'link-map'
][4] as InternalLinkMapEntryGithubPkg;

const githubPkgEntryWithSubdir = dummyAppData[
  'link-map'
][5] as InternalLinkMapEntryGithubPkg;

const FIXTURE_ROOT = `${__dirname}/../fixtures`;

const codeloader = ({
  owner,
  repo,
  fixture,
  commitMatcher,
  return404
}: {
  owner: string;
  repo: string;
  fixture?: string;
  commitMatcher?: string;
  return404?: boolean;
}) => {
  return rest.get(
    new RegExp(
      codeloadUrl(`${owner}/${repo}`, commitMatcher ?? '@@@')
        .replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
        .replace('@@@', '.+?')
    ),
    (_, res, ctx) => {
      if (!return404 && !fixture) {
        throw new TrialError('codeloader with return404==false must pass fixture name');
      }
      return return404
        ? res(ctx.status(404))
        : res(ctx.status(200), ctx.body(readFileSync(`${FIXTURE_ROOT}/${fixture}`)));
    }
  );
};

const treeChecker = ({
  owner,
  repo,
  commitMatcher,
  subdir,
  return404
}: {
  owner: string;
  repo: string;
  commitMatcher?: string;
  subdir: string;
  return404?: boolean;
}) => {
  return rest.head(
    new RegExp(
      treeExistsUrl(`${owner}/${repo}`, commitMatcher ?? '@@@', subdir)
        .replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
        .replace('@@@', '.+?')
    ),
    (_, res, ctx) => res(ctx.status(return404 ? 404 : 200))
  );
};

setupMemoryServerOverride();
useMockDateNow();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it('handles bad requests', async () => {
  expect.hasAssertions();

  const { shortId } = uriEntry;

  await testApiHandler({
    handler,
    params: { shortId },
    test: async ({ fetch }) => {
      const res = await fetch({ method: 'POST' });
      await expect(res.json()).resolves.toMatchObject({ success: false });
      expect(res.status).toBe(405);
    }
  });

  await testApiHandler({
    handler,
    params: { shortId: 'does-not-exist' },
    test: async ({ fetch }) => {
      const res = await fetch();
      await expect(res.json()).resolves.toMatchObject({ success: false });
      expect(res.status).toBe(404);
    }
  });

  await testApiHandler({
    handler,
    params: { shortId },
    test: async ({ fetch }) => {
      const res = await fetch({
        method: 'POST',
        body: 'x'.repeat(getEnv().MAX_CONTENT_LENGTH_BYTES + 1)
      });
      expect(res.status).toBe(413);
    }
  });

  await testApiHandler({
    handler,
    params: { shortId },
    test: async ({ fetch }) => {
      const res = await fetch({ headers: { 'x-forwarded-for': '1.2.3.4' } });
      await expect(res.json()).resolves.toMatchObject({ success: false });
      expect(res.status).toBe(429);
    }
  });
});

it.only('handles a uri short-id', async () => {
  expect.hasAssertions();

  const { shortId, realLink } = uriEntry;
  const realUrl = new URL(realLink);

  await testApiHandler({
    handler,
    params: { shortId },
    test: async ({ fetch }) => {
      server.use(
        rest.get('*', (req, res, ctx) => {
          return req.url.href == realUrl.href
            ? res(ctx.status(200), ctx.json({ it: 'worked' }))
            : req.passthrough();
        })
      );

      const res = await fetch({ headers: { 'x-msw-bypass': 'false' } });
      await expect(res.json()).resolves.toMatchObject({ it: 'worked' });
      expect(res.status).toBe(200);
    }
  });
});

it('handles a badge short-id', async () => {
  expect.hasAssertions();

  const { shortId, color, label, labelColor, message, headers } = badgeEntry;

  server.use(
    rest.get('https://img.shields.io/static/v1', (req, res, ctx) => {
      return res(
        ctx.status(200),
        ctx.body(
          `${req.url.searchParams.get('color')}-${req.url.searchParams.get(
            'label'
          )}-${req.url.searchParams.get('labelColor')}-${req.url.searchParams.get(
            'message'
          )}`
        )
      );
    })
  );

  await testApiHandler({
    handler,
    params: { shortId },
    test: async ({ fetch }) => {
      const res = await fetch();

      await expect(res.text()).resolves.toBe(
        `${color}-${label}-${labelColor}-${message}`
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/image\/svg/);
      expect(Object.keys(headers || {}).every((h) => res.headers.has(h))).toBeTrue();
    }
  });
});

it('handles a file short-id', async () => {
  expect.hasAssertions();

  const { shortId, headers } = fileEntry;

  await testApiHandler({
    handler,
    params: { shortId },
    test: async ({ fetch }) => {
      const res = await fetch();
      await expect(res.json()).resolves.toMatchObject({ success: false });
      expect(res.status).toBe(501);
      expect(Object.keys(headers || {}).every((h) => !res.headers.has(h))).toBeTrue();
    }
  });
});

it('handles a github-pkg short-id with no subdir', async () => {
  expect.hasAssertions();

  const { shortId, headers, owner, repo, defaultCommit } = githubPkgEntry;

  await testApiHandler({
    handler,
    params: { shortId },
    test: async ({ fetch }) => {
      server.use(codeloader({ owner, repo, fixture: 'monorepo.tar.gz' }));

      const res = await fetch();
      expect(res.status).toBe(200);
      expect(Object.keys(headers || {}).every((h) => res.headers.has(h))).toBeTrue();
      expect(res.headers.get('content-disposition')).toInclude(defaultCommit);
      expect(res.headers.get('content-type')).toBe('application/gzip');

      await expect(getEntries(res.body.pipe(createGunzip()))).resolves.toStrictEqual(
        expectedEntries.monorepo
      );
    }
  });
});

it('handles a github-pkg short-id with subdir', async () => {
  expect.hasAssertions();

  const { shortId, headers, owner, repo, defaultCommit, subdir } =
    githubPkgEntryWithSubdir;

  await testApiHandler({
    handler,
    params: { shortId },
    test: async ({ fetch }) => {
      server.use(codeloader({ owner, repo, fixture: 'monorepo.tar.gz' }));

      server.use(
        treeChecker({
          owner,
          repo,
          subdir: subdir || toss(new TrialError('expected subdir'))
        })
      );

      const res = await fetch();
      expect(res.status).toBe(200);
      expect(Object.keys(headers || {}).every((h) => res.headers.has(h))).toBeTrue();
      expect(res.headers.get('content-disposition')).toInclude(defaultCommit);
      expect(res.headers.get('content-type')).toBe('application/gzip');

      await expect(getEntries(res.body.pipe(createGunzip()))).resolves.toStrictEqual(
        expectedEntries.pkg1
      );
    }
  });
});

it('handles a github-pkg short-id with subdir and commitish', async () => {
  expect.hasAssertions();

  const { shortId, headers, owner, repo, subdir, tagPrefix } = githubPkgEntryWithSubdir;

  await testApiHandler({
    handler,
    params: { shortId: `${shortId}@18.0.2` },
    test: async ({ fetch }) => {
      server.use(
        codeloader({
          owner,
          repo,
          fixture: 'monorepo.tar.gz',
          commitMatcher: `${tagPrefix}18.0.2`
        })
      );

      server.use(
        codeloader({
          owner,
          repo,
          commitMatcher: '18.0.2',
          return404: true
        })
      );

      server.use(
        treeChecker({
          owner,
          repo,
          subdir: subdir || toss(new TrialError('expected subdir')),
          commitMatcher: `${tagPrefix}18.0.2`
        })
      );

      const res = await fetch();
      expect(res.status).toBe(200);
      expect(Object.keys(headers || {}).every((h) => res.headers.has(h))).toBeTrue();
      expect(res.headers.get('content-type')).toBe('application/gzip');
      expect(res.headers.get('content-disposition')).toInclude(
        'packages-pkg-1-18-0-2.tgz'
      );

      await expect(getEntries(res.body.pipe(createGunzip()))).resolves.toStrictEqual(
        expectedEntries.pkg1
      );
    }
  });
});

it('handles a github-pkg short-id with bad subdir', async () => {
  expect.hasAssertions();

  const { shortId, headers, owner, repo, subdir } = githubPkgEntryWithDNESubdir;

  await withMockedOutput(async () => {
    await testApiHandler({
      handler,
      params: { shortId },
      test: async ({ fetch }) => {
        server.use(codeloader({ owner, repo, fixture: 'polyrepo.tar.gz' }));

        server.use(
          treeChecker({
            owner,
            repo,
            subdir: subdir || toss(new TrialError('expected subdir')),
            return404: true
          })
        );

        const res = await fetch();
        expect(res.status).toBe(500);
        expect(Object.keys(headers || {}).every((h) => !res.headers.has(h))).toBeTrue();
        expect(res.headers.has('content-disposition')).toBeFalse();
        expect(res.headers.get('content-type')).not.toBe('application/gzip');
      }
    });
  });
});
