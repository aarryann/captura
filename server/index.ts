/* eslint-disable no-console */
// {"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.oM7HJV9tjc0TSdiVdS6jje0QgejmKa-uoPSdm1JVNJ4"}
import nextApp from 'next';
import express, { Request, Response, NextFunction } from 'express';
import { parse } from 'url';
import { join } from 'path';
import get from 'lodash.get';
import compression from 'compression';
import { ApolloServer } from 'apollo-server-express';
import helmet from 'helmet';
import { createServer } from 'http';
import cors from 'cors';
import config from './config';
import httpRedirect from './lib/http-redirect';
import resolvers from './resolvers';
import typeDefs from './typedefs';
import { getMe, knex, pubsub } from './helpers/utils';

const { IS_PROD, CUSTOM_ENV, PORT } = config;
const nextServer = nextApp({ dev: !IS_PROD });
const handle = nextServer.getRequestHandler();

nextServer.prepare().then(() => {
  const whitelist = ['http://localhost:3000', 'http://localhost:4812', 'http://localhost:4811'];
  const corsOptions = {
    origin: (origin, callback) => {
      if (whitelist.indexOf(origin) !== -1 || !origin) {
        callback(null, true);
      } else {
        callback(new Error(`Not allowed by CORS - Origin - ${origin}`));
      }
    },
    optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
  };
  const app = express();
  app.options('*', cors()); // include before other routes
  app.use('*', cors(corsOptions));
  app.enable('trust proxy');
  app.use(helmet());
  if (IS_PROD) {
    // compression should be setup in reverse proxy on the server,
    // it is enabled on local for testing performance
    if (CUSTOM_ENV === 'local') {
      app.use(compression());
    }
    app.use(httpRedirect());

    app.get('/*', (req: Request, res: Response, next: NextFunction) => {
      if (req.headers && req.headers.host && req.headers.host.match && req.headers.host.match(/^www/) !== null) {
        res.redirect(`https://${req.headers.host.replace(/^www\./, '')}${req.url}`);
      }
      next();
    });
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    const parsedUrl = parse(req.url, true);
    const pathname = get(parsedUrl, 'pathname');
    if (pathname === '/service-worker.js') {
      const filePath = join(__dirname, '../../.next', pathname);

      return nextServer.serveStatic(req, res, filePath);
    }
    return next();
  });

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    formatError: (error) => ({
      message: error.message,
      locations: error.locations,
      stack: error.stack ? error.stack.split('\n') : [],
      path: error.path,
    }),
    context: async ({ req }) => {
      const rbq = (req && req.body && req.body.query) || '';
      let ctx = { userId: 0, token: null, conn: null };
      if (rbq.length > 1) {
        const ignoreList = ['login', 'tenantByUrl', 'signup', 'IntrospectionQuery'];
        let check = true;
        for (let i = 0; i < ignoreList.length; i += 1) {
          const word = ignoreList[i];
          if (rbq.indexOf(word) >= 0) {
            check = false;
            break;
          }
        }
        ctx = (check && { ...(await getMe(req)), conn: { knex, pubsub } }) || { ...ctx, conn: { knex, pubsub } };
      }
      return ctx;
    },
  });
  server.applyMiddleware({ app, path: '/graphql' });

  app.get('*', (req: Request, res: Response) => handle(req, res));
  app.post('*', (req: Request, res: Response) => handle(req, res));

  const httpServer = createServer(app);
  server.installSubscriptionHandlers(httpServer);
  httpServer.listen({ port: PORT }, () => {
    console.log(`🚀 Server ready at http://localhost:${PORT}${server.graphqlPath}`);
    console.log(`🚀 Subscriptions ready at ws://localhost:${PORT}${server.subscriptionsPath}`);
  });
});