import { withMiddleware } from 'universe/backend/middleware';
import { getCompatVersion, sendBadgeSvgResponse } from 'universe/backend';

// ? https://nextjs.org/docs/api-routes/api-middlewares#custom-config
export { defaultConfig as config } from 'universe/backend/api';

/**
 * An endpoint that returns a badge showing NTARH's compatibility with the
 * latest Next.js version.
 */
export default withMiddleware(
  async (_req, res) => {
    let version;

    try {
      version = await getCompatVersion();
    } catch (ignored) {
      // eslint-disable-next-line no-console
      console.warn('warn  -', ignored);
    }

    await sendBadgeSvgResponse({
      res,
      label: 'compatible with',
      message: !version ? 'error' : `next@%E2%89%A4${version}`,
      color: !version ? 'red' : 'blue'
    });
  },
  { options: { allowedMethods: ['GET'] } }
);
