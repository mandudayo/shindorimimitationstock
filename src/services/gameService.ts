import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import type {
  GameState,
  Holding,
  LeaderboardEntry,
  NewsItem,
  Player,
  Stock,
  Transaction,
} from '@/types/game';

const GAME_CODE = 'SHINDORIM';

type GameRow = Tables<'games'>;
type StockRow = Tables<'stocks'>;
type NewsRow = Tables<'news'>;
type PlayerRow = Tables<'players'>;
type HoldingRow = Tables<'holdings'>;
type TransactionRow = Tables<'transactions'>;

type LeaderboardRow = {
  player_id: string;
  nickname: string;
  total_assets: number;
  return_pct: number;
};

export interface GameSnapshotRows {
  game: GameRow;
  stocks: StockRow[];
  news: NewsRow[];
  leaderboard: LeaderboardRow[];
  player?: PlayerRow;
  holdings?: HoldingRow[];
  transactions?: TransactionRow[];
}

export interface GameSnapshot {
  state: GameState;
  isAdmin: boolean;
  userId: string;
}

function toNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

function mapStock(row: StockRow): Stock {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    industry: row.industry,
    price: toNumber(row.price),
    previousPrice: toNumber(row.previous_price),
    initialPrice: toNumber(row.initial_price),
    volatility: row.volatility,
  };
}

function mapNews(row: NewsRow): NewsItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    targetStockId: row.target_stock_id ?? undefined,
    targetStockName: row.target_stock_name ?? undefined,
    duration: row.duration_seconds,
    strength: toNumber(row.strength),
    activatedAt: row.last_activated_at
      ? new Date(row.last_activated_at).getTime()
      : undefined,
  };
}

function mapHolding(row: HoldingRow): Holding {
  return {
    stockId: row.stock_id,
    quantity: row.quantity,
    avgPrice: Math.round(toNumber(row.avg_price)),
  };
}

function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    stockId: row.stock_id,
    stockName: row.stock_name,
    type: row.side,
    quantity: row.quantity,
    price: toNumber(row.price),
    timestamp: new Date(row.created_at).getTime(),
  };
}

function mapPlayer(
  player: PlayerRow,
  holdings: HoldingRow[] = [],
  transactions: TransactionRow[] = [],
): Player {
  return {
    id: player.id,
    nickname: player.nickname,
    cash: toNumber(player.cash),
    holdings: holdings.map(mapHolding),
    transactions: transactions.map(mapTransaction),
  };
}

export function mapGameSnapshot(rows: GameSnapshotRows): GameState {
  const newsPool = rows.news.map(mapNews);
  const now = Date.now();
  const newsHistory = newsPool
    .filter((item) => item.activatedAt !== undefined)
    .sort((a, b) => (b.activatedAt ?? 0) - (a.activatedAt ?? 0));
  const activeNews = newsHistory.filter(
    (item) =>
      item.activatedAt !== undefined
      && now - item.activatedAt < item.duration * 1000,
  );
  const leaderboard: LeaderboardEntry[] = rows.leaderboard.map((entry) => ({
    playerId: entry.player_id,
    nickname: entry.nickname,
    totalAssets: toNumber(entry.total_assets),
    returnPct: toNumber(entry.return_pct),
  }));

  return {
    id: rows.game.id,
    status: rows.game.status,
    stocks: rows.stocks.map(mapStock),
    newsPool,
    activeNews,
    newsHistory,
    currentPlayer: rows.player
      ? mapPlayer(rows.player, rows.holdings, rows.transactions)
      : undefined,
    leaderboard,
    tickInterval: rows.game.tick_interval_ms,
    volatilityMultiplier: toNumber(rows.game.volatility_multiplier),
    newsStrengthMultiplier: toNumber(rows.game.news_strength_multiplier),
    initialCash: toNumber(rows.game.initial_cash),
    startedAt: rows.game.started_at
      ? new Date(rows.game.started_at).getTime()
      : undefined,
  };
}

let sessionPromise: Promise<User> | undefined;

export function ensureSession(): Promise<User> {
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session?.user) return sessionData.session.user;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    if (!data.user) throw new Error('익명 참가자 세션을 만들 수 없습니다.');
    return data.user;
  })().catch((error) => {
    sessionPromise = undefined;
    throw error;
  });

  return sessionPromise;
}

function assertData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('서버에서 데이터를 받지 못했습니다.');
  return data;
}

