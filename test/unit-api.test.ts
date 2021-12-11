import { testApiHandler } from 'next-test-api-route-handler';
import { asMockedNextApiMiddleware } from 'testverse/setup';
import { DUMMY_KEY as KEY } from 'universe/backend';
import { wrapHandler } from 'universe/backend/middleware';
import { asMockedFunction } from '@xunnamius/jest-types';
import Endpoint, { config as Config } from 'universe/pages/api/[shortId]';

jest.mock('universe/backend');
jest.mock('universe/backend/middleware');

const api = Endpoint as typeof Endpoint & { config?: typeof Config };
api.config = Config;

beforeEach(() => {
  asMockedNextApiMiddleware(wrapHandler);
  void asMockedFunction;
});

describe('api', () => {
  describe('/ [GET]', () => {
    test.todo('this');
  });
});
