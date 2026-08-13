-- Admin-only scenario control for the classroom market simulation.
--
-- Each stock has four quarter-end targets expressed as a multiplier of its
-- initial price. Targets stay hidden from student sessions, become immutable
-- after their quarter passes, and gently steer the server-authoritative market
-- price while news and volatility continue to create variation.

create table public.scenario_targets (
  game_id uuid not null references public.games(id) on delete cascade,
  stock_id text not null,
  quarter smallint not null check (quarter between 1 and 4),
  target_multiplier numeric(7, 4) not null check (target_multiplier between 0.4 and 2.0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (game_id, stock_id, quarter),
  foreign key (game_id, stock_id)
    references public.stocks(game_id, id) on delete cascade
);

create index scenario_targets_game_stock_idx
  on public.scenario_targets(game_id, stock_id, quarter);

alter table public.scenario_targets enable row level security;

create policy "admins can read scenario targets"
on public.scenario_targets for select to authenticated
using (public.is_admin());

grant select on public.scenario_targets to authenticated;

insert into public.scenario_targets (game_id, stock_id, quarter, target_multiplier)
select
  s.game_id,
  s.id,
  defaults.quarter,
  defaults.target_multiplier
from public.stocks s
cross join (
  values
    (1::smallint, 1.04::numeric),
    (2::smallint, 0.96::numeric),
    (3::smallint, 1.12::numeric),
    (4::smallint, 1.02::numeric)
) as defaults(quarter, target_multiplier)
on conflict (game_id, stock_id, quarter) do nothing;

create function public.set_scenario_target(
  p_game_id uuid,
  p_stock_id text,
  p_quarter smallint,
  p_target_multiplier numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_progress numeric;
  v_previous numeric;
begin
  if not public.is_admin() then
    raise exception '운영자 권한이 필요합니다.';
  end if;

  if p_quarter not between 1 and 4 then
    raise exception '분기는 1~4 사이여야 합니다.';
  end if;

  if p_target_multiplier not between 0.4 and 2.0 then
    raise exception '목표 가격은 시작가의 40%~200% 사이여야 합니다.';
  end if;

  select * into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception '게임을 찾을 수 없습니다.';
  end if;

  if not exists (
    select 1 from public.stocks
    where game_id = p_game_id and id = p_stock_id
  ) then
    raise exception '종목을 찾을 수 없습니다.';
  end if;

  v_progress := least(
    1,
    greatest(
      0,
      v_game.elapsed_game_ms::numeric
        / greatest(1, v_game.scenario_duration_seconds::bigint * 1000)
    )
  );

  if v_progress >= p_quarter::numeric / 4 then
    raise exception '이미 지난 분기의 경로는 변경할 수 없습니다.';
  end if;

  select target_multiplier into v_previous
  from public.scenario_targets
  where game_id = p_game_id
    and stock_id = p_stock_id
    and quarter = p_quarter;

  insert into public.scenario_targets (
    game_id, stock_id, quarter, target_multiplier, updated_by, updated_at
  ) values (
    p_game_id,
    p_stock_id,
    p_quarter,
    round(p_target_multiplier, 4),
    auth.uid(),
    now()
  )
  on conflict (game_id, stock_id, quarter) do update
  set target_multiplier = excluded.target_multiplier,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  insert into public.admin_audit_log (game_id, admin_user_id, action, details)
  values (
    p_game_id,
    auth.uid(),
    'set_scenario_target',
    jsonb_build_object(
      'stock_id', p_stock_id,
      'quarter', p_quarter,
      'previous_multiplier', v_previous,
      'target_multiplier', round(p_target_multiplier, 4),
      'progress', round(v_progress, 6)
    )
  );
end;
$$;

create or replace function public.advance_market(p_game_id uuid)
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
  v_progress numeric;
  v_quarter integer;
  v_segment_start numeric;
  v_segment_fraction numeric;
  v_previous_multiplier numeric;
  v_next_multiplier numeric;
  v_path_multiplier numeric;
  v_path_target_price numeric;
  v_scenario_drift numeric;
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

  v_elapsed_ms := least(v_elapsed_ms, v_remaining_ms);
  v_new_elapsed_ms := v_game.elapsed_game_ms + v_elapsed_ms;
  v_delta_progress := v_elapsed_ms::numeric / v_total_duration_ms;
  v_progress := least(1, v_new_elapsed_ms::numeric / v_total_duration_ms);
  v_tick := v_game.current_tick + 1;
  v_simulated_at := v_game.scenario_start_date
    + floor(
        (v_game.scenario_end_date - v_game.scenario_start_date)
        * v_progress
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

    v_noise := public.deterministic_market_noise(
      p_game_id::text || ':' || v_game.market_seed::text || ':'
      || v_tick::text || ':' || v_stock.id
    ) * v_annual_volatility * v_game.volatility_multiplier
      * sqrt(3 * v_delta_progress);

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

    v_quarter := least(4, greatest(1, ceil(v_progress * 4)::integer));
    v_segment_start := (v_quarter - 1)::numeric / 4;
    v_segment_fraction := least(1, greatest(0, (v_progress - v_segment_start) * 4));

    if v_quarter = 1 then
      v_previous_multiplier := 1;
    else
      select target_multiplier into v_previous_multiplier
      from public.scenario_targets
      where game_id = p_game_id
        and stock_id = v_stock.id
        and quarter = v_quarter - 1;
      v_previous_multiplier := coalesce(v_previous_multiplier, 1);
    end if;

    select target_multiplier into v_next_multiplier
    from public.scenario_targets
    where game_id = p_game_id
      and stock_id = v_stock.id
      and quarter = v_quarter;
    v_next_multiplier := coalesce(v_next_multiplier, v_previous_multiplier);

    v_path_multiplier := v_previous_multiplier
      + (v_next_multiplier - v_previous_multiplier) * v_segment_fraction;
    v_path_target_price := greatest(100, v_stock.initial_price * v_path_multiplier);

    -- The scenario is a steering force, not a revealed fixed answer. A full
    -- quarter supplies enough pull to approach its target while still leaving
    -- room for deterministic volatility and released news.
    v_scenario_drift := (v_path_target_price / v_stock.price - 1)
      * least(1, 16 * v_delta_progress);

    v_change := greatest(
      -0.25,
      least(0.25, v_noise + v_news_impact + v_scenario_drift)
    );
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
    'progress', round(v_progress, 8),
    'ended', v_ended
  );
end;
$$;

revoke all on function public.set_scenario_target(uuid, text, smallint, numeric) from public;
grant execute on function public.set_scenario_target(uuid, text, smallint, numeric) to authenticated;

alter table public.scenario_targets replica identity full;
