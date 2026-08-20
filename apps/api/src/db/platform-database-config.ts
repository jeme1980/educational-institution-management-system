export interface PlatformDatabaseEnvironment {
  NODE_ENV?: string;
  PLATFORM_DATABASE_URL?: string;
  DATABASE_URL?: string;
}

/**
 * The platform client must never inherit the school runtime connection in
 * production. A development/test fallback is retained for the existing local
 * single-database workflow and is intentionally disabled in production.
 */
export function resolvePlatformDatabaseUrl(environment: PlatformDatabaseEnvironment = process.env): string {
  const platformUrl = environment.PLATFORM_DATABASE_URL?.trim();
  if (platformUrl) return platformUrl;

  if (environment.NODE_ENV === 'production') {
    throw new Error('PLATFORM_DATABASE_URL is required when NODE_ENV=production.');
  }

  const developmentFallback = environment.DATABASE_URL?.trim();
  if (developmentFallback) return developmentFallback;

  throw new Error('PLATFORM_DATABASE_URL is required. DATABASE_URL may only be used as a local development/test fallback.');
}
