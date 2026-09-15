export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  CACHE: KVNamespace;
  JWT_SECRET?: string;
  ASSETS?: Fetcher;
}
export interface AuthedContext { adminId:number; role:string; sessionId:string; permissions:string[]; }
