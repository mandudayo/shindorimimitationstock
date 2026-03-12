import { useState, useEffect, useCallback } from 'react';
import { GameState } from '@/types/game';
import { createInitialState } from '@/lib/gameEngine';

const STORAGE_KEY = 'vstock_game';

export function loadGameState(): GameState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return createInitialState();
}

export function saveGameState(state: GameState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useGameStore() {
  const [state, setStateInternal] = useState<GameState>(loadGameState);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try { setStateInternal(JSON.parse(e.newValue)); } catch { /* ignore */ }
      }
    };
    const poll = setInterval(() => {
      setStateInternal(loadGameState());
    }, 300);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(poll);
    };
  }, []);

  const updateState = useCallback((updater: (prev: GameState) => GameState) => {
    const prev = loadGameState();
    const next = updater(prev);
    saveGameState(next);
    setStateInternal(next);
  }, []);

  return { state, updateState };
}
