import { ValidationError } from 'named-app-errors';
import { Transform } from 'stream';
import { extract as extractStream, pack as repackStream } from 'tar-stream';

export function extractAndRepack({
  subdir,
  prepend
}: {
  subdir: string;
  prepend: string;
}) {
  const xstream = extractStream();
  const pstream = repackStream();

  if (prepend && !prepend.endsWith('/')) {
    throw new ValidationError(`prepend must end with "/", saw "${prepend}" instead`);
  }

  const destroyStreams = (mainstream: Transform, error: Error) => {
    mainstream.destroy(error);
    xstream.destroy();
    pstream.destroy();
  };

  let tarRoot: string | null = null;

  xstream.on('entry', (headers, entry, next) => {
    if (tarRoot === null) {
      if (headers.type != 'directory') {
        throw new ValidationError('invalid source file: first entry is not directory');
      }

      tarRoot = headers.name;
      // ? Ignore this entry
      entry.resume();
    } else if (headers.name.startsWith(tarRoot)) {
      // ? Exclude unwanted files/directories
      const dir = `${tarRoot}${subdir}`;

      if (headers.name.startsWith(dir) && headers.name.length > dir.length) {
        // ? Modify file path if necessary
        headers.name = `${prepend}${headers.name.slice(dir.length)}`;

        // ? Commit modifications
        entry.pipe(pstream.entry(headers, next));
      } else {
        // ? Ignore this entry
        entry.resume();
      }
    } else {
      throw new ValidationError('invalid source file: multiple dirs in root');
    }
  });

  return new Transform({
    construct(begin) {
      pstream.on('error', (err) => destroyStreams(this, err));
      xstream.on('error', (err) => destroyStreams(this, err));
      begin();
    },
    transform(chunk, encoding, next) {
      pstream.once('data', (chunk) => next(null, chunk));
      // * Might be a memory issue with HUGE packages since backpressure isn't
      // * respected here.
      xstream.write(chunk, encoding);
    },
    flush(next) {
      pstream.finalize();
      next();
    }
  });
}