export async function loadGameSnapshot(): Promise<GameSnapshot> {
  const user = await ensureSession();
  const gameResult = await supabase
    .from('games')
    .select('*')
    .eq('code', GAME_CODE)
    .single();
  const game = assertData(gameResult.data, gameResult.error);

  const [stocksResult, newsResult, leaderboardResult, adminResult, playerResult] =
    await Promise.all([
      supabase.from('stocks').select('*').eq('game_id', game.id).order('code'),
      supabase.from('news').select('*').eq('game_id', game.id).order('id'),
      supabase.rpc('get_leaderboard', { p_game_id: game.id }),
      supabase.rpc('is_admin'),
      supabase
        .from('players')
        .select('*')
        .eq('game_id', game.id)
        .eq('auth_user_id', user.id)
        .maybeSingle(),
    ]);

  const stocks = assertData(stocksResult.data, stocksResult.error);
  const news = assertData(newsResult.data, newsResult.error);
  const leaderboard = assertData(leaderboardResult.data, leaderboardResult.error);
  if (adminResult.error) throw new Error(adminResult.error.message);
  if (playerResult.error) throw new Error(playerResult.error.message);

  const player = playerResult.data ?? undefined;
  let holdings: HoldingRow[] = [];
  let transactions: TransactionRow[] = [];

  if (player) {
    const [holdingsResult, transactionsResult] = await Promise.all([
      supabase.from('holdings').select('*').eq('player_id', player.id).order('stock_id'),
      supabase
        .from('transactions')
        .select('*')
        .eq('player_id', player.id)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);
    holdings = assertData(holdingsResult.data, holdingsResult.error);
    transactions = assertData(transactionsResult.data, transactionsResult.error);
  }

  return {
    state: mapGameSnapshot({
      game,
      stocks,
      news,
      leaderboard,
      player,
      holdings,
      transactions,
    }),
    isAdmin: adminResult.data === true,
    userId: user.id,
  };
}

export async function joinGame(nickname: string): Promise<string> {
  await ensureSession();
  const { data, error } = await supabase.rpc('join_game', {
    p_nickname: nickname,
  });
  return assertData(data, error);
}

export async function executeTrade(
  playerId: string,
  stockId: string,
  side: 'buy' | 'sell',
  quantity: number,
): Promise<void> {
  const { error } = await supabase.rpc('execute_trade', {
    p_player_id: playerId,
    p_stock_id: stockId,
    p_side: side,
    p_quantity: quantity,
    p_request_id: crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
}

export async function setGameStatus(
  gameId: string,
  status: GameState['status'],
): Promise<void> {
  const { error } = await supabase.rpc('set_game_status', {
    p_game_id: gameId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}

export async function updateGameSettings(
  gameId: string,
  settings: Pick<
    GameState,
    'tickInterval' | 'volatilityMultiplier' | 'newsStrengthMultiplier'
  >,
): Promise<void> {
  const { error } = await supabase.rpc('update_game_settings', {
    p_game_id: gameId,
    p_tick_interval_ms: settings.tickInterval,
    p_volatility_multiplier: settings.volatilityMultiplier,
    p_news_strength_multiplier: settings.newsStrengthMultiplier,
  });
  if (error) throw new Error(error.message);
}

export async function activateNews(gameId: string, newsId: string): Promise<void> {
  const { error } = await supabase.rpc('activate_news', {
    p_game_id: gameId,
    p_news_id: newsId,
  });
  if (error) throw new Error(error.message);
}

export async function resetGame(gameId: string): Promise<void> {
  const { error } = await supabase.rpc('reset_game', { p_game_id: gameId });
  if (error) throw new Error(error.message);
}

export async function signInAdmin(email: string, password: string): Promise<void> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  sessionPromise = data.user ? Promise.resolve(data.user) : undefined;
  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
  if (adminError || !isAdmin) {
    await supabase.auth.signOut();
    sessionPromise = undefined;
    throw new Error('운영자 권한이 등록되지 않은 계정입니다.');
  }
}

export async function signOutAdmin(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
  sessionPromise = undefined;
  await ensureSession();
}

export function subscribeToGame(gameId: string, onChange: () => void): RealtimeChannel {
  const channel = supabase.channel(`game-${gameId}-${crypto.randomUUID()}`);
  const tables = ['games', 'stocks', 'news', 'players', 'holdings', 'transactions'] as const;

  for (const table of tables) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      onChange,
    );
  }

  return channel.subscribe();
}

export async function unsubscribeFromGame(channel: RealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel);
}
