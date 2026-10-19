import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import test, { after } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { prisma } from '../db/prisma';
import { platformPrisma } from '../db/platform-prisma';
import { closeAuthDatabase, findAuthIdentityStateById, changeOwnPassword } from '../db/auth-runtime.repository';
import { hashPassword, verifyPassword } from './password';
import app from '../server';

const contracts: {schema:string;name:string;args:string;result:string;role:string}[] = require('../../../../scripts/runtime-function-contracts.cjs');
const auth = new PrismaClient({ datasourceUrl: process.env['AUTH_RUNTIME_DATABASE_URL'] });
const denied = (error: any) => /42501|permission denied/i.test(String(error?.message));
const root = path.resolve(__dirname, '../../../..');
function guard() {
  for (const key of ['TEST_ADMIN_DATABASE_URL','RLS_RUNTIME_DATABASE_URL','AUTH_RUNTIME_DATABASE_URL','PLATFORM_DATABASE_URL']) {
    const url = new URL(process.env[key] || '');
    assert.equal(url.hostname,'127.0.0.1'); assert.ok(+url.port>=55004); assert.notEqual(url.pathname,'/school');
  }
}
function verifier(mode: string) {
  return spawnSync(process.execPath, [path.join(root,'scripts/verify-production-db.cjs'),'--mode',mode], {env:process.env,encoding:'utf8',timeout:30_000});
}
function psqlArtifact(file: string) {
  const url=new URL(process.env['TEST_ADMIN_DATABASE_URL']!);
  const result=spawnSync(process.env['PSQL_PATH']!,['--no-psqlrc','--set','ON_ERROR_STOP=1','--quiet','-f',path.join(root,file)],{env:{...process.env,PGHOST:url.hostname,PGPORT:url.port,PGDATABASE:url.pathname.slice(1),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password)},encoding:'utf8'});
  assert.equal(result.status,0,'Reviewed SQL artifact must succeed');
}
after(async()=>{await Promise.all([auth.$disconnect(),prisma.$disconnect(),platformPrisma.$disconnect(),closeAuthDatabase(),admin.$disconnect()]);});

test('B1/B2: runtime roles enforce exact capability boundaries and hash minimization',async()=>{
 guard();
 for (const db of [prisma,auth]) for(const table of ['users','user_sessions','institutions']) {
  for(const statement of [`SELECT id FROM public.${table} LIMIT 1`,`UPDATE public.${table} SET id=id WHERE false`,`DELETE FROM public.${table} WHERE false`,`INSERT INTO public.${table}(id) SELECT gen_random_uuid() WHERE false`]) await assert.rejects(()=>db.$queryRawUnsafe(statement),denied);
 }
 assert.doesNotMatch(fs.readFileSync(path.join(root,'apps/api/src/db/school-runtime.repository.ts'),'utf8'),/auth-runtime|auth_api|AUTH_RUNTIME_DATABASE_URL/);
 const platform=await admin.user.findFirstOrThrow({where:{isPlatformAdmin:true}});
 for(const capability of contracts) {
  const signature=capability.schema+'.'+capability.name+'('+capability.args+')';
  const [object]=await admin.$queryRaw<{oid:string}[]>`SELECT to_regprocedure(${signature})::oid::text AS oid`;
  for(const [db,role] of [[prisma,'school_app'],[auth,'school_auth_app'],[platformPrisma,'platform_app']] as const) {
   const [row]=await db.$queryRaw<{allowed:boolean}[]>`SELECT has_function_privilege(current_user,${object.oid}::oid,'EXECUTE') AS allowed`;
   assert.equal(row.allowed,role===capability.role,signature+' '+role);
  }
 }
 await assert.rejects(()=>prisma.$queryRaw`SELECT auth_api.session_create(${platform.id}::uuid,'not-a-token',CURRENT_TIMESTAMP+interval '1 day',NULL,NULL)`,denied);
 await assert.rejects(()=>prisma.$queryRaw`SELECT auth_api.auth_change_password(${randomUUID()}::uuid,'old','new',NULL)`,denied);
 await assert.rejects(()=>prisma.$queryRaw`SELECT * FROM auth_api.auth_memberships(${platform.id}::uuid)`,denied);
 await assert.rejects(()=>prisma.$queryRaw`SELECT auth_api.sessions_revoke_current(${randomUUID()}::uuid)`,denied);
 const state=await findAuthIdentityStateById(platform.id); assert.ok(state); assert.equal('passwordHash' in state,false);
 const raw=await auth.$queryRaw<any[]>`SELECT * FROM auth_api.auth_identity_id(${platform.id}::uuid)`;assert.equal('passwordHash' in raw[0],false);
 const oldFunctions=await admin.$queryRaw<{count:number}[]>`SELECT count(*)::int AS count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='school_api' AND p.proname LIKE 'auth_%') OR p.proname IN ('auth_password_hash','sessions_revoke_user','session_revoke')`;
 assert.equal(oldFunctions[0].count,0);
 const expired=await admin.userSession.create({data:{userId:platform.id,refreshTokenHash:randomUUID(),expiresAt:new Date(Date.now()-60_000)}});
 try {
 const [rotated]=await auth.$queryRaw<{count:number}[]>`SELECT auth_api.session_rotate(${expired.id}::uuid,${expired.refreshTokenHash}::text,'next',(CURRENT_TIMESTAMP+interval '1 day')::timestamp) AS count`;assert.equal(rotated.count,0);
 await auth.$transaction(async tx=>{
  await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'Pacific/Honolulu'");
  const [result]=await tx.$queryRaw<{count:number}[]>`SELECT auth_api.session_rotate(${expired.id}::uuid,${expired.refreshTokenHash}::text,'timezone-attempt',(CURRENT_TIMESTAMP+interval '1 day')::timestamp) AS count`;
  assert.equal(result.count,0,'changing the connection timezone must not revive an expired UTC session');
 });
 const [long]=await auth.$queryRaw<{count:number}[]>`SELECT auth_api.session_rotate(${expired.id}::uuid,${expired.refreshTokenHash}::text,'next',(CURRENT_TIMESTAMP+interval '100 days')::timestamp) AS count`;assert.equal(long.count,0);
 const [revoked]=await auth.$queryRaw<{changed:boolean}[]>`SELECT auth_api.session_revoke_hash(${randomUUID()}::text) AS changed`;assert.equal(revoked.changed,false);
 assert.equal(await changeOwnPassword(randomUUID(),'old','new',null),false);
 } finally {await admin.userSession.delete({where:{id:expired.id}});}
});

