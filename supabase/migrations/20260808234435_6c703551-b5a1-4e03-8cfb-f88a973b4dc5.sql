-- Multiplayer foundation for the classroom stock-market simulation.
-- All balance-changing operations are executed by SECURITY DEFINER RPCs.

create type public.game_status as enum ('waiting', 'running', 'paused', 'ended');
create type public.stock_volatility as enum ('low', 'medium', 'high');
create type public.news_type as enum (
  'market_positive',
  'market_negative',
  'stock_positive',
  'stock_negative'
);
create type public.trade_side as enum ('buy', 'sell');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status public.game_status not null default 'waiting',
  initial_cash bigint not null default 1000000 check (initial_cash > 0),
  tick_interval_ms integer not null default 3000 check (tick_interval_ms between 1000 and 10000),
  volatility_multiplier numeric(4, 2) not null default 1 check (volatility_multiplier between 0.2 and 3),
  news_strength_multiplier numeric(4, 2) not null default 1 check (news_strength_multiplier between 0.2 and 3),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stocks (
  game_id uuid not null references public.games(id) on delete cascade,
  id text not null,
  name text not null,
  code text not null,
  industry text not null,
  price bigint not null check (price >= 100),
  previous_price bigint not null check (previous_price >= 100),
  initial_price bigint not null check (initial_price >= 100),
  volatility public.stock_volatility not null,
  updated_at timestamptz not null default now(),
  primary key (game_id, id),
  unique (game_id, code)
);

create table public.news (
  game_id uuid not null references public.games(id) on delete cascade,
  id text not null,
  title text not null,
  description text not null,
  type public.news_type not null,
  target_stock_id text,
  target_stock_name text,
  duration_seconds integer not null check (duration_seconds between 1 and 86400),
  strength numeric(5, 2) not null check (strength >= 0),
  last_activated_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (game_id, id),
  foreign key (game_id, target_stock_id)
    references public.stocks(game_id, id)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 20),
  cash bigint not null check (cash >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, auth_user_id)
);

create unique index players_game_nickname_unique
  on public.players (game_id, lower(nickname));

create table public.holdings (
  player_id uuid not null references public.players(id) on delete cascade,
  game_id uuid not null,
  stock_id text not null,
  quantity integer not null check (quantity > 0),
  avg_price numeric(20, 4) not null check (avg_price >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, stock_id),
  foreign key (game_id, stock_id)
    references public.stocks(game_id, id) on delete cascade
);

create table public.transactions (
  id uuid primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  game_id uuid not null,
  stock_id text not null,
  stock_name text not null,
  side public.trade_side not null,
  quantity integer not null check (quantity > 0),
  price bigint not null check (price >= 100),
  created_at timestamptz not null default now(),
  foreign key (game_id, stock_id)
    references public.stocks(game_id, id)
);

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  game_id uuid references public.games(id) on delete set null,
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index holdings_game_id_idx on public.holdings(game_id);
create index transactions_player_created_idx on public.transactions(player_id, created_at desc);
create index transactions_game_created_idx on public.transactions(game_id, created_at desc);
create index news_game_activated_idx on public.news(game_id, last_activated_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger games_set_updated_at
before update on public.games
for each row execute function public.set_updated_at();

create trigger stocks_set_updated_at
before update on public.stocks
for each row execute function public.set_updated_at();

create trigger players_set_updated_at
before update on public.players
for each row execute function public.set_updated_at();

create trigger holdings_set_updated_at
before update on public.holdings
for each row execute function public.set_updated_at();

create function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where user_id = check_user_id
  );
$$;

alter table public.games enable row level security;
alter table public.stocks enable row level security;
alter table public.news enable row level security;
alter table public.players enable row level security;
alter table public.holdings enable row level security;
alter table public.transactions enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_audit_log enable row level security;

create policy "authenticated users can read games"
on public.games for select to authenticated using (true);

create policy "authenticated users can read stocks"
on public.stocks for select to authenticated using (true);

create policy "players can read released news and admins can read all news"
on public.news for select to authenticated
using (last_activated_at is not null or public.is_admin());

create policy "players can read their account"
on public.players for select to authenticated
using (auth_user_id = auth.uid() or public.is_admin());

create policy "players can read their holdings"
on public.holdings for select to authenticated
using (
  exists (
    select 1 from public.players
    where players.id = holdings.player_id
      and (players.auth_user_id = auth.uid() or public.is_admin())
  )
);

create policy "players can read their transactions"
on public.transactions for select to authenticated
using (
  exists (
    select 1 from public.players
    where players.id = transactions.player_id
      and (players.auth_user_id = auth.uid() or public.is_admin())
  )
);

create policy "admins can read their role"
on public.admin_users for select to authenticated
using (user_id = auth.uid());

