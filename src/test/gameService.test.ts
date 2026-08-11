import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapGameSnapshot, type GameSnapshotRows } from '@/services/gameService';
import {
  getPlayerReturn,
  getPlayerTotalAssets,
  getSimulationTimeline,
} from '@/lib/gameEngine';

const now = new Date('2026-08-09T12:00:00.000Z');

function makeRows(): GameSnapshotRows {
  return {
    game: {
      id: 'game-1',
      code: 'SHINDORIM',
      status: 'running',
      current_tick: 120,
      elapsed_game_ms: 302_400_000,
      initial_cash: 1_000_000,
      last_tick_at: '2026-08-09T11:59:57.000Z',
      market_seed: 2026,
      tick_interval_ms: 3000,
      volatility_multiplier: 1,
      news_strength_multiplier: 1,
      scenario_duration_seconds: 604_800,
      scenario_start_date: '2025-01-01',
      scenario_end_date: '2025-12-31',
      started_at: '2026-08-09T11:00:00.000Z',
      ended_at: null,
      created_at: '2026-08-09T10:00:00.000Z',
      updated_at: '2026-08-09T10:00:00.000Z',
    },
    stocks: [
      {
        game_id: 'game-1',
        id: 'edu',
        name: '에듀테크코',
        code: 'EDU',
        industry: 'IT',
        price: 55_000,
        previous_price: 50_000,
        initial_price: 50_000,
        volatility: 'medium',
        updated_at: now.toISOString(),
      },
    ],
    news: [
      {
        game_id: 'game-1',
        id: 'active',
        title: '활성 뉴스',
        description: '현재 가격에 반영 중',
        type: 'market_positive',
        target_stock_id: null,
        target_stock_name: null,
        duration_seconds: 120,
        strength: 1.5,
        last_activated_at: '2026-08-09T11:59:30.000Z',
        created_at: now.toISOString(),
      },
      {
        game_id: 'game-1',
        id: 'expired',
        title: '종료된 뉴스',
        description: '영향 종료',
        type: 'market_negative',
        target_stock_id: null,
        target_stock_name: null,
        duration_seconds: 60,
        strength: 1,
        last_activated_at: '2026-08-09T11:50:00.000Z',
        created_at: now.toISOString(),
      },
    ],
    leaderboard: [
      {
        player_id: 'player-1',
        nickname: '테스터',
        total_assets: 1_050_000,
        return_pct: 5,
      },
    ],
    player: {
      id: 'player-1',
      game_id: 'game-1',
      auth_user_id: 'user-1',
      nickname: '테스터',
      cash: 500_000,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    holdings: [
      {
        player_id: 'player-1',
        game_id: 'game-1',
        stock_id: 'edu',
        quantity: 10,
        avg_price: 50_000,
        updated_at: now.toISOString(),
      },
    ],
    transactions: [
      {
        id: 'request-1',
        player_id: 'player-1',
        game_id: 'game-1',
        stock_id: 'edu',
        stock_name: '에듀테크코',
        side: 'buy',
        quantity: 10,
        price: 50_000,
        created_at: '2026-08-09T11:30:00.000Z',
      },
    ],
  };
}

describe('mapGameSnapshot', () => {
  afterEach(() => vi.useRealTimers());

  it('Supabase 행을 기존 화면용 게임 상태로 변환한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const state = mapGameSnapshot(makeRows());

    expect(state.id).toBe('game-1');
    expect(state.stocks[0]).toMatchObject({
      id: 'edu',
      price: 55_000,
      previousPrice: 50_000,
    });
    expect(state.currentPlayer).toMatchObject({
      id: 'player-1',
      cash: 500_000,
      holdings: [{ stockId: 'edu', quantity: 10, avgPrice: 50_000 }],
    });
    expect(state.currentPlayer?.transactions[0]).toMatchObject({
      id: 'request-1',
      type: 'buy',
      price: 50_000,
    });
    expect(state.leaderboard[0]).toEqual({
      playerId: 'player-1',
      nickname: '테스터',
      totalAssets: 1_050_000,
      returnPct: 5,
    });
    expect(state).toMatchObject({
      currentTick: 120,
      elapsedGameMs: 302_400_000,
      scenarioStartDate: '2025-01-01',
      scenarioEndDate: '2025-12-31',
      scenarioDurationSeconds: 604_800,
    });
  });

  it('유효 시간이 지난 뉴스는 기록에는 남기고 활성 목록에서는 제외한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const state = mapGameSnapshot(makeRows());

    expect(state.newsHistory.map((item) => item.id)).toEqual(['active', 'expired']);
    expect(state.activeNews.map((item) => item.id)).toEqual(['active']);
  });
});

describe('portfolio calculations', () => {
  it('현금과 현재 주가로 총자산 및 수익률을 계산한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const state = mapGameSnapshot(makeRows());
    const player = state.currentPlayer!;

    expect(getPlayerTotalAssets(player, state.stocks)).toBe(1_050_000);
    expect(getPlayerReturn(player, state.stocks, state.initialCash)).toBe(5);
  });
});

describe('simulation timeline', () => {
  it('실제 진행 시간의 절반을 가상 1년의 중간 날짜로 변환한다', () => {
    const state = mapGameSnapshot(makeRows());
    const timeline = getSimulationTimeline(state);

    expect(timeline.progress).toBe(0.5);
    expect(timeline.simulatedDay).toBe(183);
    expect(timeline.totalDays).toBe(365);
    expect(timeline.simulatedAt.getFullYear()).toBe(2025);
    expect(timeline.simulatedAt.getMonth()).toBe(6);
    expect(timeline.simulatedAt.getDate()).toBe(2);
  });

  it('진행 시간이 범위를 넘어도 마지막 날과 100%를 넘지 않는다', () => {
    const rows = makeRows();
    rows.game.elapsed_game_ms = 999_999_999;
    const timeline = getSimulationTimeline(mapGameSnapshot(rows));

    expect(timeline.progress).toBe(1);
    expect(timeline.simulatedDay).toBe(365);
    expect(timeline.simulatedAt.getFullYear()).toBe(2025);
    expect(timeline.simulatedAt.getMonth()).toBe(11);
    expect(timeline.simulatedAt.getDate()).toBe(31);
  });
});
