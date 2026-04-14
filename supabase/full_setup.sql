create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.cart_sessions (
  id uuid primary key default gen_random_uuid(),
  currency text not null default 'PEN',
  total_amount numeric(10, 2) not null default 0,
  total_items integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cart_items (
  id bigint generated always as identity primary key,
  cart_id uuid not null references public.cart_sessions(id) on delete cascade,
  product_code text not null,
  name text not null,
  summary text not null default '',
  image_url text,
  category text not null,
  rarity text not null,
  unit_price numeric(10, 2) not null default 0,
  quantity integer not null default 1,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.product_inventory (
  product_code text primary key,
  product_name text not null,
  image_url text,
  available_quantity integer not null default 0 check (available_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.order_requests (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid references public.cart_sessions(id) on delete set null,
  customer_name text,
  customer_phone text,
  customer_notes text,
  status text not null default 'pending_approval' check (status in ('pending_approval', 'approved', 'rejected', 'cancelled')),
  total_amount numeric(10, 2) not null default 0,
  total_items integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  approved_at timestamptz,
  rejected_at timestamptz
);

create table if not exists public.order_request_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.order_requests(id) on delete cascade,
  product_code text not null,
  product_name text not null,
  image_url text,
  category text not null,
  rarity text not null,
  unit_price numeric(10, 2) not null default 0,
  quantity integer not null check (quantity > 0),
  line_total numeric(10, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists cart_items_cart_id_idx on public.cart_items(cart_id);
create unique index if not exists cart_items_cart_id_product_code_idx on public.cart_items(cart_id, product_code);
create index if not exists product_inventory_is_active_idx on public.product_inventory(is_active);
create index if not exists order_requests_status_idx on public.order_requests(status, created_at desc);
create index if not exists order_request_items_order_id_idx on public.order_request_items(order_id);
create index if not exists order_request_items_product_code_idx on public.order_request_items(product_code);

drop trigger if exists product_inventory_set_updated_at on public.product_inventory;
create trigger product_inventory_set_updated_at
before update on public.product_inventory
for each row
execute function public.set_updated_at();

drop trigger if exists order_requests_set_updated_at on public.order_requests;
create trigger order_requests_set_updated_at
before update on public.order_requests
for each row
execute function public.set_updated_at();

create or replace function public.submit_cart_for_approval(
  p_cart_id uuid,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_notes text default null
)
returns uuid
language plpgsql
as $$
declare
  v_order_id uuid;
  v_cart public.cart_sessions%rowtype;
begin
  select *
  into v_cart
  from public.cart_sessions
  where id = p_cart_id;

  if not found then
    raise exception 'Cart session % does not exist', p_cart_id;
  end if;

  if v_cart.total_items <= 0 then
    raise exception 'Cart session % is empty', p_cart_id;
  end if;

  insert into public.order_requests (
    cart_id,
    customer_name,
    customer_phone,
    customer_notes,
    total_amount,
    total_items,
    status
  ) values (
    p_cart_id,
    p_customer_name,
    p_customer_phone,
    p_customer_notes,
    v_cart.total_amount,
    v_cart.total_items,
    'pending_approval'
  )
  returning id into v_order_id;

  insert into public.order_request_items (
    order_id,
    product_code,
    product_name,
    image_url,
    category,
    rarity,
    unit_price,
    quantity,
    line_total
  )
  select
    v_order_id,
    ci.product_code,
    ci.name,
    ci.image_url,
    ci.category,
    ci.rarity,
    ci.unit_price,
    ci.quantity,
    ci.unit_price * ci.quantity
  from public.cart_items ci
  where ci.cart_id = p_cart_id;

  delete from public.cart_items
  where cart_id = p_cart_id;

  update public.cart_sessions
  set status = 'pending_approval',
      total_amount = 0,
      total_items = 0
  where id = p_cart_id;

  return v_order_id;
end;
$$;

create or replace function public.approve_order_request(p_order_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_order public.order_requests%rowtype;
  v_item record;
  v_stock integer;
begin
  select *
  into v_order
  from public.order_requests
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order request % does not exist', p_order_id;
  end if;

  if v_order.status <> 'pending_approval' then
    raise exception 'Order request % is not pending approval', p_order_id;
  end if;

  for v_item in
    select product_code, quantity
    from public.order_request_items
    where order_id = p_order_id
  loop
    select available_quantity
    into v_stock
    from public.product_inventory
    where product_code = v_item.product_code
    for update;

    if v_stock is null then
      raise exception 'Inventory row for product % does not exist', v_item.product_code;
    end if;

    if v_stock < v_item.quantity then
      raise exception 'Insufficient stock for product %', v_item.product_code;
    end if;

    update public.product_inventory
    set available_quantity = available_quantity - v_item.quantity
    where product_code = v_item.product_code;
  end loop;

  update public.order_requests
  set status = 'approved',
      approved_at = timezone('utc', now())
  where id = p_order_id;

  if v_order.cart_id is not null then
    update public.cart_sessions
    set status = 'approved'
    where id = v_order.cart_id;
  end if;

  return p_order_id;
end;
$$;

create or replace function public.reject_order_request(
  p_order_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
as $$
declare
  v_cart_id uuid;
begin
  update public.order_requests
  set status = 'rejected',
      customer_notes = coalesce(customer_notes, '') || case when p_reason is null or p_reason = '' then '' else E'\nRechazo: ' || p_reason end,
      rejected_at = timezone('utc', now())
  where id = p_order_id
  returning cart_id into v_cart_id;

  if not found then
    raise exception 'Order request % does not exist', p_order_id;
  end if;

  if v_cart_id is not null then
    update public.cart_sessions
    set status = 'rejected'
    where id = v_cart_id;
  end if;

  return p_order_id;
end;
$$;

create or replace view public.pending_order_cards as
select
  orq.id,
  orq.cart_id,
  orq.customer_name,
  orq.customer_phone,
  orq.status,
  orq.total_items,
  orq.total_amount,
  orq.created_at,
  json_agg(
    json_build_object(
      'product_code', ori.product_code,
      'product_name', ori.product_name,
      'image_url', ori.image_url,
      'category', ori.category,
      'rarity', ori.rarity,
      'quantity', ori.quantity,
      'unit_price', ori.unit_price,
      'line_total', ori.line_total
    )
    order by ori.id
  ) as items
from public.order_requests orq
join public.order_request_items ori on ori.order_id = orq.id
where orq.status = 'pending_approval'
group by orq.id;

create or replace function public.get_top_selling_venom_products(p_limit integer default 6)
returns table (
  product_code text,
  product_name text,
  image_url text,
  category text,
  rarity text,
  unit_price numeric,
  approved_tickets bigint,
  total_units bigint
)
language sql
security definer
set search_path = public
as $$
  select
    ori.product_code,
    max(ori.product_name) as product_name,
    max(ori.image_url) as image_url,
    max(ori.category) as category,
    max(ori.rarity) as rarity,
    max(ori.unit_price) as unit_price,
    count(distinct orq.id) as approved_tickets,
    sum(ori.quantity) as total_units
  from public.order_request_items ori
  join public.order_requests orq on orq.id = ori.order_id
  where orq.status = 'approved'
  group by ori.product_code
  order by approved_tickets desc, total_units desc, product_code asc
  limit greatest(coalesce(p_limit, 6), 1);
$$;

grant execute on function public.get_top_selling_venom_products(integer) to anon, authenticated;

alter table public.cart_sessions enable row level security;
alter table public.cart_items enable row level security;
alter table public.product_inventory enable row level security;
alter table public.order_requests enable row level security;
alter table public.order_request_items enable row level security;

drop policy if exists "anon can manage cart sessions" on public.cart_sessions;
drop policy if exists "authenticated can manage cart sessions" on public.cart_sessions;
drop policy if exists "public can manage cart sessions" on public.cart_sessions;
create policy "public can manage cart sessions"
on public.cart_sessions
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "anon can manage cart items" on public.cart_items;
drop policy if exists "authenticated can manage cart items" on public.cart_items;
drop policy if exists "public can manage cart items" on public.cart_items;
create policy "public can manage cart items"
on public.cart_items
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "prototype can read inventory" on public.product_inventory;
drop policy if exists "public can read inventory" on public.product_inventory;
drop policy if exists "authenticated can read inventory" on public.product_inventory;
drop policy if exists "authenticated can manage inventory" on public.product_inventory;
create policy "public can read inventory"
on public.product_inventory
for select
to anon, authenticated
using (is_active = true);

create policy "authenticated can read inventory"
on public.product_inventory
for select
to authenticated
using (true);

create policy "authenticated can manage inventory"
on public.product_inventory
for all
to authenticated
using (true)
with check (true);

drop policy if exists "prototype can manage order requests" on public.order_requests;
drop policy if exists "authenticated can manage order requests" on public.order_requests;
drop policy if exists "public can create order requests" on public.order_requests;
create policy "public can create order requests"
on public.order_requests
for insert
to anon, authenticated
with check (true);

create policy "authenticated can manage order requests"
on public.order_requests
for all
to authenticated
using (true)
with check (true);

drop policy if exists "prototype can manage order request items" on public.order_request_items;
drop policy if exists "authenticated can manage order request items" on public.order_request_items;
drop policy if exists "public can create order request items" on public.order_request_items;
create policy "public can create order request items"
on public.order_request_items
for insert
to anon, authenticated
with check (true);

create policy "authenticated can manage order request items"
on public.order_request_items
for all
to authenticated
using (true)
with check (true);

comment on table public.product_inventory is 'Inventario por producto. Se descuenta cuando un pedido pendiente es aprobado.';
comment on table public.order_requests is 'Pedidos generados desde el carrito, con flujo de pending_approval, approved o rejected.';
comment on view public.pending_order_cards is 'Vista lista para renderizar cards de pedidos pendientes de aprobación.';