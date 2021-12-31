import { findProjectRoot, setProjectRoot } from 'multiverse/find-project-root';
import { sync as findUpSync } from 'find-up';
import { asMockedFunction } from '@xunnamius/jest-types';

jest.mock('find-up');

const mockFindUpSync = asMockedFunction(findUpSync);

describe('::findProjectRoot', () => {
  it('find the project root unless all expected paths not encountered', async () => {
    expect.hasAssertions();

    mockFindUpSync.mockImplementationOnce(() => '/some/x/path/next.config.js');

    expect(findProjectRoot()).toBe('/some/x/path');

    setProjectRoot(null);
    mockFindUpSync.mockImplementationOnce(() => undefined);
    mockFindUpSync.mockImplementationOnce(() => '/some/y/path/projector.config.js');

    expect(findProjectRoot()).toBe('/some/y/path');

    setProjectRoot(null);
    mockFindUpSync.mockImplementationOnce(() => undefined);
    mockFindUpSync.mockImplementationOnce(() => undefined);
    mockFindUpSync.mockImplementationOnce(() => '/some/z/path/.git');

    expect(findProjectRoot()).toBe('/some/z/path');

    setProjectRoot(null);
    mockFindUpSync.mockImplementation(() => undefined);

    expect(() => findProjectRoot()).toThrow('could not find project root');
  });

  it('memoizes the result', async () => {
    expect.hasAssertions();

    mockFindUpSync.mockImplementationOnce(() => '/some/x/path/next.config.js');
    expect(findProjectRoot()).toBe('/some/x/path');

    mockFindUpSync.mockImplementation(() => undefined);
    expect(findProjectRoot()).toBe('/some/x/path');
  });
});

describe('::setProjectRoot', () => {
  it('controls output of findProjectRoot', async () => {
    expect.hasAssertions();

    mockFindUpSync.mockImplementationOnce(() => '/some/w/path/next.config.js');

    setProjectRoot('/some/x/path/next.config.js');
    expect(findProjectRoot()).toBe('/some/x/path/next.config.js');
    expect(findProjectRoot()).toBe('/some/x/path/next.config.js');
    setProjectRoot(null);
    expect(findProjectRoot()).toBe('/some/w/path');
  });
});
