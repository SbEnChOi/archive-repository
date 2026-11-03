import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('migration denies direct anonymous/authenticated access and commits with optimistic locking',async()=>{
  const db=new PGlite();try{
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);");
    await db.exec(await readFile(new URL('../supabase/migrations/202610210001_archive_repository.sql',import.meta.url),'utf8'));
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      await assert.rejects(db.query('select * from public.archive_records'),/permission denied/);
      await assert.rejects(db.query("select * from public.archive_commit('{\"id\":\"blocked\"}',0,'{}')"),/permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const first=await db.query("select * from public.archive_commit('{\"id\":\"test\"}',0,'{}')");assert.equal(first.rows[0].version,1);
    await assert.rejects(db.query("select * from public.archive_commit('{\"id\":\"test\"}',0,'{}')"),/archive_conflict/);
    const updated=await db.query("select * from public.archive_commit('{\"id\":\"test\",\"title\":\"changed\"}',1,'{}')");assert.equal(updated.rows[0].version,2);
    await assert.rejects(db.query("select * from public.archive_commit('{\"id\":\"new\"}',0,array['00000000-0000-0000-0000-000000000001'::uuid])"),/archive_invalid_upload/);
    assert.equal((await db.query('select count(*) from public.archive_records')).rows[0].count,1);
  }finally{await db.close();}
});
