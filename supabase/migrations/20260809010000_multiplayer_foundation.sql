-- Additive server-authoritative market simulation engine.
--
-- One real week maps to one simulated year by default. Price changes are
-- calculated inside Postgres so every connected classroom client sees the
-- same market. Only an admin may drive the clock, and row locking plus the
-- last_tick_at check prevents duplicate ticks from overlapping browser tabs.

alter table public.games
  add column current_tick bigint not null default 0,
  add column last_tick_at timestamptz,
  add column elapsed_game_ms bigint not null default 0 check (elapsed_game_ms >= 0),
  add column scenario_start_date date not null default date '2025-01-01',
  add column scenario_end_date date not null default date '2025-12-31',
  add column scenario_duration_seconds integer not null default 604800
    check (scenario_duration_seconds between 300 and 2592000),
  add column market_seed integer not null default 2026,
  add constraint games_scenario_dates_valid
    check (scenario_end_date > scenario_start_date);

create table public.stock_price_history (
  game_id uuid not null references public.games(id) on delete cascade,
  stock_id text not null,
  tick bigint not null check (tick >= 0),
  price bigint not null check (price >= 100),
  previous_price bigint not null check (previous_price >= 100),
  change_pct numeric(12, 6) not null,
  simulated_at date not null,
  created_at timestamptz not null default now(),
  primary key (game_id, stock_id, tick),
  foreign key (game_id, stock_id)
    references public.stocks(game_id, id) on delete cascade
);

create index stock_price_history_lookup_idx
  on public.stock_price_history(game_id, stock_id, tick desc);

alter table public.stock_price_history enable row level security;

create policy "authenticated users can read stock price history"
on public.stock_price_history for select to authenticated using (true);

grant select on public.stock_price_history to authenticated;

-- Stable pseudo-random value in [-1, 1]. The same market seed, tick and stock
-- always produce the same result, which makes a run auditable and repeatable.
create function public.deterministic_market_noise(p_key text)
returns numeric
language sql
immutable
strict
set search_path = public
as $$
  select (
    (
      get_byte(decode(md5(p_key), 'hex'), 0)::numeric * 16777216
      + get_byte(decode(md5(p_key), 'hex'), 1)::numeric * 65536
      + get_byte(decode(md5(p_key), 'hex'), 2)::numeric * 256
      + get_byte(decode(md5(p_key), 'hex'), 3)::numeric
    ) / 4294967295::numeric
  ) * 2 - 1;
$$;

