import { debugNamespace as namespace } from 'universe/constants';
import { getEnv } from 'universe/backend/env';
import { AppError, InvalidEnvironmentError } from 'named-app-errors';
import { getDb } from 'multiverse/mongo-schema';
import { toss } from 'toss-expression';
import { debugFactory } from 'multiverse/debug-extended';

const debugNamespace = `${namespace}:prune-data`;

const log = debugFactory(debugNamespace);
const debug = debugFactory(debugNamespace);

type DataLimit = number | { limit: number; orderBy: string };

// eslint-disable-next-line no-console
log.log = console.info.bind(console);

if (!getEnv().DEBUG && getEnv().NODE_ENV != 'test') {
  debugFactory.enable(`${debugNamespace},${debugNamespace}:*`);
  debug.enabled = false;
}

const getCollectionLimits = (env: ReturnType<typeof getEnv>) => {
  const limits: Record<string, DataLimit> = {
    'request-log':
      env.PRUNE_DATA_MAX_LOGS && env.PRUNE_DATA_MAX_LOGS > 0
        ? env.PRUNE_DATA_MAX_LOGS
        : toss(
            new InvalidEnvironmentError('PRUNE_DATA_MAX_LOGS must be greater than zero')
          ),
    'limited-log':
      env.PRUNE_DATA_MAX_BANNED && env.PRUNE_DATA_MAX_BANNED > 0
        ? env.PRUNE_DATA_MAX_BANNED
        : toss(
            new InvalidEnvironmentError('PRUNE_DATA_MAX_BANNED must be greater than zero')
          )
  };

  debug('limits: %O', limits);
  return limits;
};

/**
 * Runs maintenance on the database, ensuring collections do not grow too large.
 */
const invoked = async () => {
  try {
    const limits = getCollectionLimits(getEnv());
    const db = await getDb({ name: 'root' });

    await Promise.all(
      Object.entries(limits).map(async ([collectionName, limitObj]) => {
        const { limit: limitThreshold, orderBy } =
          typeof limitObj == 'number'
            ? { limit: limitObj, orderBy: '_id' }
            : /* istanbul ignore next */ limitObj;

        const subLog = log.extend(collectionName);
        const collection = db.collection(collectionName);
        const total = await collection.countDocuments();

        const cursor = collection
          .find()
          .sort({ [orderBy]: -1 })
          .skip(limitThreshold)
          .limit(1);

        const thresholdEntry = await cursor.next();

        if (thresholdEntry) {
          const result = await collection.deleteMany({
            [orderBy]: { $lte: thresholdEntry[orderBy] }
          });

          subLog(`pruned ${result.deletedCount}/${total} "${collectionName}" entries`);
          debug(`sorted "${collectionName}" by "${orderBy}"`);
        } else {
          subLog(
            `no prunable "${collectionName}" entries (${total} <= ${limitThreshold})`
          );
        }

        await cursor.close();
      })
    );

    log('execution complete');
  } catch (e) {
    throw new AppError(`${e}`);
  }
};

export default invoked().catch((e: Error) => {
  debug.error(e.message);
  process.exit(2);
});
