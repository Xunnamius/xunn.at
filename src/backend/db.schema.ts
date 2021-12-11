import type { DbSchema } from 'universe/backend/db';

export const schema: DbSchema = {
  databases: {
    'global-api--system': {
      collections: ['keys', 'request-log', 'limited-log-mview']
    },
    'global-api--xunn-at': {
      collections: [
        {
          name: 'link-map',
          indices: [
            {
              indexSpec: { shortLink: 1 },
              options: { unique: true }
            }
          ]
        }
      ]
    }
  },
  aliases: {
    system: 'global-api--system',
    'xunn-at': 'global-api--xunn-at'
  }
};
