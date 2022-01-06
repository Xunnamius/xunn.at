import * as util from 'util';
import { ValidationError } from 'universe/error';
import { Transform, pipeline } from 'stream';
import { extract as extractStream, pack as repackStream } from 'tar-stream';
import { name as pkgName } from 'package';
import { debugFactory } from 'multiverse/debug-extended';

import type { Headers } from 'tar-stream';
import type { Writable, Readable } from 'stream';

const promisedPipeline = util.promisify(pipeline);
const debug = debugFactory(`${pkgName}:github-pkg`);

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
export function extractSubdirAndRepack({ subdir }: { subdir: string }) {
  subdir = subdir ? (subdir.endsWith('/') ? subdir.slice(0, -1) : subdir) : '';

  const xstream = extractStream();
  const pstream = repackStream();

  const destroyStreams = (mainstream: Transform, error: Error) => {
    debug('destroying pipeline with error: ', error);
    mainstream.destroy(error);
    xstream.destroy();
    pstream.destroy();
  };

  let tarRoot: string | null = null;
  let targetRoot: string | null = null;
  let newRoot: string | null = null;
  let tarIsEmpty = true;

  xstream.on('entry', (headers, readableEntryStream, next) => {
    if (!subdir) {
      tarIsEmpty = false;
      debug('no subdir detected; transform stream is in passthrough mode');
      pipeline(readableEntryStream, pstream.entry(headers), (err) => next(err));
    } else {
      if (tarRoot === null) {
        if (headers.type != 'directory') {
          const error = new ValidationError(
            'invalid archive: first entry must be a directory'
          );
          debug('propagating error: ', error);
          next(error);
        } else {
          tarRoot = headers.name;
          targetRoot = `${tarRoot}${subdir}/`;
          newRoot = `${subdir.split('/').slice(-1)[0]}/`;

          debug('updated tarRoot: ', tarRoot);
          debug('updated targetRoot: ', targetRoot);
          debug('updated newRoot: ', newRoot);

          // ? Ignore this entry
          readableEntryStream.resume().once('end', () => next());
        }
      } else if (tarRoot && targetRoot && headers.name.startsWith(tarRoot)) {
        // ? Exclude unwanted files/directories
        if (headers.name.startsWith(targetRoot)) {
          tarIsEmpty = false;
          // ? Modify file path if necessary
          headers.name = `${newRoot}${headers.name.slice(targetRoot.length)}`;

          debug('including entry: ', headers.name);

          // ? Commit modifications
          pipeline(readableEntryStream, pstream.entry(headers), (err) => next(err));
        } else {
          debug('excluding entry: ', headers.name);
          // ? Ignore this entry
          readableEntryStream.resume().once('end', () => next());
        }
      } else {
        const error = new ValidationError(
          'invalid archive: multi-directory root not allowed'
        );
        debug('propagating error: ', error);
        next(error);
      }
    }
  });

  return new Transform({
    // ? Necessary since upstream writes to xstream may finish before all
    // ? outgoing chunks are flushed downstream by pstream.
    allowHalfOpen: true,

    construct(begin) {
      /* istanbul ignore next */
      pstream.on('error', (err) => destroyStreams(this, err));
      xstream.on('error', (err) => destroyStreams(this, err));

      pstream.on('data', (chunk) => {
        // ? Send outgoing chunk downstream.
        this.push(chunk);
      });

      xstream.on('finish', () => {
        if (tarIsEmpty) {
          destroyStreams(this, new ValidationError(`invalid subdirectory: ${subdir}`));
        } else {
          debug('flushing last chunks downstream');
          // ? Flush the final outgoing chunk(s) downstream.
          pstream.finalize();
        }
      });

      debug('beginning extraction and repackaging process');
      begin();
    },

    // ? One incoming chunk written to xstream could result in several entry
    // ? events, which could then result in several outgoing chunks flushed
    // ? downstream (via pstream).
    transform(chunk, encoding, next) {
      // ? Respect backpressure
      !xstream.write(chunk, encoding)
        ? xstream.once('drain', next)
        : // ? Give other callbacks in microtask queue a chance to run
          process.nextTick(next);
    },

    flush(end) {
      debug('ending extraction and repackaging process');
      // ? Trigger pstream finalization and flush the final outgoing chunk(s)
      // ? downstream.
      xstream.end(() => {
        end();
      });
    }
  });
}
