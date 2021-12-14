import { withMiddleware } from 'universe/backend/middleware';
import { handlePackageRequest } from 'universe/backend/gitpkg';

// ? https://nextjs.org/docs/api-routes/api-middlewares#custom-config
export { defaultConfig as config } from 'universe/backend/api';

export default withMiddleware(
  async (req, res) => {
    await handlePackageRequest({
      query: req.query,
      requestUrl: req.url,
      parseFromUrl: true,
      response: res
    });
  },
  { options: { allowedMethods: ['GET'] } }
);
