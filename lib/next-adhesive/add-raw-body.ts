import { sendHttpTooLarge } from 'multiverse/next-api-respond';
import {
  ClientValidationError,
  InvalidAppConfigurationError
} from 'named-app-errors';
import { debugFactory } from 'multiverse/debug-extended';
import { parse } from 'content-type';
import getRawBody, { RawBodyError } from 'raw-body';
import querystring from 'node:querystring';
import { isError } from '@xunnamius/types';

import type { NextApiRequest, NextApiResponse } from 'next';
import type { MiddlewareContext } from 'multiverse/next-api-glue';

const debug = debugFactory('next-adhesive:add-raw-body');

// * https://xunn.at/source-nextjs-defaultbodylimit
const defaultRequestBodySizeLimit = '1mb';

const isRawBodyError = (e: unknown): e is RawBodyError => {
  return isError(e) && typeof (e as RawBodyError).type == 'string';
};

/**
 * The shape of an object (typically a NextApiRequest object) that has a rawBody
 * property.
 */
export type WithRawBody<T> = T & {
  /**
   * The raw request body exactly as it was received (as a string parsed by
   * `raw-body`).
   */
  rawBody: string;
};

export type Options = {
  /**
   * The byte limit of the request body. This is the number of bytes or any
   * string format supported by bytes, for example `1000`, `'500kb'` or `'3mb'`.
   *
   * @default defaultRequestBodySizeLimit (see source)
   *
   * @see https://nextjs.org/docs/api-routes/api-middlewares#custom-config
   */
  requestBodySizeLimit?: number | string | null;
};

/**
 * Type predicate function that returns `true` if the request object can
 * satisfy the `WithRawBody` type constraint.
 */
export function isNextApiRequestWithRawBody(
  req: NextApiRequest
): req is WithRawBody<NextApiRequest> {
  return (req as WithRawBody<NextApiRequest>).rawBody !== undefined;
}

/**
 * Type guard function similar to the `isNextApiRequestWithRawBody` type
 * predicate except an error is thrown if the request object cannot satisfy the
 * `WithRawBody` type constraint.
 */
export function ensureNextApiRequestHasRawBody(
  req: NextApiRequest
): req is WithRawBody<NextApiRequest> {
  if ((req as WithRawBody<NextApiRequest>).rawBody !== undefined) {
    return true;
  } else {
    throw new InvalidAppConfigurationError(
      'encountered a NextApiRequest object without a rawBody property'
    );
  }
}

/**
 * Adds a `rawBody` property onto the NextApiRequest object, which contains the
 * raw unparsed content of the request body if it exists or `undefined` if it
 * does not. The body is still parsed (using `bodyParser`) like normal using a
 * custom implementation of Next.js's `parseBody` function.
 *
 * To use this middleware, `bodyParser` must be disabled via Next.js API route
 * configuration like so:
 *
 * ```TypeScript
 * export const config = {
 *   api: {
 *     bodyParser: false
 *   },
 * }
 * ```
 *
 * Note that this middleware cannot be used with other middleware or routes that
 * also directly consume the request body in a special way, such as when using
 * streams.
 *
 * @see https://nextjs.org/docs/api-routes/api-middlewares#custom-config
 */
export default async function (
  req: NextApiRequest,
  res: NextApiResponse,
  context: MiddlewareContext<Options>
) {
  debug('entered middleware runtime');

  if (req.body !== undefined) {
    throw new InvalidAppConfigurationError(
      "Next.js's body parser must be disabled when using add-raw-body middleware"
    );
  } else if (isNextApiRequestWithRawBody(req)) {
    throw new InvalidAppConfigurationError(
      'NextApiRequest object already has a defined "rawBody" property (is the add-raw-body middleware obsolete?)'
    );
  } else {
    debug('adding "rawBody" property to request object via custom body parsing');

    // * The below code was adapted from https://xunn.at/source-nextjs-parsebody

    let contentType;

    try {
      contentType = parse(req.headers['content-type'] || 'text/plain');
    } catch {
      contentType = parse('text/plain');
    }

    const { type, parameters } = contentType;
    const encoding = parameters.charset || 'utf-8';
    const limit = context.options.requestBodySizeLimit || defaultRequestBodySizeLimit;

    let buffer;

    try {
      buffer = (await getRawBody(req, { encoding, limit })).toString();
    } catch (e) {
      if (isRawBodyError(e) && e.type == 'entity.too.large') {
        sendHttpTooLarge(res, { error: `body exceeded ${limit} size limit` });
      } else {
        throw new ClientValidationError('invalid body');
      }
    }

    if (buffer !== undefined) {
      const finalReq = req as WithRawBody<NextApiRequest>;
      finalReq.rawBody = buffer;

      if (type === 'application/json' || type === 'application/ld+json') {
        debug('secondary parsing of body as JSON data');
        if (finalReq.rawBody.length === 0) {
          // special-case empty json body, as it's a common client-side mistake
          finalReq.body = {};
        } else {
          try {
            finalReq.body = JSON.parse(finalReq.rawBody);
          } catch {
            throw new ClientValidationError('invalid JSON body');
          }
        }
      } else if (type === 'application/x-www-form-urlencoded') {
        debug('secondary parsing of body as urlencoded form data');
        finalReq.body = querystring.decode(finalReq.rawBody);
      } else {
        debug('no secondary parsing of body (passthrough)');
        finalReq.body = finalReq.rawBody;
      }
    }
  }
}
