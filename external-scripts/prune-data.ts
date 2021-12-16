import { debugNamespace as namespace } from 'universe/constants';
import { getEnv } from 'universe/backend/env';
import { ExternalError, IllegalExternalEnvironmentError } from 'universe/error';
import { getDb } from 'universe/backend/db';
import { toss } from 'toss-expression';
import { debugFactory } from 'multiverse/debug-extended';

const debugNamespace = `${namespace}:prune-data`;

const log = debugFactory(debugNamespace);
const debug = debugFactory(debugNamespace);

// eslint-disable-next-line no-console
log.log = console.info.bind(console);

if (!getEnv().DEBUG && getEnv().NODE_ENV != 'test') {
  debugFactory.enable(`${debugNamespace},${debugNamespace}:*`);
  debug.enabled = false;
}

const getCollectionLimits = (env: ReturnType<typeof getEnv>) => {
  const limits = {
    'request-log':
      env.PRUNE_DATA_MAX_LOGS ||
      toss(
        new IllegalExternalEnvironmentError(
          'PRUNE_DATA_MAX_LOGS must be greater than zero'
        )
      ),
    'limited-log-mview':
      env.PRUNE_DATA_MAX_BANNED ||
      toss(
        new IllegalExternalEnvironmentError(
          'PRUNE_DATA_MAX_BANNED must be greater than zero'
        )
      )
  };

  debug('limits: %O', limits);
  return limits;
};

export default async function main() {
  try {
    const limits = getCollectionLimits(getEnv());
    const db = await getDb({ name: 'system', external: true });

    await Promise.all(
      Object.entries(limits).map(async ([collectionName, limitObj]) => {
        const { limit: limitThreshold, orderBy } =
          typeof limitObj == 'number' ? { limit: limitObj, orderBy: '_id' } : limitObj;

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
    throw new ExternalError(`${e instanceof Error ? e.message : e}`);
  }
}

!module.parent &&
  main().catch((e) => log.extend('<exception>')(e.message || e.toString()));
