export type Volatility = 'low' | 'medium' | 'high';
export type NewsType = 'market_positive' | 'market_negative' | 'stock_positive' | 'stock_negative';
export type GameStatus = 'waiting' | 'running' | 'paused' | 'ended';

export interface Stock {
  id: string;
  name: string;
  code: string;
  industry: string;
  price: number;
  previousPrice: number;
  initialPrice: number;
  volatility: Volatility;
}

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  type: NewsType;
  targetStockId?: string;
  targetStockName?: string;
  duration: number;
  strength: number;
  activatedAt?: number;
}

export interface Holding {
  stockId: string;
  quantity: number;
  avgPrice: number;
}

export interface Transaction {
  id: string;
  stockId: string;
  stockName: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  timestamp: number;
}

export interface Player {
  id: string;
  nickname: string;
  cash: number;
  holdings: Holding[];
  transactions: Transaction[];
}

export interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  totalAssets: number;
  returnPct: number;
}

export interface GameState {
  id?: string;
  status: GameStatus;
  stocks: Stock[];
  newsPool: NewsItem[];
  activeNews: NewsItem[];
  newsHistory: NewsItem[];
  currentPlayer?: Player;
  leaderboard: LeaderboardEntry[];
  tickInterval: number;
  volatilityMultiplier: number;
  newsStrengthMultiplier: number;
  initialCash: number;
  startedAt?: number;
  currentTick: number;
  lastTickAt?: number;
  elapsedGameMs: number;
  scenarioStartDate: string;
  scenarioEndDate: string;
  scenarioDurationSeconds: number;
}
