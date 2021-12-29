# External Scripts

External scripts or "externals" are stand-alone packages that aid in the proper
functioning of the API. Each external should be run via cron as often as is
appropriate.

Note that externals must first be compiled before they can be run, i.e.
`npm run build-externals`.

## Example Template

```Typescript
import { debugNamespace as namespace } from 'universe/constants';
import { getEnv } from '@xunnamius/next-env';
import { ExternalError, IllegalExternalEnvironmentError } from 'universe/error';
import { getDb, closeDb } from '@xunnamius/mongo-schema';
import { debugFactory } from 'multiverse/debug-extended';

// TODO:
const debugNamespace = `${namespace}:EXTERNAL_SCRIPT_NAME_HERE`;

const log = debugFactory(debugNamespace);
const debug = debugFactory(debugNamespace);

log.log = console.info.bind(console);

if (!getEnv().DEBUG && getEnv().NODE_ENV != 'test') {
  debugFactory.enable(`${debugNamespace},${debugNamespace}:*`);
  debug.enabled = false;
}

export default async function main() {
  try {
    log('initializing');

    // eslint-disable-next-line no-empty-pattern
    const {
      // TODO: ...
    } = getEnv();

    // TODO:
    void ExternalError, IllegalExternalEnvironmentError;

    log('connecting to external database');

    const db = await getDb({ external: true });

    // TODO:
    void db;

    debug('closing connection');
    await closeDb();
    log('execution complete');
  } catch (e) {
    throw new ExternalError(e.message || e.toString());
  }
}

!module.parent && main().catch((e) => log.extend('<exception>')(e.message || e.toString()));
```
