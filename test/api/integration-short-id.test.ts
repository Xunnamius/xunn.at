import { useMockDateNow } from 'multiverse/mongo-common';
import { setupMemoryServerOverride } from 'multiverse/mongo-test';
import {} from 'universe/pages/api/[shortId]';

setupMemoryServerOverride();
useMockDateNow();

test.todo('this');
