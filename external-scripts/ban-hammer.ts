import { debugNamespace as namespace } from 'universe/constants';
import { getEnv } from 'universe/backend/env';
import { AppError, InvalidAppEnvironmentError } from 'named-app-errors';
import { closeClient, getDb } from 'multiverse/mongo-schema';
import { debugFactory } from 'multiverse/debug-extended';

const debugNamespace = `${namespace}:ban-hammer`;

const oneSecondInMs = 1000;
const log = debugFactory(debugNamespace);
const debug = debugFactory(debugNamespace);

// eslint-disable-next-line no-console
log.log = console.info.bind(console);

if (!getEnv().DEBUG && getEnv().NODE_ENV != 'test') {
  debugFactory.enable(`${debugNamespace},${debugNamespace}:*`);
  debug.enabled = false;
}

/**
 * Pores over request-log entries and drops the ban hammer on rule breaking
 * clients.
 */
const invoked = async () => {
  try {
    const {
      BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS: calledEverySeconds,
      BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: maxRequestsPerWindow,
      BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: resolutionWindowSeconds,
      BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: defaultBanTimeMinutes,
      BAN_HAMMER_RECIDIVISM_PUNISH_MULTIPLIER: punishMultiplier
    } = getEnv();

    if (!calledEverySeconds || !(Number(calledEverySeconds) > 0)) {
      throw new InvalidAppEnvironmentError(
        'BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS must be greater than zero'
      );
    }

    if (!maxRequestsPerWindow || !(Number(maxRequestsPerWindow) > 0)) {
      throw new InvalidAppEnvironmentError(
        'BAN_HAMMER_MAX_REQUESTS_PER_WINDOW must be greater than zero'
      );
    }

    if (!resolutionWindowSeconds || !(Number(resolutionWindowSeconds) > 0)) {
      throw new InvalidAppEnvironmentError(
        'BAN_HAMMER_RESOLUTION_WINDOW_SECONDS must be greater than zero'
      );
    }

    if (!defaultBanTimeMinutes || !(Number(defaultBanTimeMinutes) > 0)) {
      throw new InvalidAppEnvironmentError(
        'BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES must be greater than zero'
      );
    }

    if (!punishMultiplier || !(Number(punishMultiplier) > 0)) {
      throw new InvalidAppEnvironmentError(
        'BAN_HAMMER_RECIDIVISM_PUNISH_MULTIPLIER must be greater than zero'
      );
    }

    const calledEveryMs = oneSecondInMs * calledEverySeconds;
    const defaultBanTimeMs = oneSecondInMs * 60 * defaultBanTimeMinutes;
    const resolutionWindowMs = oneSecondInMs * resolutionWindowSeconds;
    const db = await getDb({ name: 'root' });

    const pipeline = [
      {
        $limit: 1
      },
      {
        $project: { _id: 1 }
      },
      {
        $project: { _id: 0 }
      },
      {
        $lookup: {
          from: 'request-log',
          as: 'headerBased',
          pipeline: [
            {
              $match: {
                header: { $ne: null },
                $expr: {
                  $gte: [
                    '$createdAt',
                    { $subtract: [{ $toLong: '$$NOW' }, calledEveryMs] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: {
                  header: '$header',
                  interval: {
                    $subtract: [
                      '$createdAt',
                      { $mod: ['$createdAt', resolutionWindowMs] }
                    ]
                  }
                },
                count: { $sum: 1 }
              }
            },
            {
              $match: {
                count: { $gt: maxRequestsPerWindow }
              }
            },
            {
              $project: {
                header: '$_id.header',
                until: { $add: [{ $toLong: '$$NOW' }, defaultBanTimeMs] }
              }
            },
            {
              $project: {
                _id: 0,
                count: 0
              }
            }
          ]
        }
      },
      {
        $lookup: {
          from: 'request-log',
          as: 'ipBased',
          pipeline: [
            {
              $match: {
                $expr: {
                  $gte: [
                    '$createdAt',
                    { $subtract: [{ $toLong: '$$NOW' }, calledEveryMs] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: {
                  ip: '$ip',
                  interval: {
                    $subtract: [
                      '$createdAt',
                      { $mod: ['$createdAt', resolutionWindowMs] }
                    ]
                  }
                },
                count: { $sum: 1 }
              }
            },
            {
              $match: {
                count: { $gt: maxRequestsPerWindow }
              }
            },
            {
              $project: {
                ip: '$_id.ip',
                until: { $add: [{ $toLong: '$$NOW' }, defaultBanTimeMs] }
              }
            },
            {
              $project: {
                _id: 0,
                count: 0
              }
            }
          ]
        }
      },
      {
        $lookup: {
          from: 'limited-log',
          as: 'previous',
          pipeline: [
            {
              $match: {
                $expr: {
                  $gte: [
                    '$until',
                    {
                      $subtract: [
                        { $toLong: '$$NOW' },
                        defaultBanTimeMs * punishMultiplier
                      ]
                    }
                  ]
                }
              }
            },
            {
              $project: {
                _id: 0
              }
            }
          ]
        }
      },
      {
        $project: {
          union: { $concatArrays: ['$headerBased', '$ipBased', '$previous'] }
        }
      },
      {
        $unwind: {
          path: '$union'
        }
      },
      {
        $replaceRoot: {
          newRoot: '$union'
        }
      },
      {
        $group: {
          _id: {
            ip: '$ip',
            header: '$header'
          },
          count: {
            $sum: 1
          },
          until: {
            $max: '$until'
          }
        }
      },
      {
        $set: {
          until: {
            $cond: {
              if: { $ne: ['$count', 1] },
              then: {
                $max: [
                  {
                    $add: [{ $toLong: '$$NOW' }, defaultBanTimeMs * punishMultiplier]
                  },
                  '$until'
                ]
              },
              else: '$until'
            }
          },
          ip: '$_id.ip',
          header: '$_id.header'
        }
      },
      {
        $project: {
          count: 0,
          _id: 0
        }
      },
      {
        $out: 'limited-log'
      }
    ];

    debug('aggregation pipeline: %O', pipeline);

    const cursor = db.collection('request-log').aggregate(pipeline);

    await cursor.next();
    await cursor.close();
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