create or replace function public.set_game_status(
  p_game_id uuid,
  p_status public.game_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '운영자 권한이 필요합니다.';
  end if;

  update public.games
  set status = p_status,
      started_at = case
        when p_status = 'running' then coalesce(started_at, now())
        else started_at
      end,
      ended_at = case when p_status = 'ended' then now() else null end,
      last_tick_at = case when p_status = 'running' then clock_timestamp() else null end
  where id = p_game_id;

  if not found then
    raise exception '게임을 찾을 수 없습니다.';
  end if;

  insert into public.admin_audit_log (game_id, admin_user_id, action, details)
  values (p_game_id, auth.uid(), 'set_game_status', jsonb_build_object('status', p_status));
end;
$$;

create function public.update_scenario_duration(
  p_game_id uuid,
  p_scenario_duration_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '운영자 권한이 필요합니다.';
  end if;

  if p_scenario_duration_seconds not between 300 and 2592000 then
    raise exception '시나리오 진행 시간은 5분~30일 사이여야 합니다.';
  end if;

  update public.games
  set scenario_duration_seconds = p_scenario_duration_seconds
  where id = p_game_id
    and status = 'waiting'
    and current_tick = 0
    and elapsed_game_ms = 0;

  if not found then
    raise exception '게임 시작 전 또는 초기화 직후에만 진행 시간을 바꿀 수 있습니다.';
  end if;

  insert into public.admin_audit_log (game_id, admin_user_id, action, details)
  values (
    p_game_id,
    auth.uid(),
    'update_scenario_duration',
    jsonb_build_object('scenario_duration_seconds', p_scenario_duration_seconds)
  );
end;
$$;

create function public.advance_market(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_game public.games%rowtype;
  v_stock public.stocks%rowtype;
  v_tick bigint;
  v_elapsed_ms bigint;
  v_remaining_ms bigint;
  v_new_elapsed_ms bigint;
  v_total_duration_ms bigint;
  v_delta_progress numeric;
  v_noise numeric;
  v_news_impact numeric;
  v_annual_volatility numeric;
  v_change numeric;
  v_new_price bigint;
  v_simulated_at date;
  v_history_every bigint;
  v_record_history boolean;
  v_ended boolean := false;
begin
  if not public.is_admin() then
    raise exception '운영자 권한이 필요합니다.';
  end if;

  -- The row lock serializes requests from duplicated operator tabs.
  select * into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception '게임을 찾을 수 없습니다.';
  end if;

  if v_game.status <> 'running' then
    return jsonb_build_object('advanced', false, 'reason', 'not_running');
  end if;

  if v_game.last_tick_at is null then
    update public.games set last_tick_at = v_now where id = p_game_id;
    return jsonb_build_object('advanced', false, 'reason', 'clock_started');
  end if;

  v_elapsed_ms := floor(extract(epoch from (v_now - v_game.last_tick_at)) * 1000)::bigint;
  if v_elapsed_ms < v_game.tick_interval_ms then
    return jsonb_build_object('advanced', false, 'reason', 'too_early');
  end if;

  v_total_duration_ms := v_game.scenario_duration_seconds::bigint * 1000;
  v_remaining_ms := greatest(0, v_total_duration_ms - v_game.elapsed_game_ms);

  if v_remaining_ms = 0 then
    update public.games
    set status = 'ended', ended_at = coalesce(ended_at, v_now), last_tick_at = null
    where id = p_game_id;
    return jsonb_build_object('advanced', false, 'reason', 'scenario_complete', 'ended', true);
  end if;

  -- A sleeping browser may return late. Applying the whole elapsed interval in
  -- one Brownian-style step keeps the scenario clock correct without replaying
  -- thousands of individual ticks.
  v_elapsed_ms := least(v_elapsed_ms, v_remaining_ms);
  v_new_elapsed_ms := v_game.elapsed_game_ms + v_elapsed_ms;
  v_delta_progress := v_elapsed_ms::numeric / v_total_duration_ms;
  v_tick := v_game.current_tick + 1;
  v_simulated_at := v_game.scenario_start_date
    + floor(
        (v_game.scenario_end_date - v_game.scenario_start_date)
        * (v_new_elapsed_ms::numeric / v_total_duration_ms)
      )::integer;

  v_history_every := greatest(1, ceil(30000.0 / v_game.tick_interval_ms)::bigint);
  v_record_history := v_tick = 1
    or mod(v_tick, v_history_every) = 0
    or v_elapsed_ms >= 30000
    or v_new_elapsed_ms >= v_total_duration_ms;

  for v_stock in
    select * from public.stocks where game_id = p_game_id order by id for update
  loop
    v_annual_volatility := case v_stock.volatility
      when 'low' then 0.12
      when 'medium' then 0.20
      when 'high' then 0.32
      else 0.20
    end;

    -- sqrt(3) normalizes the variance of the deterministic uniform noise.
    v_noise := public.deterministic_market_noise(
      p_game_id::text || ':' || v_game.market_seed::text || ':'
      || v_tick::text || ':' || v_stock.id
    ) * v_annual_volatility * v_game.volatility_multiplier
      * sqrt(3 * v_delta_progress);

    -- A market news strength of 1.0 contributes 2% over its full duration;
    -- stock-specific news contributes 4%. Only the elapsed overlap is applied.
    select coalesce(sum(
      (case when n.type in ('market_positive', 'stock_positive') then 1 else -1 end)
      * n.strength
      * v_game.news_strength_multiplier
      * (case when n.type in ('stock_positive', 'stock_negative') then 0.04 else 0.02 end)
      * greatest(
          0,
          extract(epoch from (
            least(v_now, n.last_activated_at + make_interval(secs => n.duration_seconds))
            - greatest(v_game.last_tick_at, n.last_activated_at)
          )) / n.duration_seconds
        )
    ), 0)
    into v_news_impact
    from public.news n
    where n.game_id = p_game_id
      and n.last_activated_at is not null
      and n.last_activated_at < v_now
      and n.last_activated_at + make_interval(secs => n.duration_seconds) > v_game.last_tick_at
      and (
        n.type in ('market_positive', 'market_negative')
        or n.target_stock_id = v_stock.id
      );

    -- The per-update circuit breaker prevents a long-disconnected tab or
    -- stacked news cards from producing an implausible one-step price jump.
    v_change := greatest(-0.25, least(0.25, v_noise + v_news_impact));
    v_new_price := greatest(100, round(v_stock.price * (1 + v_change))::bigint);

    update public.stocks
    set previous_price = v_stock.price,
        price = v_new_price
    where game_id = p_game_id and id = v_stock.id;

    if v_record_history then
      insert into public.stock_price_history (
        game_id, stock_id, tick, price, previous_price, change_pct, simulated_at
      ) values (
        p_game_id,
        v_stock.id,
        v_tick,
        v_new_price,
        v_stock.price,
        round(v_change * 100, 6),
        v_simulated_at
      )
      on conflict (game_id, stock_id, tick) do nothing;
    end if;
  end loop;

  v_ended := v_new_elapsed_ms >= v_total_duration_ms;

  update public.games
  set current_tick = v_tick,
      elapsed_game_ms = v_new_elapsed_ms,
      last_tick_at = case when v_ended then null else v_now end,
      status = case when v_ended then 'ended'::public.game_status else status end,
      ended_at = case when v_ended then v_now else ended_at end
  where id = p_game_id;

  return jsonb_build_object(
    'advanced', true,
    'tick', v_tick,
    'elapsed_game_ms', v_new_elapsed_ms,
    'simulated_at', v_simulated_at,
    'progress', round(v_new_elapsed_ms::numeric / v_total_duration_ms, 8),
    'ended', v_ended
  );
end;
$$;

create or replace function public.reset_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '운영자 권한이 필요합니다.';
  end if;

  delete from public.transactions where game_id = p_game_id;
  delete from public.holdings where game_id = p_game_id;
  delete from public.players where game_id = p_game_id;
  delete from public.stock_price_history where game_id = p_game_id;

  update public.stocks
  set price = initial_price, previous_price = initial_price
  where game_id = p_game_id;

  update public.news
  set last_activated_at = null
  where game_id = p_game_id;

  update public.games
  set status = 'waiting',
      tick_interval_ms = 3000,
      volatility_multiplier = 1,
      news_strength_multiplier = 1,
      started_at = null,
      ended_at = null,
      current_tick = 0,
      last_tick_at = null,
      elapsed_game_ms = 0
  where id = p_game_id;

  insert into public.stock_price_history (
    game_id, stock_id, tick, price, previous_price, change_pct, simulated_at
  )
  select game_id, id, 0, initial_price, initial_price, 0, g.scenario_start_date
  from public.stocks s
  join public.games g on g.id = s.game_id
  where s.game_id = p_game_id;

  insert into public.admin_audit_log (game_id, admin_user_id, action)
  values (p_game_id, auth.uid(), 'reset_game');
end;
$$;

insert into public.stock_price_history (
  game_id, stock_id, tick, price, previous_price, change_pct, simulated_at
)
select s.game_id, s.id, 0, s.price, s.previous_price, 0, g.scenario_start_date
from public.stocks s
join public.games g on g.id = s.game_id
on conflict (game_id, stock_id, tick) do nothing;

revoke all on function public.deterministic_market_noise(text) from public;
revoke all on function public.advance_market(uuid) from public;
revoke all on function public.update_scenario_duration(uuid, integer) from public;

grant execute on function public.advance_market(uuid) to authenticated;
grant execute on function public.update_scenario_duration(uuid, integer) to authenticated;

alter table public.stock_price_history replica identity full;
