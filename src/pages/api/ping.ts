import { sendHttpOk } from 'multiverse/next-api-respond';
import { withMiddleware } from 'universe/backend/middleware';

// ? https://nextjs.org/docs/api-routes/api-middlewares#custom-config
export { defaultConfig as config } from 'universe/backend/api';

/**
 * An endpoint to test if the API is up and reachable.
 */
export default withMiddleware(
  async (req, res) => {
    const { name = 'Mr. World' } = req.query;
    sendHttpOk(res, {
      message: `Hello to ${name} at ${new Date().toLocaleString()}`
    });
  },
  { options: { allowedMethods: ['GET'] } }
);
