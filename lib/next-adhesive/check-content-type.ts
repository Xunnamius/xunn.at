import { debugFactory } from 'multiverse/debug-extended';
import { ValidHttpMethod } from '@xunnamius/types';
import { InvalidAppConfigurationError } from 'named-app-errors';
import { toss } from 'toss-expression';

import {
  sendHttpBadContentType,
  sendHttpBadRequest
} from 'multiverse/next-api-respond';

import type { NextApiRequest, NextApiResponse } from 'next';
import type { MiddlewareContext } from 'multiverse/next-api-glue';

const debug = debugFactory('next-adhesive:check-content-type');

/**
 * The shape of a simple configuration object.
 */
export type AllowedContentTypesConfig = string[] | 'any' | 'none';

/**
 * The shape of a complex configuration object.
 */
export type AllowedContentTypesPerMethodConfig = {
  [method in ValidHttpMethod]?: AllowedContentTypesConfig;
};

export type Options = {
  /**
   * A string, a mapping, or an array of media types this endpoint is
   * allowed to receive.
   *
   * If the string `"any"` is provided, any Content-Type header will be allowed,
   * including requests without a Content-Type header.
   *
   * If the string `"none"` is provided, only requests without a Content-Type
   * header will be allowed. Similarly, `"none"` can also be included in the
   * array form to indicate that requests without a Content-Type header are
   * allowed in addition to those with a listed media type.
   *
   * If a plain object is provided, it is assumed to be a mapping of HTTP method
   * keys and media type values where each value is one of the string `"any"` or
   * `"none"` or an array of media types / `"none"`s. In this form, these
   * constraints are applied per request method.
   *
   * By default, _all_ requests using `POST`, `PUT`, and `PATCH` methods, or any
   * request _with_ a Content-Type header, _will always be rejected_ unless
   * configured otherwise. Requests _without_ a Content-Type header that are
   * using methods other than `POST`, `PUT`, and `PATCH` _will always be
   * allowed_ unless explicitly configured via mapping.
   *
   * @see https://www.iana.org/assignments/media-types/media-types.xhtml
   */
  allowedContentTypes?:
    | AllowedContentTypesConfig
    | AllowedContentTypesPerMethodConfig;
};

/**
 * Rejects requests that are not using an allowed content type. This middleware
 * should usually come _after_ check-method.
 */
export default async function (
  req: NextApiRequest,
  res: NextApiResponse,
  context: MiddlewareContext<Options>
) {
  debug('entered middleware runtime');
  const { allowedContentTypes: rawAllowedContentTypes } = context.options;
  const contentType = req.headers['content-type']?.toLowerCase();
  const method = req.method?.toUpperCase();

  const configToLowercase = (
    c: AllowedContentTypesConfig
  ): AllowedContentTypesConfig => {
    return typeof c == 'string'
      ? (c.toLowerCase() as typeof c)
      : Array.isArray(c)
      ? c.map((s) => s.toLowerCase())
      : toss(
          new InvalidAppConfigurationError(
            'allowedContentTypes must adhere to type constraints'
          )
        );
  };

  // ? Ensure everything is lowercased before we begin
  const allowed = (() => {
    if (rawAllowedContentTypes) {
      if (
        Array.isArray(rawAllowedContentTypes) ||
        typeof rawAllowedContentTypes == 'string'
      ) {
        return configToLowercase(rawAllowedContentTypes);
      } else {
        for (const [subMethod, config] of Object.entries(rawAllowedContentTypes)) {
          if (config) {
            rawAllowedContentTypes[subMethod as ValidHttpMethod] =
              configToLowercase(config);
          }
        }

        return rawAllowedContentTypes;
      }
    }
  })();

  const sendError = () => {
    const error = `unrecognized or disallowed Content-Type header for method ${method}: ${
      contentType ? `"${contentType}"` : '(none)'
    }`;

    debug(`content-type check failed: ${error}`);
    sendHttpBadContentType(res, { error });
  };

  if (!method) {
    debug('content-type check failed: method is undefined');
    sendHttpBadRequest(res, { error: 'undefined method' });
  } else {
    const isPayloadMethod = ['PUT', 'POST', 'PATCH'].includes(method);

    if (!allowed) {
      if (isPayloadMethod || contentType) {
        debug(
          'content-type check failed: this request cannot be handled with the current configuration'
        );
        sendHttpBadContentType(res, {
          error: 'the server is not configured to handle this type of request'
        });
      }
    } else {
      if (allowed == 'none') {
        if (contentType) {
          return sendError();
        }
      } else if (allowed != 'any') {
        if (Array.isArray(allowed)) {
          if (isPayloadMethod || contentType) {
            const allowsNone = allowed.includes('none');
            if (!contentType) {
              if (!allowsNone) {
                return sendError();
              }
            } else if (contentType == 'none' || !allowed.includes(contentType)) {
              return sendError();
            }
          }
        } else {
          if (Object.keys(allowed).includes(method)) {
            const allowedSubset = allowed[method as ValidHttpMethod];

            if (allowedSubset == 'none') {
              if (contentType) {
                return sendError();
              }
            } else if (allowedSubset && allowedSubset != 'any') {
              const allowsNone = allowedSubset.includes('none');
              if (!contentType) {
                if (!allowsNone) {
                  return sendError();
                }
              } else if (
                contentType == 'none' ||
                !allowedSubset.includes(contentType)
              ) {
                return sendError();
              }
            }
          } else if (isPayloadMethod || contentType) {
            return sendError();
          }
        }
      }

      debug(`content-type check succeeded: type "${contentType}" is allowed`);
    }
  }
}