create policy "admins can read audit log"
on public.admin_audit_log for select to authenticated
using (public.is_admin());

create function public.join_game(p_nickname text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.games%rowtype;
  v_player_id uuid;
  v_nickname text := trim(p_nickname);
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if char_length(v_nickname) < 2 or char_length(v_nickname) > 20
     or v_nickname ~ '[[:cntrl:]]' then
    raise exception '닉네임은 2~20자로 입력해주세요.';
  end if;

  select * into v_game
  from public.games
  where code = 'SHINDORIM'
  limit 1;

  if not found then
    raise exception '게임이 준비되지 않았습니다.';
  end if;

  if v_game.status = 'ended' then
    raise exception '이미 종료된 게임입니다.';
  end if;

  select id into v_player_id
  from public.players
  where game_id = v_game.id and auth_user_id = v_user_id;

  if found then
    return v_player_id;
  end if;

  insert into public.players (game_id, auth_user_id, nickname, cash)
  values (v_game.id, v_user_id, v_nickname, v_game.initial_cash)
  returning id into v_player_id;

  return v_player_id;
exception
  when unique_violation then
    raise exception '이미 사용 중인 닉네임입니다.';
end;
$$;

create function public.execute_trade(
  p_player_id uuid,
  p_stock_id text,
  p_side public.trade_side,
  p_quantity integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players%rowtype;
  v_stock public.stocks%rowtype;
  v_holding public.holdings%rowtype;
  v_status public.game_status;
  v_total bigint;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 1000000 then
    raise exception '수량은 1주 이상 입력해주세요.';
  end if;

  if exists (
    select 1 from public.transactions
    where id = p_request_id and player_id = p_player_id
  ) then
    return jsonb_build_object('request_id', p_request_id, 'duplicate', true);
  end if;

  select * into v_player
  from public.players
  where id = p_player_id and auth_user_id = auth.uid()
  for update;

  if not found then
    raise exception '참가자 계정을 확인할 수 없습니다.';
  end if;

  select status into v_status
  from public.games
  where id = v_player.game_id;

  if v_status <> 'running' then
    raise exception '게임 진행 중에만 거래할 수 있습니다.';
  end if;

  select * into v_stock
  from public.stocks
  where game_id = v_player.game_id and id = p_stock_id;

  if not found then
    raise exception '종목을 찾을 수 없습니다.';
  end if;

  if p_side = 'buy' then
    v_total := v_stock.price * p_quantity::bigint;
    if v_player.cash < v_total then
      raise exception '보유 현금이 부족합니다.';
    end if;

    update public.players
    set cash = cash - v_total
    where id = v_player.id;

    insert into public.holdings (
      player_id, game_id, stock_id, quantity, avg_price
    ) values (
      v_player.id, v_player.game_id, v_stock.id, p_quantity, v_stock.price
    )
    on conflict (player_id, stock_id) do update
    set avg_price = (
          (public.holdings.avg_price * public.holdings.quantity)
          + (v_stock.price * p_quantity)
        ) / (public.holdings.quantity + p_quantity),
        quantity = public.holdings.quantity + p_quantity;
  else
    select * into v_holding
    from public.holdings
    where player_id = v_player.id and stock_id = v_stock.id
    for update;

    if not found or v_holding.quantity < p_quantity then
      raise exception '보유 수량이 부족합니다.';
    end if;

    v_total := v_stock.price * p_quantity::bigint;

    update public.players
    set cash = cash + v_total
    where id = v_player.id;

    if v_holding.quantity = p_quantity then
      delete from public.holdings
      where player_id = v_player.id and stock_id = v_stock.id;
    else
      update public.holdings
      set quantity = quantity - p_quantity
      where player_id = v_player.id and stock_id = v_stock.id;
    end if;
  end if;

  insert into public.transactions (
    id, player_id, game_id, stock_id, stock_name, side, quantity, price
  ) values (
    p_request_id, v_player.id, v_player.game_id, v_stock.id,
    v_stock.name, p_side, p_quantity, v_stock.price
  );

  return jsonb_build_object(
    'request_id', p_request_id,
    'price', v_stock.price,
    'quantity', p_quantity,
    'side', p_side,
    'duplicate', false
  );
end;
$$;

create function public.get_leaderboard(p_game_id uuid)
returns table (
  player_id uuid,
  nickname text,
  total_assets bigint,
  return_pct numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.nickname,
    (
      p.cash + coalesce(sum(h.quantity::bigint * s.price), 0)
    )::bigint as total_assets,
    round(
      (
        (
          p.cash + coalesce(sum(h.quantity::bigint * s.price), 0)
          - g.initial_cash
        )::numeric / g.initial_cash
      ) * 100,
      4
    ) as return_pct
  from public.players p
  join public.games g on g.id = p.game_id
  left join public.holdings h on h.player_id = p.id
  left join public.stocks s
    on s.game_id = h.game_id and s.id = h.stock_id
  where p.game_id = p_game_id
  group by p.id, p.nickname, p.cash, g.initial_cash
  order by total_assets desc, p.created_at asc;
$$;

create function public.set_game_status(p_game_id uuid, p_status public.game_status)
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
      ended_at = case when p_status = 'ended' then now() else null end
  where id = p_game_id;

  insert into public.admin_audit_log (game_id, admin_user_id, action, details)
  values (p_game_id, auth.uid(), 'set_game_status', jsonb_build_object('status', p_status));
end;
$$;

create function public.update_game_settings(
  p_game_id uuid,
  p_tick_interval_ms integer,
  p_volatility_multiplier numeric,
  p_news_strength_multiplier numeric
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

  if p_tick_interval_ms not between 1000 and 10000
     or p_volatility_multiplier not between 0.2 and 3
     or p_news_strength_multiplier not between 0.2 and 3 then
    raise exception '설정값이 허용 범위를 벗어났습니다.';
  end if;

  update public.games
  set tick_interval_ms = p_tick_interval_ms,
      volatility_multiplier = p_volatility_multiplier,
      news_strength_multiplier = p_news_strength_multiplier
  where id = p_game_id;

  insert into public.admin_audit_log (game_id, admin_user_id, action, details)
  values (
    p_game_id,
    auth.uid(),
    'update_game_settings',
    jsonb_build_object(
      'tick_interval_ms', p_tick_interval_ms,
      'volatility_multiplier', p_volatility_multiplier,
      'news_strength_multiplier', p_news_strength_multiplier
    )
  );
end;
$$;

create function public.activate_news(p_game_id uuid, p_news_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '운영자 권한이 필요합니다.';
  end if;

  if not exists (
    select 1 from public.games where id = p_game_id and status = 'running'
  ) then
    raise exception '게임 진행 중에만 뉴스를 공개할 수 있습니다.';
  end if;

  update public.news
  set last_activated_at = now()
  where game_id = p_game_id and id = p_news_id;

  if not found then
    raise exception '뉴스를 찾을 수 없습니다.';
  end if;

  insert into public.admin_audit_log (game_id, admin_user_id, action, details)
  values (p_game_id, auth.uid(), 'activate_news', jsonb_build_object('news_id', p_news_id));
end;
$$;

create function public.reset_game(p_game_id uuid)
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
      ended_at = null
  where id = p_game_id;

  insert into public.admin_audit_log (game_id, admin_user_id, action)
  values (p_game_id, auth.uid(), 'reset_game');
end;
$$;

revoke all on function public.join_game(text) from public;
revoke all on function public.execute_trade(uuid, text, public.trade_side, integer, uuid) from public;
revoke all on function public.get_leaderboard(uuid) from public;
revoke all on function public.set_game_status(uuid, public.game_status) from public;
revoke all on function public.update_game_settings(uuid, integer, numeric, numeric) from public;
revoke all on function public.activate_news(uuid, text) from public;
revoke all on function public.reset_game(uuid) from public;

grant execute on function public.join_game(text) to authenticated;
grant execute on function public.execute_trade(uuid, text, public.trade_side, integer, uuid) to authenticated;
grant execute on function public.get_leaderboard(uuid) to authenticated;
grant execute on function public.set_game_status(uuid, public.game_status) to authenticated;
grant execute on function public.update_game_settings(uuid, integer, numeric, numeric) to authenticated;
grant execute on function public.activate_news(uuid, text) to authenticated;
grant execute on function public.reset_game(uuid) to authenticated;

grant select on public.games, public.stocks, public.news, public.players,
  public.holdings, public.transactions, public.admin_users, public.admin_audit_log
to authenticated;

insert into public.games (
  id, code, status, initial_cash, tick_interval_ms,
  volatility_multiplier, news_strength_multiplier
) values (
  '00000000-0000-0000-0000-000000000001',
  'SHINDORIM',
  'waiting',
  1000000,
  3000,
  1,
  1
);

insert into public.stocks (
  game_id, id, name, code, industry, price, previous_price, initial_price, volatility
) values
  ('00000000-0000-0000-0000-000000000001', 'edu', '에듀테크코', 'EDU', 'IT', 50000, 50000, 50000, 'medium'),
  ('00000000-0000-0000-0000-000000000001', 'grn', '그린에너지', 'GRN', '에너지', 35000, 35000, 35000, 'high'),
  ('00000000-0000-0000-0000-000000000001', 'kfd', '한국식품', 'KFD', '소비재', 28000, 28000, 28000, 'low'),
  ('00000000-0000-0000-0000-000000000001', 'mvs', '메타버스엔터', 'MVS', '엔터', 72000, 72000, 72000, 'high'),
  ('00000000-0000-0000-0000-000000000001', 'sbk', '안전은행', 'SBK', '금융', 45000, 45000, 45000, 'low'),
  ('00000000-0000-0000-0000-000000000001', 'bhl', '바이오헬스', 'BHL', '헬스케어', 60000, 60000, 60000, 'medium'),
  ('00000000-0000-0000-0000-000000000001', 'slg', '스마트물류', 'SLG', '물류', 33000, 33000, 33000, 'medium');

insert into public.news (
  game_id, id, title, description, type, target_stock_id,
  target_stock_name, duration_seconds, strength
) values
  ('00000000-0000-0000-0000-000000000001', 'n1', '중앙은행, 기준금리 인하 발표', '경기 부양을 위해 기준금리를 0.5%p 인하했습니다.', 'market_positive', null, null, 120, 1.5),
  ('00000000-0000-0000-0000-000000000001', 'n2', '정부, 대규모 경기부양책 발표', '50조 원 규모의 경기부양책이 발표되었습니다.', 'market_positive', null, null, 90, 1),
  ('00000000-0000-0000-0000-000000000001', 'n3', '국제 유가 급등, 인플레이션 우려', '원유 가격이 배럴당 $120을 돌파했습니다.', 'market_negative', null, null, 120, 1.5),
  ('00000000-0000-0000-0000-000000000001', 'n4', '글로벌 공급망 위기 심화', '주요 항만 폐쇄로 물류 대란이 발생했습니다.', 'market_negative', null, null, 90, 1),
  ('00000000-0000-0000-0000-000000000001', 'n5', '외국인 투자자 대규모 매수세', '글로벌 펀드들이 국내 시장에 주목하고 있습니다.', 'market_positive', null, null, 60, 0.8),
  ('00000000-0000-0000-0000-000000000001', 'n6', '미중 무역갈등 재점화', '양국 간 관세 인상 조치가 발표되었습니다.', 'market_negative', null, null, 60, 0.8),
  ('00000000-0000-0000-0000-000000000001', 'n7', '에듀테크코, AI 교육 플랫폼 대박', '글로벌 100만 유저 돌파!', 'stock_positive', 'edu', '에듀테크코', 90, 2),
  ('00000000-0000-0000-0000-000000000001', 'n8', '에듀테크코, 보안 사고 발생', '학생 개인정보 유출 의혹이 제기되었습니다.', 'stock_negative', 'edu', '에듀테크코', 90, 1.8),
  ('00000000-0000-0000-0000-000000000001', 'n9', '그린에너지, 정부 보조금 확정', '신재생에너지 보조금 500억 확정!', 'stock_positive', 'grn', '그린에너지', 90, 1.5),
  ('00000000-0000-0000-0000-000000000001', 'n10', '한국식품, 리콜 사태 발생', '주력 제품에서 이물질이 발견되었습니다.', 'stock_negative', 'kfd', '한국식품', 120, 2),
  ('00000000-0000-0000-0000-000000000001', 'n11', '메타버스엔터, 대형 IP 계약 체결', '글로벌 엔터사와 메타버스 콘텐츠 독점 계약!', 'stock_positive', 'mvs', '메타버스엔터', 60, 1.5),
  ('00000000-0000-0000-0000-000000000001', 'n12', '안전은행, 부실채권 급증', '대출 연체율이 급격히 상승했습니다.', 'stock_negative', 'sbk', '안전은행', 90, 1.5),
  ('00000000-0000-0000-0000-000000000001', 'n13', '바이오헬스, 신약 임상 3상 성공', '혁신 신약 임상시험이 성공적으로 완료!', 'stock_positive', 'bhl', '바이오헬스', 120, 2),
  ('00000000-0000-0000-0000-000000000001', 'n14', '스마트물류, 글로벌 기업과 파트너십 체결', '글로벌 물류 네트워크 확장 계약!', 'stock_positive', 'slg', '스마트물류', 90, 1.5),
  ('00000000-0000-0000-0000-000000000001', 'n15', '바이오헬스, 해외 승인 심사 실패', '주력 신약이 해외 승인 심사에 실패했습니다.', 'stock_negative', 'bhl', '바이오헬스', 120, 2);

alter table public.games replica identity full;
alter table public.stocks replica identity full;
alter table public.news replica identity full;
alter table public.players replica identity full;
alter table public.holdings replica identity full;
alter table public.transactions replica identity full;

alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.stocks;
alter publication supabase_realtime add table public.news;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.holdings;
alter publication supabase_realtime add table public.transactions;