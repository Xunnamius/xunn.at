import { extractSubdirAndRepack, getEntries } from 'universe/backend/tar';
import { pipeline as promisedPipeline } from 'stream/promises';
import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import { expectedEntries } from 'testverse/setup';

import type { Entry } from 'universe/backend/tar';

const makeFixtureStream = (name: string) => {
  return createReadStream(`${__dirname}/../fixtures/${name}.tar.gz`).pipe(createGunzip());
};

const tar = {
  fileroot: () => makeFixtureStream('file-root'),
  monorepo: () => makeFixtureStream('monorepo'),
  multiroot: () => makeFixtureStream('multi-root')
};

it("throws if archive root isn't a single directory", async () => {
  expect.hasAssertions();

  await expect(() =>
    promisedPipeline([
      tar.multiroot(),
      extractSubdirAndRepack({ subdir: 'packages/pkg-1' })
    ])
  ).rejects.toThrow('invalid archive: multi-directory root not allowed');
});

it('getEntries also works as a function that returns an array', async () => {
  expect.hasAssertions();

  await expect(getEntries(tar.monorepo())).resolves.toStrictEqual(
    expectedEntries.monorepo
  );
});

it("throws if archive root isn't a directory", async () => {
  expect.hasAssertions();

  await expect(() =>
    promisedPipeline([
      tar.fileroot(),
      extractSubdirAndRepack({ subdir: 'packages/pkg-1' })
    ])
  ).rejects.toThrow('invalid archive: first entry must be a directory');
});

it('extracts root directory (passthrough) if subdir is empty', async () => {
  expect.hasAssertions();

  const entries: Entry[] = [];

  await promisedPipeline([
    tar.monorepo(),
    extractSubdirAndRepack({ subdir: '' }),
    getEntries(entries)
  ]);

  expect(entries).toStrictEqual(expectedEntries.monorepo);
});

it('repacks monorepo archive with pkg-1 at subdir as root', async () => {
  expect.hasAssertions();

  const entries: Entry[] = [];

  await promisedPipeline([
    tar.monorepo(),
    extractSubdirAndRepack({ subdir: 'packages/pkg-1' }),
    getEntries(entries)
  ]);

  expect(entries).toStrictEqual(expectedEntries.pkg1);
});

it('repacks monorepo archive with pkg-2 at subdir as root', async () => {
  expect.hasAssertions();

  const entries: Entry[] = [];

  await promisedPipeline([
    tar.monorepo(),
    extractSubdirAndRepack({ subdir: 'packages/pkg-2' }),
    getEntries(entries)
  ]);

  expect(entries).toStrictEqual(expectedEntries.pkg2);
});

it('repacks monorepo archive with pkg-2 at subdir as root even if subdir ends in /', async () => {
  expect.hasAssertions();

  const entries: Entry[] = [];

  await promisedPipeline([
    tar.monorepo(),
    extractSubdirAndRepack({ subdir: 'packages/pkg-2/' }),
    getEntries(entries)
  ]);

  expect(entries).toStrictEqual(expectedEntries.pkg2);
});

it('throws if subdir does not exist', async () => {
  expect.hasAssertions();

  await expect(
    promisedPipeline([
      tar.monorepo(),
      extractSubdirAndRepack({ subdir: 'packages/pkg-x' }),
      getEntries([])
    ])
  ).rejects.toThrow('invalid subdirectory: packages/pkg-x');
});
