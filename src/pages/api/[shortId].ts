import { withMiddleware } from 'universe/backend/middleware';
import { githubPackageDownloadPipeline } from 'universe/backend/github-pkg';
import { resolveShortId } from 'universe/backend/request';

// ? https://nextjs.org/docs/api-routes/api-middlewares#custom-config
export { defaultConfig as config } from 'universe/backend/api';

export default withMiddleware(
  async (req, res) => {
    const { shortId } = req.query;
    const { type, ...shortData } = await resolveShortId({ shortId: shortId.toString() });

    res.status(200);

    if (type == 'link') {
      // TODO
    } else if (type == 'github-pkg') {
      const { pseudoFilename, ...repoData } = shortData;

      res
        .setHeader('Content-Disposition', `attachment; filename="${pseudoFilename}"`)
        .setHeader('Content-Type', 'application/gzip');

      await githubPackageDownloadPipeline({ res, repoData });
    }
  },
  {
    options: { allowedMethods: ['GET'] },
    prependUseOnError: [
      (_, res) => {
        res.removeHeader('Content-Disposition');
        res.removeHeader('Content-Type');
      }
    ]
  }
);