test('B3: platform self-service password change is authenticated, atomic and audited',async()=>{
 guard();const email='boundary-'+randomUUID()+'@example.test',password='Boundary-old-2026!',next='Boundary-new-2026!';
 const user=await admin.user.create({data:{email,normalizedEmail:email,passwordHash:await hashPassword(password),isPlatformAdmin:true,securityStamp:randomUUID()}});
 const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address && typeof address!=='string');const base='http://127.0.0.1:'+address.port;
 const post=(route:string,body:unknown,token?:string)=>fetch(base+'/api/auth/'+route,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 try {
  let response=await post('login',{email,password});assert.equal(response.status,200);const login:any=await response.json();const sid=JSON.parse(Buffer.from(login.token.split('.')[1],'base64url').toString()).sid;
  response=await post('change-password',{currentPassword:password,newPassword:next},login.token);assert.equal(response.status,200,await response.text());
  const updated=await admin.user.findUniqueOrThrow({where:{id:user.id}});assert.ok(await verifyPassword(next,updated.passwordHash));assert.notEqual(updated.securityStamp,user.securityStamp);
  assert.equal(await admin.userSession.count({where:{userId:user.id,revokedAt:null}}),0);
  assert.equal(await admin.platformAuditLog.count({where:{actorUserId:user.id,entityId:user.id,action:'PASSWORD_CHANGED'}}),1);
  response=await post('login',{email,password:next});assert.equal(response.status,200);const second:any=await response.json();const secondSid=JSON.parse(Buffer.from(second.token.split('.')[1],'base64url').toString()).sid;
  // Simulate audit failure: the credential and session mutations MUST roll back.
  await admin.$executeRawUnsafe(`CREATE FUNCTION public.boundary_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`);
  await admin.$executeRawUnsafe('CREATE TRIGGER boundary_reject_audit BEFORE INSERT ON public.platform_audit_logs FOR EACH ROW EXECUTE FUNCTION public.boundary_reject_audit()');
  try {await assert.rejects(()=>changeOwnPassword(secondSid,updated.passwordHash,'synthetic-rejected-hash',null));} finally {
   await admin.$executeRawUnsafe('DROP TRIGGER boundary_reject_audit ON public.platform_audit_logs');await admin.$executeRawUnsafe('DROP FUNCTION public.boundary_reject_audit()');
  }
  assert.equal((await admin.user.findUniqueOrThrow({where:{id:user.id}})).passwordHash,updated.passwordHash);
  assert.equal((await admin.userSession.findUniqueOrThrow({where:{id:secondSid}})).revokedAt,null);
  for(const db of [prisma,auth]) {const [row]=await db.$queryRaw<{allowed:boolean}[]>`SELECT has_table_privilege(current_user,'public.platform_audit_logs','INSERT') AS allowed`;assert.equal(row.allowed,false);}
  assert.ok(sid);
 } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));await admin.platformAuditLog.deleteMany({where:{actorUserId:user.id}});await admin.userSession.deleteMany({where:{userId:user.id}});await admin.user.delete({where:{id:user.id}});}
});

