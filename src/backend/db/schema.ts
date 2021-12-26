import type { DbSchema } from 'universe/backend/db';

export const schema: DbSchema = {
  databases: {
    'global-api--system': {
      collections: [
        {
          name: 'auth',
          indices: [{ indexSpec: 'token', options: { unique: true } }]
        },
        {
          name: 'request-log',
          indices: [{ indexSpec: 'token' }, { indexSpec: 'ip' }]
        },
        {
          name: 'limited-log-mview',
          indices: [{ indexSpec: 'token' }, { indexSpec: 'ip' }]
        }
      ]
    },
    'global-api--xunn-at': {
      collections: [
        {
          name: 'link-map',
          indices: [
            {
              indexSpec: 'shortId',
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
