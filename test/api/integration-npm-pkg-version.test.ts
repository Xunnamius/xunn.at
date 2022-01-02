import { useMockDateNow } from 'multiverse/mongo-common';
import { setupMemoryServerOverride } from 'multiverse/mongo-test';
import {} from 'universe/pages/api/npm-pkg-version/[...pkgName]';

setupMemoryServerOverride();
useMockDateNow();

test.todo('this');
test.todo('works with namespaced packages');
