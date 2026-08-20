export interface RuntimeRoleDatabaseClient {
  $queryRawUnsafe(query: string): Promise<unknown>;
}

export interface RuntimeDatabaseRoleState {
  roleName: string;
  superuser: boolean;
  bypassRls: boolean;
  createDatabase: boolean;
  createRole: boolean;
  replication: boolean;
  safeForRuntime: boolean;
}

type RoleRow = {
  role_name: string;
  superuser: boolean;
  bypass_rls: boolean;
  create_database: boolean;
  create_role: boolean;
  replication: boolean;
};

export async function inspectRuntimeDatabaseRole(client: RuntimeRoleDatabaseClient): Promise<RuntimeDatabaseRoleState> {
  const rows = await client.$queryRawUnsafe(`
    SELECT
      current_user AS role_name,
      rolsuper AS superuser,
      rolbypassrls AS bypass_rls,
      rolcreatedb AS create_database,
      rolcreaterole AS create_role,
      rolreplication AS replication
    FROM pg_roles
    WHERE rolname = current_user
  `) as RoleRow[];
  const row = rows[0];
  if (!row) throw new Error('The current PostgreSQL runtime role could not be inspected.');
  const safeForRuntime = !row.superuser
    && !row.bypass_rls
    && !row.create_database
    && !row.create_role
    && !row.replication;
  return {
    roleName: row.role_name,
    superuser: row.superuser,
    bypassRls: row.bypass_rls,
    createDatabase: row.create_database,
    createRole: row.create_role,
    replication: row.replication,
    safeForRuntime,
  };
}
