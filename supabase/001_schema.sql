-- ═══════════════ DASH CHEFWEB — esquema ═══════════════

-- quem pode ver a dash
create table if not exists public.usuarios_permitidos (
  email text primary key,
  nome  text,
  criado_em timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.usuarios_permitidos u
    where lower(u.email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );
$$;

create table if not exists public.lojas (
  id   smallint primary key,
  nome text not null
);
insert into public.lojas values (1, 'SUSHI LEBLON'), (2, 'NOLA') on conflict do nothing;

-- ── VENDAS (1 linha por venda/mesa) ──
create table if not exists public.vendas (
  chave_venda      text primary key,
  loja             smallint not null references public.lojas(id),
  dia              date not null,
  canal            text,
  status_venda     smallint,
  status           text,
  numero_cupom     text,
  numero_nota      text,
  modelo_fiscal    text,
  mesa             text,
  qtd_pessoas      numeric,
  operador         text,
  garcons          text,
  caixa_numero     text,
  caixa_fechamento text,
  cliente          text,
  valor_itens      numeric(14,2) default 0,
  valor_servico    numeric(14,2) default 0,
  valor_total      numeric(14,2) default 0,
  descontos        numeric(14,2) default 0,
  valor_troco      numeric(14,2) default 0,
  data_integracao  text,
  fonte            text
);
create index if not exists vendas_loja_dia on public.vendas (loja, dia);

-- ── ITENS (1 linha por item) ──
create table if not exists public.itens (
  chave_item     text primary key,
  chave_venda    text not null,
  loja           smallint not null references public.lojas(id),
  dia            date not null,
  canal          text,
  status_venda   smallint,
  codigo_produto integer,
  produto        text,
  subgrupo       text,
  quantidade     numeric(14,3) default 0,
  valor_unitario numeric(14,2) default 0,
  desconto       numeric(14,2) default 0,
  acrescimo      numeric(14,2) default 0,
  valor_total    numeric(14,2) default 0,
  hora           text,
  garcom         text
);
create index if not exists itens_loja_dia on public.itens (loja, dia);
create index if not exists itens_venda on public.itens (chave_venda);
create index if not exists itens_produto on public.itens (loja, codigo_produto, dia);

-- ── PAGAMENTOS ──
create table if not exists public.pagamentos (
  chave_pagto  text primary key,
  chave_venda  text not null,
  loja         smallint not null references public.lojas(id),
  dia          date not null,
  status_venda smallint,
  descricao    text,
  forma        text,
  bandeira     text,
  maquininha   text,
  valor        numeric(14,2) default 0,
  fonte        text
);
create index if not exists pag_loja_dia on public.pagamentos (loja, dia);

-- ── PRODUTOS (cardápio) ──
create table if not exists public.produtos (
  loja             smallint not null references public.lojas(id),
  codigo           integer not null,
  produto          text,
  grupo            text,
  subgrupo         text,
  canal            text,
  local_impressao  text,
  preco_venda      numeric(14,2),
  ativo            boolean default true,
  cozinha_auto     boolean default false,   -- imprime na cozinha (vem do R024)
  cozinha_manual   boolean,                 -- ajuste feito na dash (vence o automático)
  observacao       text,
  custo_ficha      numeric(14,4),
  atualizado_em    timestamptz default now(),
  primary key (loja, codigo)
);

-- ── FICHAS TÉCNICAS ──
create table if not exists public.fichas (
  id              bigint generated always as identity primary key,
  loja            smallint not null references public.lojas(id),
  codigo_composto integer not null,
  composto        text,
  codigo_insumo   integer,
  insumo          text,
  qtd             numeric(18,6),
  un              text,
  custo           numeric(18,6),
  valor           numeric(18,6)
);
create index if not exists fichas_loja_comp on public.fichas (loja, codigo_composto);

-- receita "explodida" até o ingrediente final, por 1 unidade vendida
create table if not exists public.fichas_insumos (
  loja            smallint not null references public.lojas(id),
  codigo_produto  integer not null,
  codigo_insumo   integer not null,
  insumo          text,
  qtd_por_unidade numeric(18,6),   -- na unidade de compra do insumo
  un              text,
  custo_unit      numeric(18,6),
  custo_no_prato  numeric(18,6),
  primary key (loja, codigo_produto, codigo_insumo)
);

-- ── COMPRAS (R016) ──
create table if not exists public.compras (
  id         bigint generated always as identity primary key,
  loja       smallint not null references public.lojas(id),
  data       date not null,
  codigo     integer,
  produto    text,
  fornecedor text,
  qtde       numeric(18,4),
  un         text,
  valor      numeric(14,2),
  arquivo    text
);
create index if not exists compras_loja_data on public.compras (loja, data);

-- ── CONTAGENS DE ESTOQUE ──
create table if not exists public.contagens (
  id                 bigint generated always as identity primary key,
  loja               smallint not null references public.lojas(id),
  data               date not null,
  enviado_em         timestamptz,
  responsavel        text,
  setor              text,
  categoria          text,
  codigo             integer,
  produto            text,
  unidade            text,
  qtd_contada        numeric(18,4),
  un_cadastro        text,
  custo_un           numeric(18,6),
  valor_estoque      numeric(14,2),
  categoria_cadastro text,
  referencia         text not null,   -- mês de referência do fechamento, ex.: 2026-10
  arquivo            text
);
create index if not exists contagens_loja_ref on public.contagens (loja, referencia);
create index if not exists contagens_loja_data on public.contagens (loja, data);

-- histórico de importações
create table if not exists public.importacoes (
  id        bigint generated always as identity primary key,
  tipo      text,
  arquivo   text,
  loja      smallint,
  linhas    integer,
  detalhes  text,
  feito_por text default ((select auth.jwt()) ->> 'email'),
  feito_em  timestamptz default now()
);

-- ═══════════════ SEGURANÇA (RLS) ═══════════════
-- Só e-mails da tabela usuarios_permitidos leem e importam.
do $$
declare t text;
begin
  foreach t in array array['lojas','vendas','itens','pagamentos','produtos','fichas',
                           'fichas_insumos','compras','contagens','importacoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_select on public.%I', t);
    execute format('drop policy if exists staff_insert on public.%I', t);
    execute format('drop policy if exists staff_update on public.%I', t);
    execute format('drop policy if exists staff_delete on public.%I', t);
    execute format('create policy staff_select on public.%I for select to authenticated using ((select public.is_staff()))', t);
    execute format('create policy staff_insert on public.%I for insert to authenticated with check ((select public.is_staff()))', t);
    execute format('create policy staff_update on public.%I for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format('create policy staff_delete on public.%I for delete to authenticated using ((select public.is_staff()))', t);
  end loop;
end $$;

alter table public.usuarios_permitidos enable row level security;
drop policy if exists staff_select on public.usuarios_permitidos;
create policy staff_select on public.usuarios_permitidos for select to authenticated using ((select public.is_staff()));
