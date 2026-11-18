import pg from 'pg';
export const MAX_RECORD_BYTES = 9 * 1024 * 1024;
const invalid = () => { throw Object.assign(new Error('Invalid history record'), {status:400}); };
export function validId(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(id); }
export function validateRecord(kind, data) {
 if (!['conversation','project','artifact'].includes(kind) || !data || typeof data !== 'object' || Array.isArray(data) || !validId(data.id)) invalid();
 const string=(v,max=2000000)=>typeof v==='string' && v.length<=max;
 const date=v=>Number.isFinite(v)&&v>=0;
 if (!date(data.createdAt)) invalid();
 if (kind==='conversation') {
  if (!string(data.title,2000)||!date(data.updatedAt)||!string(data.model,80)||!Array.isArray(data.messages)||data.messages.length>10000||(data.projectId!==undefined&&!validId(data.projectId))) invalid();
  for (const m of data.messages) {
   if (!m||!validId(m.id)||!['user','assistant','system'].includes(m.role)||!string(m.content)||!date(m.createdAt)||(m.thinkingContent!==undefined&&!string(m.thinkingContent))) invalid();
   if (m.attachments!==undefined && (!Array.isArray(m.attachments)||m.attachments.length>100)) invalid();
   if (m.artifacts!==undefined && (!Array.isArray(m.artifacts)||m.artifacts.length>100)) invalid();
   for (const a of m.artifacts||[]) validateRecord('artifact',a);
  }
 } else if (kind==='project') {
  if (!string(data.name,2000)||!date(data.updatedAt)||(data.files!==undefined&&!Array.isArray(data.files))) invalid();
 } else if (!string(data.title,2000)||!string(data.content)||!string(data.type,200)||!string(data.identifier,2000)) invalid();
 // Reject dangerous keys, excessive nesting and unsupported JSON values consistently.
 const walk=(value,depth=0)=>{
  if(depth>30) invalid();
  if (value===null||typeof value==='boolean'||typeof value==='string') return;
  if(typeof value==='number') {if(!Number.isFinite(value)) invalid();return;}
  if(typeof value!=='object') invalid();
  for(const [key,v] of Object.entries(value)) {if(['__proto__','prototype','constructor'].includes(key)) invalid();walk(v,depth+1);}
 };
 walk(data);
 if (Buffer.byteLength(JSON.stringify(data))>MAX_RECORD_BYTES) throw Object.assign(new Error('History record exceeds 9MB'),{status:413});
 return data;
}
const compactSQL = alias => `jsonb_strip_nulls(jsonb_build_object('id',${alias}.id,'title',${alias}.data->'title','name',${alias}.data->'name','model',${alias}.data->'model','createdAt',${alias}.data->'createdAt','updatedAt',${alias}.data->'updatedAt','projectId',${alias}.data->'projectId','isStarred',${alias}.data->'isStarred','type',${alias}.data->'type','identifier',${alias}.data->'identifier','isArtifactPicker',${alias}.data->'isArtifactPicker'))`;
const bounded = value => {const n=Number(value??30);if(!Number.isInteger(n)||n<1||n>100)invalid();return n;};
const row = r => ({kind:r.kind,id:r.id,version:Number(r.version),deleted:r.deleted,data:r.data});
export class PostgresHistoryStore {
 constructor(config,{schema='chat_history'}={}) {
  if(!config||!/^history_test_[a-z0-9_]+$|^chat_history$/.test(schema)) throw new Error('Invalid database configuration');
  this.pool=new pg.Pool({...config,max:Math.min(config.max||3,3),statement_timeout:10000,query_timeout:12000});
  this.pool.on('error',()=>{}); // Requests surface sanitized availability errors; never log credentials.
  this.table=`"${schema}".records`;
  this.schema=schema;
 }
 async ready(){
  if(!this.initializing) this.initializing=(async()=>{
   await this.pool.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
   await this.pool.query(`CREATE TABLE IF NOT EXISTS ${this.table} (kind text NOT NULL CHECK (kind IN ('conversation','project','artifact')), id text NOT NULL, version integer NOT NULL DEFAULT 1, deleted boolean NOT NULL DEFAULT false, data jsonb, modified_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(kind,id))`);
   const client=await this.pool.connect();
   try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,[this.schema+'lazy-v1']);
    await client.query(`CREATE TABLE IF NOT EXISTS "${this.schema}".change_clock (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), value bigint NOT NULL)`);
    await client.query(`INSERT INTO "${this.schema}".change_clock VALUES(true,0) ON CONFLICT DO NOTHING`);
    await client.query(`CREATE TABLE IF NOT EXISTS "${this.schema}".changes (seq bigint PRIMARY KEY, kind text NOT NULL,id text NOT NULL,version integer NOT NULL,deleted boolean NOT NULL,data jsonb)`);
    await client.query(`CREATE OR REPLACE FUNCTION "${this.schema}".record_change() RETURNS trigger LANGUAGE plpgsql AS $fn$ DECLARE n bigint; BEGIN UPDATE "${this.schema}".change_clock SET value=value+1 RETURNING value INTO n; INSERT INTO "${this.schema}".changes VALUES(n,NEW.kind,NEW.id,NEW.version,NEW.deleted,${compactSQL('NEW')}); RETURN NEW; END $fn$`);
    await client.query(`DROP TRIGGER IF EXISTS lazy_change ON ${this.table}`);
    await client.query(`CREATE TRIGGER lazy_change AFTER INSERT OR UPDATE ON ${this.table} FOR EACH ROW EXECUTE FUNCTION "${this.schema}".record_change()`);
    await client.query(`CREATE INDEX IF NOT EXISTS lazy_order ON ${this.table} ((COALESCE(data->>'updatedAt',data->>'createdAt','0')::numeric) DESC,id DESC,kind DESC) WHERE NOT deleted`);
    await client.query('COMMIT');
   } catch(e) {await client.query('ROLLBACK');throw e;} finally {client.release();}
  })().catch(e=>{this.initializing=null;throw e;});
  await this.initializing;
 }
 async list(){await this.ready();return (await this.pool.query(`SELECT kind,id,version,deleted,data FROM ${this.table} ORDER BY modified_at DESC`)).rows.map(row);}
 async page({limit,cursor,q='',kind}={}) {
  limit=bounded(limit);if(typeof q!=='string'||q.length>200||kind&&!['conversation','project','artifact'].includes(kind))invalid();
  let after=null;if(cursor){try{after=JSON.parse(Buffer.from(cursor,'base64url').toString());}catch{invalid();}if(!Array.isArray(after)||after.length!==3||!/^\d+(\.\d+)?$/.test(String(after[0]))||!validId(after[1])||!['conversation','project','artifact'].includes(after[2]))invalid();}
  await this.ready();
  const result=await this.pool.query(`SELECT (SELECT value::text FROM "${this.schema}".change_clock) AS clock, COALESCE(jsonb_agg(p),'[]') AS records FROM (SELECT r.kind,r.id,r.version,r.deleted,${compactSQL('r')} AS data,true AS summary,COALESCE(data->>'updatedAt',data->>'createdAt','0')::numeric AS sort FROM ${this.table} r WHERE NOT deleted AND ($1::text IS NULL OR kind=$1) AND ($2='' OR strpos(lower(COALESCE(data->>'title',data->>'name','')),lower($2))>0) AND ($3::numeric IS NULL OR (COALESCE(data->>'updatedAt',data->>'createdAt','0')::numeric,id,kind)<($3::numeric,$4::text,$5::text)) ORDER BY sort DESC,id DESC,kind DESC LIMIT $6) p`,[kind||null,q,after?.[0]??null,after?.[1]??null,after?.[2]??null,limit+1]);
  const records=result.rows[0].records;const more=records.length>limit;if(more)records.pop();const last=records.at(-1);const next=more?Buffer.from(JSON.stringify([last.sort,last.id,last.kind])).toString('base64url'):null;for(const r of records)delete r.sort;
  return {records,next,cursor:result.rows[0].clock};
 }
 async changes({cursor='0',limit}={}) {
  limit=bounded(limit);if(!/^\d{1,19}$/.test(String(cursor))||BigInt(cursor)>9223372036854775807n)invalid();await this.ready();
  const rows=(await this.pool.query(`SELECT seq::text,kind,id,version,deleted,data,true AS summary FROM "${this.schema}".changes WHERE seq>$1::bigint ORDER BY seq LIMIT $2`,[cursor,limit+1])).rows;const more=rows.length>limit;if(more)rows.pop();return {records:rows.map(({seq,...r})=>r),cursor:rows.at(-1)?.seq||String(cursor),more};
 }
 async detail(kind,id){if(!['conversation','project','artifact'].includes(kind)||!validId(id))invalid();await this.ready();const r=(await this.pool.query(`SELECT * FROM ${this.table} WHERE kind=$1 AND id=$2`,[kind,id])).rows[0];return r?row(r):null;}
 async write(kind,id,version,data,{importOnly=false}={}){
  if(!['conversation','project','artifact'].includes(kind)||!validId(id)||!Number.isSafeInteger(version)||version<0) invalid();
  if(data!==null){validateRecord(kind,data);if(data.id!==id) invalid();}
  await this.ready();
  let result;
  if(version===0) {
   result=await this.pool.query(`INSERT INTO ${this.table} (kind,id,data,deleted) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *`,[kind,id,data,data===null]);
  } else if(!importOnly) {
   result=await this.pool.query(`UPDATE ${this.table} SET data=$4,deleted=$5,version=version+1,modified_at=now() WHERE kind=$1 AND id=$2 AND version=$3 AND NOT deleted RETURNING *`,[kind,id,version,data,data===null]);
  }
  if(result?.rows.length) return row(result.rows[0]);
  const current=(await this.pool.query(`SELECT * FROM ${this.table} WHERE kind=$1 AND id=$2`,[kind,id])).rows[0];
  return {...(current?row(current):{kind,id,version:0,deleted:true,data:null}),...(!importOnly?{conflict:true}:{})};
 }
 async close(){await this.pool.end();}
}
