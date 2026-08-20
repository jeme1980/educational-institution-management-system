import path from 'node:path';
import dotenv from 'dotenv';
import cors, { type CorsOptions } from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { contextMiddleware } from './middleware/context';
import { errorHandler } from './middleware/errorHandler.middleware';
import { asyncHandler } from './middleware/asyncHandler';
import * as generalController from './controllers/general.controller';
import authRouter from './routes/auth.routes';
import classesRouter from './routes/classes.routes';
import examsRouter from './routes/exams.routes';
import generalRouter from './routes/general.routes';
import settingsRouter from './routes/settings.routes';
import staffRouter from './routes/staff.routes';
import studentsRouter from './routes/students.routes';
import studyGroupsRouter from './routes/study-groups.routes';
import subjectsRouter from './routes/subjects.routes';
import townsRouter from './routes/towns.routes';
import auditRouter from './routes/audit.routes';
import usersRouter from './routes/users.routes';
import subscriptionRouter from './routes/subscription.routes';
import platformRouter from './routes/platform.routes';
import accountSetupRouter from './routes/account-setup.routes';
import { prisma } from './db/prisma';
import { platformPrisma } from './db/platform-prisma';
import { checkDatabaseReadiness } from './services/readiness.service';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const allowedOrigins = (process.env['CORS_ORIGINS'] || process.env['APP_URL'] || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Institution-Id', 'X-Academic-Year-Id'],
};

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 2_000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } });
  },
});

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.get('/api/health', asyncHandler(generalController.getHealth));
app.get('/api/ready', asyncHandler(generalController.getReadiness));
app.use('/api', apiLimiter, contextMiddleware);
app.use('/api', authRouter);
app.use('/api', usersRouter);
app.use('/api', subscriptionRouter);
app.use('/api', platformRouter);
app.use('/api', accountSetupRouter);
app.use('/api', studentsRouter);
app.use('/api', classesRouter);
app.use('/api', examsRouter);
app.use('/api', studyGroupsRouter);
app.use('/api', staffRouter);
app.use('/api', subjectsRouter);
app.use('/api', settingsRouter);
app.use('/api', generalRouter);
app.use('/api', townsRouter);
app.use('/api', auditRouter);

// Error middleware must be registered after every route and middleware.
app.use(errorHandler);

if (require.main === module) {
  const port = Number(process.env['PORT'] || 4000);
  const start = async () => {
    if (process.env['NODE_ENV'] === 'production') {
      const readiness = await checkDatabaseReadiness(prisma, platformPrisma);
      if (readiness.status !== 'ready') {
        throw new Error('Production startup refused an unavailable or privileged runtime database connection.');
      }
    }
    const server = app.listen(port, () => console.log(`Express API listening on http://localhost:${port}`));
    let shuttingDown = false;
    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`Received ${signal}; beginning graceful shutdown.`);
      server.close(async (error) => {
        if (error) {
          console.error('HTTP server shutdown failed:', error.message);
          process.exitCode = 1;
        }
        await Promise.allSettled([prisma.$disconnect(), platformPrisma.$disconnect()]);
        if (!error) console.log('API shutdown complete.');
      });
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  };
  void start().catch((error: unknown) => {
    console.error('API startup failed:', error instanceof Error ? error.message : 'Unknown startup error.');
    process.exitCode = 1;
  });
}

export default app;
