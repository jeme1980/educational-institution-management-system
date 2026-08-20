import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';

const browserDist = join(import.meta.dirname, '../dist/app/browser');
const indexFile = join(browserDist, 'index.html');
if (!existsSync(indexFile)) {
  throw new Error('Production web artifact is missing. Run npm run build:web before npm run start:web.');
}

const app = express();
const isProduction = process.env['NODE_ENV'] === 'production' || process.env['WEB_PRODUCTION'] === 'true';
const connectSources = new Set(["'self'"]);
for (const origin of (process.env['WEB_API_ORIGINS'] || '').split(',')) {
  const normalized = origin.trim().replace(/\/$/, '');
  if (normalized) connectSources.add(normalized);
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src ${[...connectSources].join(' ')}`,
  "frame-ancestors 'none'",
  ...(isProduction ? ['upgrade-insecure-requests'] : []),
].join('; ');

app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', contentSecurityPolicy);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(express.static(browserDist, {
  index: false,
  redirect: false,
  maxAge: 0,
  setHeaders(res, filePath) {
    if (/[\\/]index\.html$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store');
      res.removeHeader('ETag');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));
app.use((req, res, next) => {
  const looksLikeAsset = /\.[a-z0-9]+$/i.test(req.path);
  if (req.method !== 'GET' || looksLikeAsset || req.path === '/api' || req.path.startsWith('/api/') || !req.accepts('html')) return next();
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(indexFile);
});
app.use((_req, res) => res.sendStatus(404));

const port = Number(process.env['WEB_PORT'] || 3000);
const server = app.listen(port, () => console.log(`Angular SPA listening on http://localhost:${port}`));
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; stopping SPA server.`);
  server.close((error) => {
    if (error) {
      console.error('SPA server shutdown failed:', error.message);
      process.exitCode = 1;
    }
  });
};
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
