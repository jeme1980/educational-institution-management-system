import { NextFunction, Response } from 'express';
import type { ContextRequest } from './context';

export async function rlsMiddleware(req: ContextRequest, _res: Response, next: NextFunction): Promise<void> {
  // RLS is established by rlsRequestTransaction after requireAuth resolves
  // the trusted membership. Client headers/app.locals are never security context.
  next();
}
