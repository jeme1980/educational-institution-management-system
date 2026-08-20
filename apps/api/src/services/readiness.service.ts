import { inspectRuntimeDatabaseRole } from './runtime-database-role.service';

export interface ReadinessDatabaseClient {
  $queryRawUnsafe(query: string): Promise<unknown>;
}

export interface ReadinessState {
  status: 'ready' | 'not_ready';
  services: {
    schoolDatabase: 'ready' | 'not_ready';
    platformDatabase: 'ready' | 'not_ready';
  };
}

export function readinessHttpStatus(state: ReadinessState): 200 | 503 {
  return state.status === 'ready' ? 200 : 503;
}

export async function checkDatabaseReadiness(
  schoolDatabase: ReadinessDatabaseClient,
  platformDatabase: ReadinessDatabaseClient,
): Promise<ReadinessState> {
  const inspectDependency = async (database: ReadinessDatabaseClient): Promise<void> => {
    await database.$queryRawUnsafe('SELECT 1');
    const role = await inspectRuntimeDatabaseRole(database);
    if (!role.safeForRuntime) throw new Error('A privileged PostgreSQL role cannot be used as an application runtime role.');
  };
  const [school, platform] = await Promise.allSettled([
    inspectDependency(schoolDatabase),
    inspectDependency(platformDatabase),
  ]);
  const services: ReadinessState['services'] = {
    schoolDatabase: school.status === 'fulfilled' ? 'ready' : 'not_ready',
    platformDatabase: platform.status === 'fulfilled' ? 'ready' : 'not_ready',
  };
  return {
    status: services.schoolDatabase === 'ready' && services.platformDatabase === 'ready' ? 'ready' : 'not_ready',
    services,
  };
}
