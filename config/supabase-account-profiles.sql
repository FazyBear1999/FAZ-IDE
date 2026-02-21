-- FAZ IDE account schema hardening migration for Supabase Auth users
-- Safe to re-run.

create table if not exists public.account_profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    display_name text not null default '',
    account_type text not null default 'test',
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.account_workspace_state (
    id uuid primary key references auth.users (id) on delete cascade,
    storage_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

alter table public.account_profiles
    add column if not exists created_at timestamptz not null default timezone('utc', now()),
    add column if not exists updated_at timestamptz not null default timezone('utc', now()),
    add column if not exists lesson_level integer not null default 1,
    add column if not exists lesson_xp bigint not null default 0,
    add column if not exists lesson_bytes bigint not null default 0,
    add column if not exists lessons_completed bigint not null default 0,
    add column if not exists lesson_best_streak integer not null default 0,
    add column if not exists lesson_daily_streak integer not null default 0,
    add column if not exists lesson_total_typed_chars bigint not null default 0,
    add column if not exists lesson_last_active_day text not null default '',
    add column if not exists last_cloud_sync_at timestamptz;

alter table public.account_workspace_state
    add column if not exists created_at timestamptz not null default timezone('utc', now()),
    add column if not exists updated_at timestamptz not null default timezone('utc', now());

create or replace function public.fazide_workspace_state_payload_entries_valid(payload jsonb)
returns boolean
language sql
immutable
strict
as $$
    select not exists (
        select 1
        from jsonb_each(payload) as item(key, value)
        where jsonb_typeof(item.value) <> 'string'
           or char_length(item.key) > 128
           or item.key !~ '^fazide\.[a-z0-9._-]+$'
           or octet_length(coalesce(item.value #>> '{}', '')) > 500000
    );
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'account_profiles_display_name_len_chk'
          and conrelid = 'public.account_profiles'::regclass
    ) then
        alter table public.account_profiles
            add constraint account_profiles_display_name_len_chk
            check (char_length(display_name) <= 48);
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'account_profiles_display_name_trimmed_chk'
          and conrelid = 'public.account_profiles'::regclass
    ) then
        alter table public.account_profiles
            add constraint account_profiles_display_name_trimmed_chk
            check (display_name = btrim(display_name));
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'account_profiles_account_type_chk'
          and conrelid = 'public.account_profiles'::regclass
    ) then
        alter table public.account_profiles
            add constraint account_profiles_account_type_chk
            check (account_type in ('test', 'sandbox'));
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'account_profiles_lesson_nonnegative_chk'
          and conrelid = 'public.account_profiles'::regclass
    ) then
        alter table public.account_profiles
            add constraint account_profiles_lesson_nonnegative_chk
            check (
                lesson_level >= 1
                and lesson_xp >= 0
                and lesson_bytes >= 0
                and lessons_completed >= 0
                and lesson_best_streak >= 0
                and lesson_daily_streak >= 0
                and lesson_total_typed_chars >= 0
            );
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'account_profiles_lesson_last_active_day_chk'
          and conrelid = 'public.account_profiles'::regclass
    ) then
        alter table public.account_profiles
            add constraint account_profiles_lesson_last_active_day_chk
            check (
                lesson_last_active_day = ''
                or lesson_last_active_day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            );
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'account_profiles_lesson_last_active_day_valid_date_chk'
          and conrelid = 'public.account_profiles'::regclass
    ) then
        alter table public.account_profiles
            add constraint account_profiles_lesson_last_active_day_valid_date_chk
            check (
                lesson_last_active_day = ''
                or to_char(to_date(lesson_last_active_day, 'YYYY-MM-DD'), 'YYYY-MM-DD') = lesson_last_active_day
            );
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'account_workspace_state_payload_object_chk'
          and conrelid = 'public.account_workspace_state'::regclass
    ) then
        alter table public.account_workspace_state
            add constraint account_workspace_state_payload_object_chk
            check (jsonb_typeof(storage_payload) = 'object');
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'account_workspace_state_payload_size_chk'
          and conrelid = 'public.account_workspace_state'::regclass
    ) then
        alter table public.account_workspace_state
            add constraint account_workspace_state_payload_size_chk
            check (octet_length(storage_payload::text) <= 1500000);
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'account_workspace_state_payload_entries_chk'
          and conrelid = 'public.account_workspace_state'::regclass
    ) then
        alter table public.account_workspace_state
            add constraint account_workspace_state_payload_entries_chk
            check (public.fazide_workspace_state_payload_entries_valid(storage_payload));
    end if;
