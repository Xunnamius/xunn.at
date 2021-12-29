import { getDummyData } from 'multiverse/mongo-test';

it('works', async () => {
  expect.hasAssertions();
  const x = await getDummyData();
  expect(false).toBeTrue();
});
