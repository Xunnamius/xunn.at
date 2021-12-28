import { setupTestDb } from 'testverse/db';

describe('[run using non-deferred setupTestDb]', () => {
  const { destroyDb, getClient, getDb, hydrateDb, initializeDb, reinitializeServer } =
    setupTestDb();

  describe('::getClient', () => {
    it('works as expected', async () => {
      expect.hasAssertions();
    });
  });

  describe('::getDb', () => {
    it('works as expected', async () => {
      expect.hasAssertions();
    });
  });

  describe('::overwriteMemory', () => {
    it('works as expected', async () => {
      expect.hasAssertions();
    });
  });

  describe('::closeClient', () => {
    it('works as expected', async () => {
      expect.hasAssertions();
    });
  });

  describe('::destroyDb', () => {
    it('works as expected', async () => {
      expect.hasAssertions();
    });
  });

  describe('::getNameFromAlias', () => {
    it('works as expected', async () => {
      expect.hasAssertions();
    });
  });

  describe('::initializeDb', () => {
    it('works as expected', async () => {
      expect.hasAssertions();
    });
  });

  describe('::hydrateDb', () => {
    it('works as expected', async () => {
      expect.hasAssertions();
    });
  });

  describe('::setupTestDb', () => {
    it('works as expected', async () => {
      expect.hasAssertions();
    });
  });
});

describe('[run using deferred setupTestDb]', () => {
  describe('::setupTestDb', () => {
    it('works as expected', () => {
      expect.hasAssertions();
    });
  });
});
