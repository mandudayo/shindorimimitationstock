import { useCallback, useEffect, useRef, useState } from 'react';
import { createInitialState } from '@/lib/gameEngine';
import type { GameState } from '@/types/game';
import {
  activateNews as activateNewsRequest,
  advanceMarket as advanceMarketRequest,
  executeTrade as executeTradeRequest,
  joinGame as joinGameRequest,
  loadGameSnapshot,
  resetGame as resetGameRequest,
  setGameStatus as setGameStatusRequest,
  signInAdmin as signInAdminRequest,
  signOutAdmin as signOutAdminRequest,
  subscribeToGame,
  unsubscribeFromGame,
  updateGameSettings as updateGameSettingsRequest,
  updateScenarioDuration as updateScenarioDurationRequest,
} from '@/services/gameService';

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '알 수 없는 오류가 발생했습니다.';
}

export function useGameStore() {
  const [state, setState] = useState<GameState>(createInitialState);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string>();
  const [isAdmin, setIsAdmin] = useState(false);
  const refreshSequence = useRef(0);
  const marketAdvancePending = useRef(false);

  const refresh = useCallback(async (showLoading = false) => {
    const sequence = ++refreshSequence.current;
    if (showLoading) setLoading(true);

    try {
      const snapshot = await loadGameSnapshot();
      if (sequence !== refreshSequence.current) return;
      setState(snapshot.state);
      setIsAdmin(snapshot.isAdmin);
      setError(undefined);
    } catch (refreshError) {
      if (sequence !== refreshSequence.current) return;
      setError(normalizeError(refreshError));
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    if (!state.id) return;

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const channel = subscribeToGame(state.id, () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refresh(), 80);
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void unsubscribeFromGame(channel);
    };
  }, [refresh, state.id]);

  // The operator browser drives the server clock, but all calculations happen
  // inside the database. The RPC is time-gated and row-locked, so duplicated
  // tabs cannot create extra price ticks.
  useEffect(() => {
    if (!isAdmin || !state.id || state.status !== 'running') return;

    let disposed = false;
    const advance = async () => {
      if (disposed || marketAdvancePending.current) return;
      marketAdvancePending.current = true;
      try {
        await advanceMarketRequest(state.id!);
      } catch (advanceError) {
        if (!disposed) setError(normalizeError(advanceError));
      } finally {
        marketAdvancePending.current = false;
      }
    };

    const cadence = Math.max(750, Math.floor(state.tickInterval / 2));
    const interval = setInterval(() => void advance(), cadence);

    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [isAdmin, state.id, state.status, state.tickInterval]);

  // The leaderboard RPC intentionally exposes only aggregate account values,
  // so it cannot use row-level realtime events for other players. A light poll
  // keeps the ranking shared without exposing their holdings or transactions.
  useEffect(() => {
    if (!state.id) return;
    const interval = setInterval(() => void refresh(), 5000);
    return () => clearInterval(interval);
  }, [refresh, state.id]);

  const runAction = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setActionPending(true);
    setError(undefined);
    try {
      const result = await action();
      await refresh();
      return result;
    } catch (actionError) {
      const message = normalizeError(actionError);
      setError(message);
      throw new Error(message);
    } finally {
      setActionPending(false);
    }
  }, [refresh]);

  const requireGameId = useCallback(() => {
    if (!state.id) throw new Error('게임 정보를 불러오는 중입니다.');
    return state.id;
  }, [state.id]);

  return {
    state,
    loading,
    actionPending,
    error,
    isAdmin,
    refresh,
    joinGame: (nickname: string) => runAction(() => joinGameRequest(nickname)),
    executeTrade: (
      playerId: string,
      stockId: string,
      side: 'buy' | 'sell',
      quantity: number,
    ) => runAction(() => executeTradeRequest(playerId, stockId, side, quantity)),
    setGameStatus: (status: GameState['status']) =>
      runAction(() => setGameStatusRequest(requireGameId(), status)),
    activateNews: (newsId: string) =>
      runAction(() => activateNewsRequest(requireGameId(), newsId)),
    updateGameSettings: (
      settings: Pick<
        GameState,
        'tickInterval' | 'volatilityMultiplier' | 'newsStrengthMultiplier'
      >,
    ) => runAction(() => updateGameSettingsRequest(requireGameId(), settings)),
    updateScenarioDuration: (scenarioDurationSeconds: number) =>
      runAction(() => updateScenarioDurationRequest(requireGameId(), scenarioDurationSeconds)),
    resetGame: () => runAction(() => resetGameRequest(requireGameId())),
    signInAdmin: (email: string, password: string) =>
      runAction(() => signInAdminRequest(email, password)),
    signOutAdmin: () => runAction(signOutAdminRequest),
  };
}
