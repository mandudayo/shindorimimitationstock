import { Player, Stock } from '@/types/game';
import { getPlayerTotalAssets, getPlayerReturn, formatKRW } from '@/lib/gameEngine';

interface RankingBoardProps {
  players: Player[];
  stocks: Stock[];
  initialCash: number;
  currentPlayerId?: string;
}

export function RankingBoard({ players, stocks, initialCash, currentPlayerId }: RankingBoardProps) {
  const ranked = [...players]
    .map(p => ({
      ...p,
      totalAssets: getPlayerTotalAssets(p, stocks),
      returnPct: getPlayerReturn(p, stocks, initialCash),
    }))
    .sort((a, b) => b.totalAssets - a.totalAssets);

  if (ranked.length === 0) {
    return <p className="text-muted-foreground text-sm text-center py-4">아직 참가자가 없습니다</p>;
  }

  return (
    <div className="space-y-1">
      {ranked.map((p, i) => {
        const isCurrent = p.id === currentPlayerId;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
        return (
          <div
            key={p.id}
            className={`flex items-center justify-between py-2 px-3 rounded-md text-sm ${
              isCurrent ? 'bg-primary/10 border border-primary/30' : 'hover:bg-secondary/30'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-8 text-center font-bold">{medal}</span>
              <span className={`font-medium ${isCurrent ? 'text-primary' : 'text-foreground'}`}>
                {p.nickname}
              </span>
            </div>
            <div className="text-right">
              <div className="font-mono font-bold text-foreground text-xs">{formatKRW(p.totalAssets)}</div>
              <div className={`font-mono text-xs ${p.returnPct >= 0 ? 'text-gain' : 'text-loss'}`}>
                {p.returnPct >= 0 ? '+' : ''}{p.returnPct.toFixed(2)}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
