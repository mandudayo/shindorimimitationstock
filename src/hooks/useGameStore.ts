import { useCallback, useEffect, useRef, useState } from 'react';
import { createInitialState } from '@/lib/gameEngine';
import type { GameState } from '@/types/game';
import {
  activateNews as activateNewsRequest,
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
    resetGame: () => runAction(() => resetGameRequest(requireGameId())),
    signInAdmin: (email: string, password: string) =>
      runAction(() => signInAdminRequest(email, password)),
    signOutAdmin: () => runAction(signOutAdminRequest),
  };
}
