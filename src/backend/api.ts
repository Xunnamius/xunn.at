import { getEnv } from 'universe/backend/env';
import type { PageConfig } from 'next';

/**
 * @see https://nextjs.org/docs/api-routes/api-middlewares#custom-config
 */
export const defaultConfig: PageConfig = {
  api: {
    bodyParser: {
      get sizeLimit() {
        return getEnv().MAX_CONTENT_LENGTH_BYTES;
      }
    }
  }
};
