import { name as pkgName } from 'package';
import debugFactory from 'debug';

import {
  GuruMeditationError,
  NotFoundError,
  ItemNotFoundError,
  NotAuthorizedError,
  InvalidIdError,
  InvalidKeyError,
  ValidationError,
  AppError
} from 'universe/error';

import {
  sendHttpError,
  sendHttpNotFound,
  sendHttpUnauthorized,
  sendHttpBadRequest
} from 'multiverse/next-api-respond';

import type { JsonError } from '@xunnamius/types';
import type { MiddlewareContext } from 'multiverse/next-api-glue';
import type { NextApiRequest, NextApiResponse } from 'next';

const debug = debugFactory(`${pkgName}:glue:handle-error`);

export type Options = {
  // No options
};

export default async function (
  _req: NextApiRequest,
  res: NextApiResponse,
  context: MiddlewareContext
) {
  debug('entered middleware runtime');

  const {
    runtime: { error }
  } = context;

  const errorJson: Partial<JsonError> = (error as { message: string }).message
    ? { error: (error as { message: string }).message }
    : {};

  debug('encountered error condition: %O', errorJson.error || '(no message)');

  if (error instanceof GuruMeditationError) {
    sendHttpError(res, {
      error: 'sanity check failed: please report exactly what you did just now!'
    });
  } else if (
    error instanceof InvalidIdError ||
    error instanceof InvalidKeyError ||
    error instanceof ValidationError
  ) {
    sendHttpBadRequest(res, errorJson);
  } else if (error instanceof NotAuthorizedError) {
    sendHttpUnauthorized(res, errorJson);
  } else if (error instanceof NotFoundError || error instanceof ItemNotFoundError) {
    sendHttpNotFound(res, errorJson);
  } else if (error instanceof AppError) {
    sendHttpError(res, errorJson);
  } else {
    sendHttpError(res);
  }
}
