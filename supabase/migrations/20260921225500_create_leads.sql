create extension if not exists pgcrypto;

create type public.lead_status as enum ('New', 'Contacted', 'Callback due');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  name text not null,
  dealership text not null,
  vehicle text not null,
  source text not null,
  source_url text not null,
  contact text not null,
  consent_at timestamptz not null,
  callback_date date not null,
  status public.lead_status not null default 'New',
  email_opt_in boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index leads_status_idx on public.leads (status);
create index leads_callback_date_idx on public.leads (callback_date);
create index leads_created_by_idx on public.leads (created_by);

create or replace function public.set_leads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger leads_set_updated_at
before update on public.leads
for each row
execute function public.set_leads_updated_at();

alter table public.leads enable row level security;

create policy "Authenticated users can view leads"
on public.leads
for select
to authenticated
using (true);

create policy "Authenticated users can create leads"
on public.leads
for insert
to authenticated
with check (created_by = auth.uid());

create policy "Authenticated users can update leads"
on public.leads
for update
to authenticated
using (true)
with check (true);
