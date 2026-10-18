-- Migración `indi_entrenamiento` (18-oct-2026). Aplicada con apply_migration en
-- piingkecjgoisnxccvaa. Lo que Indi sabe, editable desde la sección 🧠 INDI.
-- Mismo patrón que el resto de `inbox`: RLS prendido, solo service_role.

create table inbox.indi_conocimiento (
  id uuid primary key default gen_random_uuid(),
  cuenta text not null default 'IND',
  tipo text not null check (tipo in ('precio','promo','regla','pregunta')),
  titulo text not null,
  contenido text not null default '',
  precio numeric(10,2) check (precio is null or precio >= 0),
  vigente_hasta date,
  activo boolean not null default true,
  orden int not null default 0,
  actualizado_por text,
  actualizado_en timestamptz not null default now(),
  check (tipo <> 'promo' or vigente_hasta is not null)
);
create index indi_conocimiento_cuenta_idx on inbox.indi_conocimiento (cuenta, tipo, orden);

create table inbox.indi_feriados (
  cuenta text not null default 'IND',
  fecha date not null,
  nombre text not null,
  primary key (cuenta, fecha)
);

create table inbox.indi_historial (
  id bigserial primary key,
  cuenta text not null,
  tabla text not null,
  fila_id text not null,
  antes jsonb,
  despues jsonb,
  por text,
  en timestamptz not null default now()
);
create index indi_historial_cuenta_en_idx on inbox.indi_historial (cuenta, en desc);

-- Tabla compartida con MANDI: default true = nada cambia para nadie.
alter table inbox.respuestas_rapidas add column uso_ia boolean not null default true;

create or replace function inbox.indi_registrar_cambio() returns trigger
language plpgsql set search_path = inbox, pg_temp as $$
declare
  a jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  d jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  c text := coalesce(d->>'cuenta', a->>'cuenta');
begin
  if c is distinct from 'IND' then return null; end if;
  insert into inbox.indi_historial (cuenta, tabla, fila_id, antes, despues, por)
  values (c, tg_table_name,
          coalesce(d->>'id', a->>'id', d->>'fecha', a->>'fecha'),
          a, d, d->>'actualizado_por');
  return null;
end $$;

create trigger indi_historial_conocimiento after insert or update or delete on inbox.indi_conocimiento
  for each row execute function inbox.indi_registrar_cambio();
create trigger indi_historial_feriados after insert or update or delete on inbox.indi_feriados
  for each row execute function inbox.indi_registrar_cambio();
create trigger indi_historial_respuestas after insert or update or delete on inbox.respuestas_rapidas
  for each row execute function inbox.indi_registrar_cambio();

alter table inbox.indi_conocimiento enable row level security;
alter table inbox.indi_feriados enable row level security;
alter table inbox.indi_historial enable row level security;
revoke all on inbox.indi_conocimiento, inbox.indi_feriados, inbox.indi_historial from anon, authenticated;
grant all on inbox.indi_conocimiento, inbox.indi_feriados, inbox.indi_historial to service_role;
grant usage, select on sequence inbox.indi_historial_id_seq to service_role;
