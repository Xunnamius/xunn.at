import * as util from 'util';
import { ValidationError } from 'universe/error';
import { Transform, PassThrough, pipeline } from 'stream';
import { extract as extractStream, pack as repackStream } from 'tar-stream';
import { name as pkgName } from 'package';
import { debugFactory } from 'multiverse/debug-extended';

import type { Headers } from 'tar-stream';
import type { Writable, Readable } from 'stream';

const promisedPipeline = util.promisify(pipeline);
const debug = debugFactory(`${pkgName}:github-pkg`);

// ? 1 GiB
const defaultHighWaterMark = 1073741824;

type StreamCallback = (error?: unknown) => void;

/**
 * The shape of a single entry in an uncompressed tar archive.
 */
export type Entry = { headers: Headers; data: string };

/**
 * Returns a writable stream into which an _uncompressed_ (not gzipped) tar
 * archive can be written. Writes into the stream are translated into entries,
 * which are collected into the provided `entries` array.
 *
 * @param entries An array into which each entry encountered will be written.
 */
export function getEntries(entries: Entry[]): Writable;
/**
 * Accepts a readable _uncompressed_ (not gzipped) tar archive `stream` and
 * returns an array of the archive's entries.
 */
export function getEntries(stream: Readable): Promise<Entry[]>;
export function getEntries(arg: Readable | Entry[]): Writable | Promise<Entry[]> {
  const entries: Entry[] = Array.isArray(arg) ? arg : [];

  const xstream = extractStream();
  xstream.on('entry', (headers, entry, next) => {
    const chunks: Buffer[] = [];

    /* istanbul ignore next */
    entry.on('error', (err) => next(err));
    entry.on('end', () => {
      entries.push({ headers, data: Buffer.concat(chunks).toString('utf8') });
      next();
    });
    entry.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  });

  if (Array.isArray(arg)) {
    return xstream;
  } else {
    return promisedPipeline([arg, xstream]).then(() => entries);
  }
}

/**
 * Returns a Transform stream into which an _uncompressed_ (not gzipped) tar
 * archive can be written. The tar archive's entries, excluding those that fall
 * outside of `{ subdir }`, are repackaged into a new archive which can be read
 * from the other end of the stream.
 */
