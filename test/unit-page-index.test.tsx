import { setupTestDb } from 'testverse/db';
import * as IndexPage from 'universe/pages/index';

const { getDb } = setupTestDb();

describe('pages/index', () => {
  void getDb;
  void IndexPage;

  // TODO: withMockedEnv REQUESTS_PER_CONTRIVED_ERROR: '0'
  test.todo('functions as expected');
});
