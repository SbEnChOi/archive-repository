begin;

create table public.archive_config (
  singleton boolean primary key default true check (singleton),
  owner_email text not null,
  site_url text not null default '',
  origins jsonb not null default '[]'::jsonb
);
insert into public.archive_config(owner_email) values ('owner@example.com');

create table public.archive_records (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,80}$'),
  document jsonb not null check (document->>'id' = id),
  version integer not null default 1 check (version > 0),
  sort_order bigint generated always as identity
);

create table public.archive_uploads (
  id uuid primary key,
  object_path text not null unique,
  metadata jsonb not null,
  expires_at timestamptz not null default now() + interval '2 hours'
);

alter table public.archive_config enable row level security;
alter table public.archive_records enable row level security;
alter table public.archive_uploads enable row level security;
revoke all on public.archive_config, public.archive_records, public.archive_uploads from anon, authenticated;
grant all on public.archive_config, public.archive_records, public.archive_uploads to service_role;
grant usage, select on sequence public.archive_records_sort_order_seq to service_role;

-- All access is mediated by the Edge API, which checks Auth and record visibility.
create function public.archive_commit(p_document jsonb, p_version integer, p_upload_ids uuid[])
returns setof public.archive_records
language plpgsql set search_path = '' as $$
declare existing public.archive_records; target_id text := p_document->>'id'; ticket_count integer;
begin
  select * into existing from public.archive_records where id = target_id for update;
  if (existing.id is null and p_version <> 0) or (existing.id is not null and existing.version <> p_version) then
    raise exception 'archive_conflict' using errcode = '40001';
  end if;
  perform 1 from public.archive_uploads where id = any(p_upload_ids) for update;
  select count(*) into ticket_count from public.archive_uploads where id = any(p_upload_ids) and expires_at > now();
  if ticket_count <> cardinality(p_upload_ids) then raise exception 'archive_invalid_upload'; end if;
  if existing.id is null then
    insert into public.archive_records(id, document) values (target_id, p_document);
  else
    update public.archive_records set document = p_document, version = version + 1 where id = target_id;
  end if;
  delete from public.archive_uploads where id = any(p_upload_ids);
  return query select * from public.archive_records where id = target_id;
end;
$$;
revoke all on function public.archive_commit(jsonb, integer, uuid[]) from public, anon, authenticated;
grant execute on function public.archive_commit(jsonb, integer, uuid[]) to service_role;

insert into storage.buckets(id, name, public, file_size_limit)
values ('archive-files', 'archive-files', false, 52428800);

commit;
