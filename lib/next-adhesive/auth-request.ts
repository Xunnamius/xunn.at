import { debugFactory } from 'multiverse/debug-extended';
import {
  authenticateHeader,
  authorizeHeader,
  AuthScheme,
  AuthConstraint
} from 'multiverse/next-auth';

import {
  sendHttpUnauthenticated,
  sendHttpUnauthorized
} from 'multiverse/next-api-respond';

import type { NextApiRequest, NextApiResponse } from 'next';
import type { MiddlewareContext } from 'multiverse/next-api-glue';
import { InvalidAppConfigurationError } from 'named-app-errors';

const debug = debugFactory('next-adhesive:auth-request');

export type Options = {
  /**
   * If not `false` or falsy, accessing this endpoint requires a valid (yet
   * unfortunately named) Authorization header.
   *
   * If one or more schemes are provided, the request will be authenticated
   * using one of said schemes. If no schemes are provided, the request will be
   * authenticated using any available scheme.
   *
   * Additionally, if one or more constraints are provided, the request will be
   * authorized conditioned upon said constraints. If no constraints are
   * provided, all requests will be vacuously authorized.
   */
  requiresAuth?:
    | boolean
    | {
        allowedSchemes?: AuthScheme | AuthScheme[];
        constraints?: AuthConstraint | AuthConstraint[];
      };
};

/**
 * Rejects unauthenticatable and unauthorizable requests (via Authorization
 * header).
 */
export default async function (
  req: NextApiRequest,
  res: NextApiResponse,
  context: MiddlewareContext<Options>
) {
  debug('entered middleware runtime');

  const { authorization: header } = req.headers;

  if (
    typeof context.options.requiresAuth != 'boolean' &&
    (!context.options.requiresAuth || typeof context.options.requiresAuth != 'object')
  ) {
    throw new InvalidAppConfigurationError(
      'a valid "requiresAuth" option is missing from middleware configuration'
    );
  }

  if (context.options.requiresAuth) {
    const allowedSchemes =
      context.options.requiresAuth !== true
        ? context.options.requiresAuth?.allowedSchemes
        : undefined;

    const { authenticated, error: authenticationError } = await authenticateHeader({
      header,
      allowedSchemes
    });

    if (!authenticated || authenticationError) {
      debug(
        `authentication check failed: ${
          authenticationError || 'bad Authorization header'
        }`
      );
      sendHttpUnauthenticated(res);
    } else {
      debug('authentication check succeeded: client is authenticated');

      const constraints =
        context.options.requiresAuth !== true
          ? context.options.requiresAuth?.constraints
          : undefined;

      if (constraints) {
        debug(`authorization check required: ${constraints}`);

        const { authorized, error: authorizationError } = await authorizeHeader({
          header,
          constraints
        });

        if (!authorized || authorizationError) {
          debug(
            `authorization check failed: ${
              authorizationError || 'bad Authorization header'
            }`
          );

          sendHttpUnauthorized(res);
        }

        debug('authorization check succeeded: client is authorized');
      } else {
        debug('skipped authorization check');
      }
    }
  } else {
    debug('skipped authentication and authorization checks');
  }
}
