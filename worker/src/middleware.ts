import {Context,Next} from 'hono';
import {Env,AuthedContext} from './types';
import {verifyJwt} from './auth';
import {rolePermissions} from './db';
import {getJwtSecret} from './secret';
export async function requireAuth(c:Context<{Bindings:Env}>,next:Next){
 const header=c.req.header('authorization')||'';const token=header.startsWith('Bearer ')?header.slice(7):'';if(!token)return c.json({error:'Unauthorized'},401);
 const payload=await verifyJwt(token,await getJwtSecret(c.env));if(!payload)return c.json({error:'Invalid or expired session'},401);
 const raw=await c.env.SESSIONS.get(`session:${payload.sid}`);if(!raw)return c.json({error:'Session expired'},401);
 const session=JSON.parse(raw) as {adminId:number;role:string;csrfToken:string;expiresAt:number};
 if(session.expiresAt<=Date.now())return c.json({error:'Session expired'},401);
 const admin=await c.env.DB.prepare('SELECT id,role,must_change_password FROM admins WHERE id=?').bind(session.adminId).first<{id:number;role:string;must_change_password:number}>();
 if(!admin)return c.json({error:'Account not found'},401);
 const pathname=new URL(c.req.url).pathname;
 const passwordChangeAllowed=pathname==='/api/auth/change-password'||pathname==='/api/auth/logout'||pathname==='/api/auth/me';
 if(admin.must_change_password && !passwordChangeAllowed)return c.json({error:'Password change required',code:'PASSWORD_CHANGE_REQUIRED'},428);
 const permissions=await rolePermissions(c.env,admin.role);
 c.set('auth' as never,{adminId:admin.id,role:admin.role,sessionId:payload.sid,permissions} as never);
 if(['POST','PUT','PATCH','DELETE'].includes(c.req.method)){const csrf=c.req.header('x-csrf-token');if(!csrf||csrf!==session.csrfToken)return c.json({error:'CSRF validation failed'},403);}
 await next();
}
export function requirePermission(permission:string){return async(c:Context<{Bindings:Env}>,next:Next)=>{const a=c.get('auth' as never) as AuthedContext;if(!a?.permissions.includes('*')&&!a?.permissions.includes(permission))return c.json({error:'Forbidden'},403);await next();}}
export function getAuth(c:Context<{Bindings:Env}>){return c.get('auth' as never) as AuthedContext;}
