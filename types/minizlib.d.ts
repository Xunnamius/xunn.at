/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'minizlib' {
  import Minipass from 'minipass';
  import zlib from 'zlib';

  // Exports only from typings
  export { constants } from 'zlib';

  type BrotliMode = 'BrotliCompress' | 'BrotliDecompress';
  type ZlibMode =
    | 'Gzip'
    | 'Gunzip'
    | 'Deflate'
    | 'Inflate'
    | 'DeflateRaw'
    | 'InflateRaw'
    | 'Unzip';

  interface ZlibBaseOptions extends Minipass.Options {
    flush?: number | undefined;
    finishFlush?: number | undefined;
  }

  interface ZlibOptions extends ZlibBaseOptions {
    level?: number | undefined;
    strategy?: number | undefined;
  }

  declare class ZlibBase extends Minipass {
    readonly ended: boolean;
    constructor(opts?: ZlibBaseOptions & zlib.BrotliOptions, mode: BrotliMode);
    constructor(opts?: ZlibBaseOptions & zlib.ZlibOptions, mode: ZlibMode);

    close(): void;
    reset(): void;
    flush(flushFlag?: number): void;

    end(chunk: any, cb?: () => void): void;
    end(chunk?: any, encoding?: string | null, cb?: () => void): void;

    write(chunk: any, cb?: () => void): boolean;
    write(chunk?: any, encoding?: string | null, cb?: () => void): boolean;
  }

  declare class Zlib extends ZlibBase {
    constructor(opts?: ZlibOptions & zlib.ZlibOptions, mode: ZlibMode);

    params(level?: number, strategy?: number): void;
  }

  export class Deflate extends Zlib {
    constructor(opts?: ZlibOptions & zlib.ZlibOptions);
  }

  export class Inflate extends Zlib {
    constructor(opts?: ZlibOptions & zlib.ZlibOptions);
  }

  export class Gzip extends Zlib {
    constructor(opts?: ZlibOptions & zlib.ZlibOptions);
  }

  export class Gunzip extends Zlib {
    constructor(opts?: ZlibOptions & zlib.ZlibOptions);
  }

  export class DeflateRaw extends Zlib {
    constructor(opts?: ZlibOptions & zlib.ZlibOptions);
  }

  export class InflateRaw extends Zlib {
    constructor(opts?: ZlibOptions & zlib.ZlibOptions);
  }

  export class Unzip extends Zlib {
    constructor(opts?: ZlibOptions & zlib.ZlibOptions);
  }

  declare class Brotli extends ZlibBase {
    constructor(opts?: ZlibOptions & zlib.BrotliOptions, mode: BrotliMode);
  }

  export class BrotliCompress extends Brotli {
    constructor(opts?: ZlibOptions & zlib.BrotliOptions);
  }

  export class BrotliDecompress extends Brotli {
    constructor(opts?: ZlibOptions & zlib.BrotliOptions);
  }
}
