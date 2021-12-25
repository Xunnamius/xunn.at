import { ValidationError } from 'universe/error';
import { Transform, pipeline } from 'stream';
import { pipeline as promisedPipeline } from 'stream/promises';
import { extract as extractStream, pack as repackStream } from 'tar-stream';

import type { Headers } from 'tar-stream';

export type Entry = { headers: Headers; data: string };

export function getEntries(entries: Entry[]): NodeJS.WritableStream;
export function getEntries(stream: NodeJS.ReadableStream): Promise<Entry[]>;
export function getEntries(
  arg: NodeJS.ReadableStream | Entry[]
): NodeJS.WritableStream | Promise<Entry[]> {
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

export function extractSubdirAndRepack({ subdir }: { subdir: string }) {
  subdir = subdir ? (subdir.endsWith('/') ? subdir.slice(0, -1) : subdir) : '';

  const xstream = extractStream();
  const pstream = repackStream();

  const destroyStreams = (mainstream: Transform, error: Error) => {
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
      pipeline(readableEntryStream, pstream.entry(headers), (err) => next(err));
    } else {
      if (tarRoot === null) {
        if (headers.type != 'directory') {
          next(new ValidationError('invalid archive: first entry must be a directory'));
        } else {
          tarRoot = headers.name;
          targetRoot = `${tarRoot}${subdir}/`;
          newRoot = `${subdir.split('/').slice(-1)[0]}/`;
          // ? Ignore this entry
          readableEntryStream.resume().once('end', () => next());
        }
      } else if (tarRoot && targetRoot && headers.name.startsWith(tarRoot)) {
        // ? Exclude unwanted files/directories
        if (headers.name.startsWith(targetRoot)) {
          tarIsEmpty = false;
          // ? Modify file path if necessary
          headers.name = `${newRoot}${headers.name.slice(targetRoot.length)}`;
          // ? Commit modifications
          pipeline(readableEntryStream, pstream.entry(headers), (err) => next(err));
        } else {
          // ? Ignore this entry
          readableEntryStream.resume().once('end', () => next());
        }
      } else {
        next(new ValidationError('invalid archive: multi-directory root not allowed'));
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
          // ? Flush the final outgoing chunk(s) downstream.
          pstream.finalize();
        }
      });

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
      // ? Trigger pstream finalization and flush the final outgoing chunk(s)
      // ? downstream.
      xstream.end(() => {
        end();
      });
    }
  });
}
