import { NextFunction, Request, Response } from 'express';

export function releaseRlsClientMiddleware(req: Request & { app?: { locals?: Record<string, unknown> } }, _res: Response, next: NextFunction): void {
  next();
}
