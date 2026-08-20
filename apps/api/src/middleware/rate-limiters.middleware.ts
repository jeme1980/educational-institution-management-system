import { rateLimit, type Options } from 'express-rate-limit';

type EndpointRateLimitOptions = Pick<Options, 'windowMs' | 'limit'>;

export const endpointRateLimitPolicies = {
  login: { windowMs: 15 * 60 * 1000, limit: 10 },
  refresh: { windowMs: 15 * 60 * 1000, limit: 60 },
  accountSetup: { windowMs: 15 * 60 * 1000, limit: 10 },
  changePassword: { windowMs: 15 * 60 * 1000, limit: 10 },
  setupTokenReissue: { windowMs: 15 * 60 * 1000, limit: 10 },
} satisfies Record<string, EndpointRateLimitOptions>;

export function createEndpointRateLimiter(options: EndpointRateLimitOptions) {
  return rateLimit({
    ...options,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
      });
    },
  });
}

export const loginRateLimiter = createEndpointRateLimiter(endpointRateLimitPolicies.login);
export const refreshRateLimiter = createEndpointRateLimiter(endpointRateLimitPolicies.refresh);
export const accountSetupRateLimiter = createEndpointRateLimiter(endpointRateLimitPolicies.accountSetup);
export const changePasswordRateLimiter = createEndpointRateLimiter(endpointRateLimitPolicies.changePassword);
export const setupTokenReissueRateLimiter = createEndpointRateLimiter(endpointRateLimitPolicies.setupTokenReissue);
