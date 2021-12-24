import { extractSubdirAndRepack, getEntries } from 'universe/backend/tar';
import { pipeline as promisedPipeline } from 'stream/promises';
import { createReadStream } from 'fs';
import { Gunzip } from 'minizlib';

import type { Entry } from 'universe/backend/tar';

const makeFixtureStream = (name: string) => {
  return createReadStream(`${__dirname}/../fixtures/${name}.tar.gz`).pipe(
    new Gunzip()
  ) as unknown as NodeJS.ReadWriteStream;
};

const tar = {
  fileroot: () => makeFixtureStream('file-root'),
  monorepo: () => makeFixtureStream('monorepo'),
  multiroot: () => makeFixtureStream('multi-root')
};

const expectedEntries: Record<string, Entry[]> = {
  monorepo: [
    {
      headers: expect.objectContaining({ name: 'monorepo/' }),
      data: ''
    },
    {
      headers: expect.objectContaining({ name: 'monorepo/package.json' }),
      data:
        '{\n' +
        '  "name": "dummy-monorepo",\n' +
        '  "workspaces": [\n' +
        '    "packages/pkg-1",\n' +
        '    "packages/pkg-2"\n' +
        '  ]\n' +
        '}\n'
    },
    {
      headers: expect.objectContaining({ name: 'monorepo/packages/' }),
      data: ''
    },
    {
      headers: expect.objectContaining({ name: 'monorepo/packages/pkg-1/' }),
      data: ''
    },
    {
      headers: expect.objectContaining({ name: 'monorepo/packages/pkg-1/package.json' }),
      data:
        '{\n' +
        '  "name": "dummy-monorepo-pkg-2",\n' +
        '  "version": "1.0.0",\n' +
        '  "main": "index.js"\n' +
        '}\n'
    },
    {
      headers: expect.objectContaining({ name: 'monorepo/packages/pkg-1/index.js' }),
      data: "console.log('dummy monorepo pkg-1 test');\n"
    },
    {
      headers: expect.objectContaining({ name: 'monorepo/packages/pkg-2/' }),
      data: ''
    },
    {
      headers: expect.objectContaining({ name: 'monorepo/packages/pkg-2/package.json' }),
      data:
        '{\n' +
        '  "name": "dummy-monorepo-pkg-2",\n' +
        '  "version": "1.0.0",\n' +
        '  "main": "index.js"\n' +
        '}\n'
    },
    {
      headers: expect.objectContaining({ name: 'monorepo/packages/pkg-2/index.js' }),
      data: "console.log('dummy monorepo pkg-2 test');\n"
    }
  ],
  pkg1: [
    {
      headers: expect.objectContaining({ name: 'pkg-1/' }),
      data: ''
    },
    {
      headers: expect.objectContaining({ name: 'pkg-1/package.json' }),
      data:
        '{\n' +
        '  "name": "dummy-monorepo-pkg-2",\n' +
        '  "version": "1.0.0",\n' +
        '  "main": "index.js"\n' +
        '}\n'
    },
    {
      headers: expect.objectContaining({ name: 'pkg-1/index.js' }),
      data: "console.log('dummy monorepo pkg-1 test');\n"
    }
  ],
  pkg2: [
    {
      headers: expect.objectContaining({ name: 'pkg-2/' }),
      data: ''
    },
    {
      headers: expect.objectContaining({ name: 'pkg-2/package.json' }),
      data:
        '{\n' +
        '  "name": "dummy-monorepo-pkg-2",\n' +
        '  "version": "1.0.0",\n' +
        '  "main": "index.js"\n' +
        '}\n'
    },
    {
      headers: expect.objectContaining({ name: 'pkg-2/index.js' }),
      data: "console.log('dummy monorepo pkg-2 test');\n"
    }
  ]
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
