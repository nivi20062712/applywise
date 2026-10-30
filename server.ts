import express from 'express';
import path from 'node:path';
import { app } from './server/app';

const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  if (!isProduction) {
    let viteMiddleware: express.RequestHandler | null = null;
    const viteReady = import('vite')
      .then(({ createServer }) =>
        createServer({
          server: { middlewareMode: true },
          appType: 'spa',
        })
      )
      .then((vite) => {
        viteMiddleware = vite.middlewares;
      });

    app.use(async (req, res, next) => {
      if (!viteMiddleware) {
        await viteReady;
      }
      if (viteMiddleware) {
        return viteMiddleware(req, res, next);
      }
      next();
    });
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ApplyWise full-stack server running on http://0.0.0.0:${PORT}`);
    if (!process.env.NEBIUS_API_KEY) {
      console.warn('[WARNING] NEBIUS_API_KEY is missing. AI offline: set NEBIUS_API_KEY on the server and restart.');
    }
  });
}

startServer();