export function extractSubdirAndRepack({
  subdir,
  maxEntrySizeBytes
}: {
  /**
   * The subdirectory that will become the new root directory of the repacked
   * tar file. Can optionally end with a slash (/), but this is not required.
   */
  subdir?: string;
  /**
   * The maximum size of any one repacked tar entry, give or take a couple
   * KiB. The node instance running this function will use at most around
   * (maxEntrySizeBytes + 150MiB) of RAM as of node@14. If an entry larger
   * than this is encountered, the transform stream is destroyed with an
   * error.
   *
   * @see https://vercel.com/docs/cli#project-configuration/functions
   * @default 1073741824 (1 GiB)
   */
  maxEntrySizeBytes?: number;
}) {
  subdir = subdir ? (subdir.endsWith('/') ? subdir.slice(0, -1) : subdir) : '';

  if (!subdir) {
    debug('subdir is empty; entries will not be repacked (passthrough mode)');
  }

  const highWaterMark = maxEntrySizeBytes ?? defaultHighWaterMark;
  const xstream = extractStream();
  const pstream = repackStream({
    // ? Don't queue up writes to the pstream worth more than this many bytes.
    // ! Without this, any archived file over the default 16KiB will cause the
    // ! transform stream to choke and die (loop endlessly until timeout).
    highWaterMark: maxEntrySizeBytes
  });

  let mainstream: Transform = undefined as unknown as Transform;
  let tarRoot: string | null = null;
  let targetRoot: string | null = null;
  let newRoot: string | null = null;
  let tarIsEmpty = true;

  const destroyStreams = (error: Error) => {
    debug('destroying all streams');
    mainstream.destroy(error);
    xstream.destroy();
    pstream.destroy();
  };

  const pipeReadableToPackStream = (
    readableEntryStream: PassThrough,
    headers: Headers,
    next: StreamCallback
  ) => {
    debug(`REPACK: ${headers.name}`);
    pipeline(readableEntryStream, pstream.entry(headers), next);
  };

  const discardReadableStream = (
    readableEntryStream: PassThrough,
    headers: Headers,
    next: StreamCallback
  ) => {
    debug(`DISCARD: ${headers.name}`);
    readableEntryStream.resume().once('end', next);
  };

  xstream.on('entry', (headers, readableEntryStream, next) => {
    /* istanbul ignore if */
    if (headers.size === undefined) {
      next(new ValidationError(`invalid archive: missing entry size in header`));
    } else if (headers.size > highWaterMark) {
      debug.error(
        `entry "${headers.name}" is too large to process: ${headers.size} bytes > ${highWaterMark} limit`
      );
      next(
        new ValidationError(
          `invalid archive: entry too large to process: ${headers.name}`
        )
      );
    } else if (!subdir) {
      tarIsEmpty = false;
      // ? Commit entry without modifications
      pipeReadableToPackStream(readableEntryStream, headers, next);
    } else {
      if (tarRoot === null) {
        debug(`determining repackaged tar root from subdirectory: ${subdir}`);

        if (headers.type != 'directory') {
          next(
            new ValidationError('invalid archive: first entry must be a directory')
          );
        } else {
          tarRoot = headers.name;
          targetRoot = `${tarRoot}${subdir}/`;
          newRoot = `${subdir.split('/').slice(-1)[0]}/`;

          debug(`original tar root: ${tarRoot}`);
          debug(`target directory: ${targetRoot}`);
          debug(`repacked tar root: ${newRoot}`);

          // ? Ignore entry
          discardReadableStream(readableEntryStream, headers, next);
        }
      } else if (tarRoot && targetRoot && headers.name.startsWith(tarRoot)) {
        // ? Exclude unwanted files/directories
        if (headers.name.startsWith(targetRoot)) {
          tarIsEmpty = false;
          // ? Modify file path if necessary
          headers.name = `${newRoot}${headers.name.slice(targetRoot.length)}`;
          // ? Commit entry with modifications
          pipeReadableToPackStream(readableEntryStream, headers, next);
        } else {
          // ? Ignore entry
          discardReadableStream(readableEntryStream, headers, next);
        }
      } else {
        next(
          new ValidationError('invalid archive: multi-directory root not allowed')
        );
      }
    }
  });

  xstream.on('finish', () => {
    if (tarIsEmpty) {
      destroyStreams(new ValidationError(`invalid subdirectory: ${subdir}`));
    } else {
      debug('flushing final (extracted) chunks downstream');
      // ? Flush the final repacked chunk(s) downstream to pstream.
      pstream.finalize();
    }
  });

  pstream.on('data', (chunk) => {
    // ? Send repacked chunk downstream to reader.
    /* istanbul ignore next */
    if (!mainstream.push(chunk)) {
      debug.warn('experiencing unexpected backpressure on readable side');
    }
  });

  /* istanbul ignore next */
  pstream.on('error', (err) => destroyStreams(err));
  xstream.on('error', (err) => destroyStreams(err));

  debug('beginning extraction and repackaging process');

  mainstream = new Transform({
    // ? Necessary since upstream writes to xstream may finish before all
    // ? repacked chunks are flushed downstream (via pstream).
    allowHalfOpen: true,

    // ! WARNING: `construct` is called twice (once for read side, once for
    // ! write side) and so DOES NOT BEHAVE LIKE A JS/ES5 CLASS CONSTRUCTOR
    // ! since the constructor function is executed -> TWICE <-
    // construct(begin) {},

    // ? One incoming chunk written to xstream could result in several entry
    // ? events, which could then result in several repacked chunks flushed
    // ? downstream (via pstream).
    transform(chunk, encoding, next) {
      !xstream.write(chunk, encoding)
        ? // ? Respect backpressure
          xstream.once('drain', next)
        : // ? Give other callbacks in microtask queue a chance to run
          process.nextTick(next);
    },

    flush(end) {
      debug('ending extraction and repackaging process');
      // ? Trigger pstream finalization and flush the final extracted chunk(s)
      // ? downstream (via xstream).
      xstream.end(() => {
        end();
      });
    }
  });

  return mainstream;
}
