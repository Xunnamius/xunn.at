import { withMiddleware } from 'universe/backend/middleware';
import { githubPackageDownloadPipeline } from 'universe/backend/github-pkg';
import { resolveShortId } from 'universe/backend/request';
import { AppError } from 'universe/error';

// ? https://nextjs.org/docs/api-routes/api-middlewares#custom-config
export { defaultConfig as config } from 'universe/backend/api';

export default withMiddleware(
  async (req, res) => {
    const { shortId: rawShortId } = req.query;
    const [shortId, commitish] = rawShortId.toString().split('@');
    const shortData = await resolveShortId({ shortId: shortId.toString() });

    res.status(200);

    if (shortData.type == 'uri') {
      res.redirect(shortData.realLink);
    } else if (shortData.type == 'github-pkg') {
      const {
        pseudoFilename,
        tagPrefix,
        defaultCommit,
        type: _,
        ...repoData
      } = shortData;

      res
        .setHeader(
          'Content-Disposition',
          `attachment; filename="${pseudoFilename(commitish || defaultCommit)}"`
        )
        .setHeader('Content-Type', 'application/gzip');

      await githubPackageDownloadPipeline({
        res,
        repoData: {
          ...repoData,
          potentialCommits: commitish
            ? [commitish, `${tagPrefix}${commitish}`]
            : [defaultCommit]
        }
      });
    } else {
      throw new AppError(`"${shortData.type}" short links are not supported`);
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
