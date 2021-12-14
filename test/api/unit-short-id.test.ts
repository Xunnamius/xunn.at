import Endpoint, { config as Config } from 'universe/pages/api/[shortId]';

jest.mock('universe/backend/gitpkg');
jest.mock('multiverse/next-api-glue');

const api = Endpoint as typeof Endpoint & { config?: typeof Config };
api.config = Config;

test.todo('ensure endpoint works as expected');