end $$;

create index if not exists account_profiles_updated_at_idx
    on public.account_profiles (updated_at desc);

create index if not exists account_profiles_lesson_xp_idx
    on public.account_profiles (lesson_xp desc);

create index if not exists account_profiles_lessons_completed_idx
    on public.account_profiles (lessons_completed desc);

create index if not exists account_profiles_last_cloud_sync_at_idx
    on public.account_profiles (last_cloud_sync_at desc);

create index if not exists account_workspace_state_updated_at_idx
    on public.account_workspace_state (updated_at desc);

create or replace view public.account_lesson_stats as
select
    id,
    display_name,
    account_type,
    lesson_level,
    lesson_xp,
    lesson_bytes,
    lessons_completed,
    lesson_best_streak,
    lesson_daily_streak,
    lesson_total_typed_chars,
    lesson_last_active_day,
    last_cloud_sync_at,
    updated_at
from public.account_profiles;

revoke all on public.account_lesson_stats from public;
revoke all on public.account_lesson_stats from anon;
grant select on public.account_lesson_stats to authenticated;

create or replace function public.fazide_set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

create or replace function public.fazide_guard_account_profile_progress()
returns trigger
language plpgsql
as $$
declare
    max_xp_increase bigint := 250000;
    max_bytes_increase bigint := 50000;
begin
    if tg_op = 'INSERT' then
        if new.lesson_xp > max_xp_increase
           or new.lesson_bytes > max_bytes_increase
           or new.lessons_completed > 5000
           or new.lesson_total_typed_chars > 5000000 then
            raise exception 'initial profile progression exceeds safe bootstrap limits';
        end if;
        return new;
    end if;

    if (new.lesson_xp - old.lesson_xp) > max_xp_increase then
        raise exception 'lesson_xp increase exceeds safe progression window';
    end if;

    if (new.lesson_bytes - old.lesson_bytes) > max_bytes_increase then
        raise exception 'lesson_bytes increase exceeds safe progression window';
    end if;

    if new.lesson_xp < old.lesson_xp then
        raise exception 'lesson_xp cannot decrease';
    end if;

    if new.lessons_completed < old.lessons_completed then
        raise exception 'lessons_completed cannot decrease';
    end if;

    if new.lesson_best_streak < old.lesson_best_streak then
        raise exception 'lesson_best_streak cannot decrease';
    end if;

    if new.lesson_total_typed_chars < old.lesson_total_typed_chars then
        raise exception 'lesson_total_typed_chars cannot decrease';
    end if;

    return new;
end;
$$;

drop trigger if exists account_profiles_set_updated_at on public.account_profiles;
create trigger account_profiles_set_updated_at
before update on public.account_profiles
for each row
execute function public.fazide_set_updated_at();

drop trigger if exists account_profiles_progress_guard on public.account_profiles;
create trigger account_profiles_progress_guard
before insert or update on public.account_profiles
for each row
execute function public.fazide_guard_account_profile_progress();

drop trigger if exists account_workspace_state_set_updated_at on public.account_workspace_state;
create trigger account_workspace_state_set_updated_at
before update on public.account_workspace_state
for each row
execute function public.fazide_set_updated_at();

alter table public.account_profiles enable row level security;
alter table public.account_workspace_state enable row level security;

alter table public.account_profiles force row level security;
alter table public.account_workspace_state force row level security;

revoke all on public.account_profiles from public;
revoke all on public.account_workspace_state from public;
revoke all on public.account_profiles from anon;
revoke all on public.account_workspace_state from anon;

grant select, insert, update on public.account_profiles to authenticated;
grant select, insert, update on public.account_workspace_state to authenticated;

drop policy if exists "profile_select_own" on public.account_profiles;
create policy "profile_select_own"
on public.account_profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profile_insert_own" on public.account_profiles;
create policy "profile_insert_own"
on public.account_profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profile_update_own" on public.account_profiles;
create policy "profile_update_own"
on public.account_profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "profile_delete_own" on public.account_profiles;

drop policy if exists "workspace_state_select_own" on public.account_workspace_state;
create policy "workspace_state_select_own"
on public.account_workspace_state
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "workspace_state_insert_own" on public.account_workspace_state;
create policy "workspace_state_insert_own"
on public.account_workspace_state
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "workspace_state_update_own" on public.account_workspace_state;
create policy "workspace_state_update_own"
on public.account_workspace_state
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "workspace_state_delete_own" on public.account_workspace_state;
