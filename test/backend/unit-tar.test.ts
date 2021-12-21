import { extractAndRepack } from 'universe/backend/tar';
import { TrialError } from 'universe/error';
import { pipeline } from 'stream/promises';

async function getEntries(readableStream: Readable) {
  const entries: TarEntry[] = [];

  for await (const item of readableStream) {
    if (isTarEntry(item)) {
      entries.push(item);
    } else {
      throw new TrialError('invalid tar entry');
    }
  }

  return entries;
}

function* tarEntries({ count = 10, depth = 3, root = '' } = {}): Generator<TarEntry> {
  const dirs: Record<string, true> = {};

  if (root) {
    dirs[root] = true;
    yield { headers: { name: root, type: 'directory' } };
  }

  for (let i = 0; i < count; i++) {
    const dirName =
      root + [...new Array(i % depth).keys()].map((dir) => `dir${dir}/`).join('');

    if (dirName && !dirs[dirName]) {
      dirs[dirName] = true;
      yield { headers: { name: dirName, type: 'directory' } };
    }

    const fileName = dirName + `file${i}.data`;
    yield { headers: { name: fileName }, content: String(i) };
  }
}

test('do not extract sub folder (only extract root folder)', async () => {
  expect.hasAssertions();

  const entries = Readable.from(tarEntries({ root: 'root/' }));
  const extractionTransform = extractSubFolder('');

  await Promise.all([
    streamPipeline(entries, extractionTransform),
    expect(getEntries(extractionTransform)).resolves.toStrictEqual<TarEntry[]>([
      ...tarEntries({ root: '' })
    ])
  ]);
});

test('extract sub folder', async () => {
  expect.hasAssertions();

  const sub = 'dir1/';
  const entries = Readable.from(tarEntries({ root: 'root/' }));
  const extractionTransform = extractSubFolder(sub);

  await Promise.all([
    streamPipeline(entries, extractionTransform),
    expect(getEntries(extractionTransform)).resolves.toStrictEqual<TarEntry[]>(
      [...tarEntries({ root: '' })].filter((e) => e.headers.name.startsWith(sub))
    )
  ]);
});

test('throw error when there is multiple files or dirs at root', async () => {
  expect.hasAssertions();

  const entries = Readable.from(tarEntries({ root: '' }));
  const extractionTransform = extractSubFolder('dir1');

  const done = expect(streamPipeline(entries, extractionTransform)).rejects.toMatchObject(
    { x: 1 }
  );
  extractionTransform.read();
  await done;
});

test('prepend path', async () => {
  expect.hasAssertions();

  await Promise.all(
    [undefined, '', 'root', 'root/']
      .map((prepend) => {
        return ['', 'd2/'].map(async (root) => {
          const entries = Readable.from(tarEntries({ root }));
          const prependTransform = prependPath(prepend);

          await Promise.all([
            expect(streamPipeline(entries, prependTransform)).resolves.toBeUndefined(),
            expect(getEntries(prependTransform)).resolves.toStrictEqual(
              [...tarEntries({ root })].map((entry) => ({
                ...entry,
                headers: {
                  ...entry.headers,
                  name: (prepend || '') + entry.headers.name
                }
              }))
            )
          ]);
        });
      })
      .flat(2)
  );
});
