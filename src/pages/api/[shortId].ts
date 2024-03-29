import { name as pkgName } from 'package';

import { withMiddleware } from 'universe/backend/middleware';
import { githubPackageDownloadPipeline } from 'universe/backend/github-pkg';
import { resolveShortId, sendBadgeSvgResponse } from 'universe/backend';
import { AppError, NotImplementedError, NotFoundError } from 'universe/error';

import { debugFactory } from 'multiverse/debug-extended';

import type { NextApiRequest, NextApiResponse } from 'next';

const debug = debugFactory(`${pkgName}:github-pkg`);

// ? https://nextjs.org/docs/api-routes/api-middlewares#custom-config
export { defaultConfig as config } from 'universe/backend/api';

/**
 * An endpoint that translates short link identifiers into actual resources.
 */
export default async function (request: NextApiRequest, response: NextApiResponse) {
  let removeHeaders = () => undefined;

  return withMiddleware(
    async (req, res) => {
      const { shortId: rawShortId } = req.query;
      const [shortId, commitish] = rawShortId?.toString().split('@') || [];

      // ? Cache all responses for 60 seconds by default
      res
        .status(200)
        .setHeader('cache-control', 's-maxage=60, stale-while-revalidate');

      const { headers, ...shortData } = await resolveShortId({ shortId });

      debug('shortData: ', shortData);
      debug('headers: ', headers);

      if (headers) {
        const headerEntries = Object.entries(headers);
        headerEntries.forEach(([header, value]) => res.setHeader(header, value));
        removeHeaders = () =>
          void headerEntries.forEach(([header]) => res.removeHeader(header));
      }

      if (shortData.type == 'github-pkg') {
        const {
          pseudoFilename,
          tagPrefix,
          defaultCommit,
          type: _,
          ...repoData
        } = shortData;

        res
          .setHeader(
            'content-disposition',
            `attachment; filename="${pseudoFilename(commitish || defaultCommit)}"`
          )
          .setHeader('content-type', 'application/gzip');

        await githubPackageDownloadPipeline({
          res,
          repoData: {
            ...repoData,
            potentialCommits: commitish
              ? [commitish, `${tagPrefix}${commitish}`]
              : [defaultCommit]
          }
        });
      } else if (shortData.type == 'uri') {
        res.redirect(308, shortData.realLink);
      } else if (shortData.type == 'badge') {
        const { color, label, labelColor, message, style } = shortData;
        await sendBadgeSvgResponse({ res, color, label, labelColor, message, style });
      } else if (shortData.type == 'file') {
        // TODO: should redirect to a frontend UI at https://xunn.at/view/XXXX
        throw new NotImplementedError();
      } else {
        throw new AppError(
          `"${
            (shortData as { type: string }).type
          }" short links are not currently supported`
        );
      }
    },
    {
      options: { allowedMethods: ['GET'] },
      prependUseOnError: [
        (_, res, ctx) => {
          removeHeaders();

          res.removeHeader('content-disposition');
          res.removeHeader('content-type');

          if (!(ctx.runtime.error instanceof NotFoundError)) {
            res.removeHeader('cache-control');
          }
        }
      ]
    }
  )(request, response);
}
