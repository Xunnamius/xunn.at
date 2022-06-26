import { getEnv } from 'multiverse/next-env';
import { debugFactory } from 'multiverse/debug-extended';
import { getDb } from 'multiverse/mongo-schema';

const debug = debugFactory('next-contrived:isDueForContrivedError');

/**
 * Returns `true` if a request should be rejected with a pseudo-error.
 *
 * Note that this is a per-serverless-function request counter and not global
 * across all Vercel virtual machines.
 */
export async function isDueForContrivedError() {
  const { REQUESTS_PER_CONTRIVED_ERROR: reqPerErr } = getEnv();

  if (reqPerErr) {
    const x = (await getDb({ name: 'root' })).collection('request-log');
    const count = await x.estimatedDocumentCount();

    debug(`${count}%${reqPerErr} = ${count % reqPerErr}`);

    if (count % reqPerErr == 0) {
      debug('determined request is due for contrived error');
      return true;
    }
  } else {
    debug(
      `skipped contrived error check (cause: REQUESTS_PER_CONTRIVED_ERROR=${reqPerErr})`
    );
  }

  return false;
}
