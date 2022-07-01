import { debugNamespace as namespace } from 'universe/constants';
import { getEnv } from 'universe/backend/env';
import { AppError, InvalidAppEnvironmentError } from 'named-app-errors';
import { closeClient, getDb } from 'multiverse/mongo-schema';
import { toss } from 'toss-expression';
import { debugFactory } from 'multiverse/debug-extended';

import type { Document, WithId } from 'mongodb';
import type { Promisable } from 'type-fest';

const debugNamespace = `${namespace}:prune-data`;

const log = debugFactory(debugNamespace);
const debug = debugFactory(debugNamespace);

type DataLimit =
  | number
  | {
      limit: number;
      orderBy?: string;
      deleteFn?: (thresholdEntry: WithId<Document>) => Promisable<number>;
    };

// eslint-disable-next-line no-console
log.log = console.info.bind(console);

if (!getEnv().DEBUG && getEnv().NODE_ENV != 'test') {
  debugFactory.enable(`${debugNamespace},${debugNamespace}:*`);
  debug.enabled = false;
}

// * Add new env var configurations here
const getDbCollectionLimits = (env: ReturnType<typeof getEnv>) => {
  const limits: Record<string, Record<string, DataLimit>> = {
    root: {
      'request-log':
        env.PRUNE_DATA_MAX_LOGS && env.PRUNE_DATA_MAX_LOGS > 0
          ? env.PRUNE_DATA_MAX_LOGS
          : toss(
              new InvalidAppEnvironmentError(
                'PRUNE_DATA_MAX_LOGS must be greater than zero'
              )
            ),
      'limited-log':
        env.PRUNE_DATA_MAX_BANNED && env.PRUNE_DATA_MAX_BANNED > 0
          ? env.PRUNE_DATA_MAX_BANNED
          : toss(
              new InvalidAppEnvironmentError(
                'PRUNE_DATA_MAX_BANNED must be greater than zero'
              )
            )
    }
  };

  debug('limits: %O', limits);
  return limits;
};

/**
 * Runs maintenance on the database, ensuring collections do not grow too large.
 */
const invoked = async () => {
  try {
    const limits = getDbCollectionLimits(getEnv());

    await Promise.all(
      Object.entries(limits).map(async ([dbName, dbLimitsObj]) => {
        debug(`using db "${dbName}"`);
        const db = await getDb({ name: dbName });

        await Promise.all(
          Object.entries(dbLimitsObj).map(async ([collectionName, colLimitsObj]) => {
            const name = `${dbName}.${collectionName}`;
            debug(`collection "${name}" is a target for pruning`);

            const {
              limit: limitThreshold,
              orderBy = '_id',
              deleteFn = undefined
            } = typeof colLimitsObj == 'number'
              ? { limit: colLimitsObj }
              : colLimitsObj;

            const subLog = log.extend(name);
            const collection = db.collection(collectionName);
            const total = await collection.countDocuments();

            debug(`sorting ${name} by "${orderBy}"`);
            debug(`skipping ${limitThreshold} entries"`);

            const cursor = collection
              .find()
              .sort({ [orderBy]: -1 })
              .skip(limitThreshold)
              .limit(1);

            const thresholdEntry = await cursor.next();

            if (thresholdEntry) {
              let deletedCount: number;

              if (deleteFn) {
                debug('using custom pruning strategy');
                deletedCount = await deleteFn(thresholdEntry);
              } else {
                debug('using default pruning strategy');
                deletedCount = (
                  await collection.deleteMany({
                    [orderBy]: { $lte: thresholdEntry[orderBy] }
                  })
                ).deletedCount;
              }

              subLog(`${deletedCount} pruned (${total} > ${limitThreshold})`);
            } else {
              subLog(`0 pruned (${total} <= ${limitThreshold})`);
            }

            await cursor.close();
          })
        );
      })
    );
  } catch (e) {
    throw new AppError(`${e}`);
  } finally {
    /* istanbul ignore if */
    if (['production', 'development'].includes(getEnv().NODE_ENV)) {
      await closeClient();
      log('execution complete');
      process.exit(0);
    } else {
      log('execution complete');
    }
  }
};

export default invoked().catch((e: Error) => {
  debug.error(e.message);
  process.exit(2);
});
