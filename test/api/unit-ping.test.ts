import Endpoint, { config as Config } from 'universe/pages/api/ping';

const api = Endpoint as typeof Endpoint & { config?: typeof Config };
api.config = Config;

test.todo('ensure endpoint works as expected');
