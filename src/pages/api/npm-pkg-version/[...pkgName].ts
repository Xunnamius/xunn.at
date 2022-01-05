import { withMiddleware } from 'universe/backend/middleware';
import { sendBadgeSvgResponse, getNpmPackageVersion } from 'universe/backend';

// ? https://nextjs.org/docs/api-routes/api-middlewares#custom-config
export { defaultConfig as config } from 'universe/backend/api';

/**
 * An endpoint that returns a badge showing the latest version of an npm
 * package.
 */
export default withMiddleware(
  async (req, res) => {
    let version: string | null = null;
    const {
      query: { pkgName }
    } = req;
    const pkg = [pkgName].flat().join('/');

    try {
      version = await getNpmPackageVersion(pkg);
    } catch (ignored) {
      // eslint-disable-next-line no-console
      console.warn('warn  -', ignored);
    }

    await sendBadgeSvgResponse({
      res,
      label: 'npm install',
      message: !version ? 'error' : `${pkg}@${version}`,
      color: !version ? 'red' : 'blue'
    });
  },
  { options: { allowedMethods: ['GET'] } }
);