test('B4/B5: explicit cutover phases reject legacy column grants and contract drift',async()=>{
 guard();
 assert.equal(verifier('pre-cutover').status,0);assert.equal(verifier('post-cutover').status,0);
 await admin.$executeRawUnsafe('GRANT SELECT,INSERT,UPDATE,DELETE ON public.users,public.user_sessions,public.institutions TO school_app');
 try {const pre=verifier('pre-cutover');assert.equal(pre.status,0);assert.match(pre.stdout,/PENDING_LEGACY_REMEDIATION=school_app:users,user_sessions,institutions/);assert.notEqual(verifier('post-cutover').status,0);}finally{psqlArtifact('apps/api/scripts/sql/school-runtime-legacy-revoke.sql');}
 await admin.$executeRawUnsafe('GRANT SELECT(email) ON public.users TO school_app');
 try {const pre=verifier('pre-cutover');assert.equal(pre.status,0);assert.match(pre.stdout,/PENDING_LEGACY_REMEDIATION=school_app:users/);assert.notEqual(verifier('post-cutover').status,0);}
 finally {psqlArtifact('apps/api/scripts/sql/school-runtime-legacy-revoke.sql');}
 assert.equal(verifier('pre-cutover').status,0);assert.equal(verifier('post-cutover').status,0);
 await admin.$executeRawUnsafe('GRANT SELECT(email) ON public.users TO school_auth_app');
 try {for(const mode of ['pre-cutover','post-cutover'])assert.notEqual(verifier(mode).status,0);}finally{await admin.$executeRawUnsafe('REVOKE SELECT(email) ON public.users FROM school_auth_app');}
 await admin.$executeRawUnsafe('CREATE FUNCTION auth_api.session_id(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$');
 try {for(const mode of ['pre-cutover','post-cutover'])assert.notEqual(verifier(mode).status,0);}finally{await admin.$executeRawUnsafe('DROP FUNCTION auth_api.session_id(text)');}
 await admin.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION auth_api.auth_identity_id(uuid) TO PUBLIC');
 try {for(const mode of ['pre-cutover','post-cutover'])assert.notEqual(verifier(mode).status,0);}finally{await admin.$executeRawUnsafe('REVOKE EXECUTE ON FUNCTION auth_api.auth_identity_id(uuid) FROM PUBLIC');}
 await admin.$executeRawUnsafe('ALTER FUNCTION auth_api.auth_identity_id(uuid) OWNER TO CURRENT_USER');
 try {for(const mode of ['pre-cutover','post-cutover'])assert.notEqual(verifier(mode).status,0);}finally{await admin.$executeRawUnsafe('ALTER FUNCTION auth_api.auth_identity_id(uuid) OWNER TO school_runtime_definer');}
 // Return type drift is rejected independently of name and argument identity.
 const [definition]=await admin.$queryRaw<{definition:string}[]>`SELECT pg_get_functiondef('auth_api.session_id(uuid)'::regprocedure) AS definition`;
 await admin.$executeRawUnsafe('DROP FUNCTION auth_api.session_id(uuid)');
 await admin.$executeRawUnsafe('CREATE FUNCTION auth_api.session_id(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$');
 try {for(const mode of ['pre-cutover','post-cutover'])assert.notEqual(verifier(mode).status,0);} finally {
  await admin.$executeRawUnsafe('DROP FUNCTION auth_api.session_id(uuid)');
  await admin.$executeRawUnsafe(definition.definition);
  await admin.$executeRawUnsafe('ALTER FUNCTION auth_api.session_id(uuid) OWNER TO school_runtime_definer');
  await admin.$executeRawUnsafe('REVOKE ALL ON FUNCTION auth_api.session_id(uuid) FROM PUBLIC');
  await admin.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION auth_api.session_id(uuid) TO school_auth_app');
 }
 await admin.$executeRawUnsafe('GRANT CREATE ON SCHEMA auth_api TO school_auth_app');
 try {for(const mode of ['pre-cutover','post-cutover'])assert.notEqual(verifier(mode).status,0);}finally{await admin.$executeRawUnsafe('REVOKE CREATE ON SCHEMA auth_api FROM school_auth_app');}
 await admin.$executeRawUnsafe('ALTER DEFAULT PRIVILEGES FOR ROLE school_runtime_definer GRANT EXECUTE ON FUNCTIONS TO PUBLIC');
 try {for(const mode of ['pre-cutover','post-cutover'])assert.notEqual(verifier(mode).status,0);}finally{await admin.$executeRawUnsafe('ALTER DEFAULT PRIVILEGES FOR ROLE school_runtime_definer REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');}
 assert.equal(verifier('post-cutover').status,0);
});
