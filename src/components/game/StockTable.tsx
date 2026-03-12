import { Stock } from '@/types/game';
import { formatKRW } from '@/lib/gameEngine';
import { Button } from '@/components/ui/button';

interface StockTableProps {
  stocks: Stock[];
  onBuy?: (stock: Stock) => void;
  onSell?: (stock: Stock) => void;
  showActions?: boolean;
  compact?: boolean;
}

const volLabel: Record<string, string> = { low: '낮음', medium: '중간', high: '높음' };

export function StockTable({ stocks, onBuy, onSell, showActions = false, compact = false }: StockTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-xs">
            <th className="text-left py-2 px-2">종목</th>
            {!compact && <th className="text-left py-2 px-2">산업</th>}
            <th className="text-right py-2 px-2">현재가</th>
            <th className="text-right py-2 px-2">등락</th>
            {!compact && <th className="text-center py-2 px-2">변동성</th>}
            {showActions && <th className="text-center py-2 px-2">거래</th>}
          </tr>
        </thead>
        <tbody>
          {stocks.map(stock => {
            const changeFromPrev = stock.price - stock.previousPrice;
            const changePct = stock.previousPrice > 0
              ? ((changeFromPrev / stock.previousPrice) * 100).toFixed(2)
              : '0.00';
            const totalChangePct = ((stock.price - stock.initialPrice) / stock.initialPrice * 100).toFixed(1);
            const isUp = changeFromPrev > 0;
            const isDown = changeFromPrev < 0;

            return (
              <tr key={stock.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                <td className="py-2.5 px-2">
                  <div className="font-bold text-foreground">{stock.name}</div>
                  <div className="text-xs text-muted-foreground">{stock.code}</div>
                </td>
                {!compact && <td className="py-2.5 px-2 text-muted-foreground">{stock.industry}</td>}
                <td className="py-2.5 px-2 text-right font-mono font-bold text-foreground">
                  {formatKRW(stock.price)}
                </td>
                <td className={`py-2.5 px-2 text-right font-mono text-sm ${isUp ? 'text-gain' : isDown ? 'text-loss' : 'text-muted-foreground'}`}>
                  <div>{isUp ? '▲' : isDown ? '▼' : '-'} {changePct}%</div>
                  <div className="text-xs opacity-70">시작대비 {totalChangePct}%</div>
                </td>
                {!compact && (
                  <td className="py-2.5 px-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      stock.volatility === 'high' ? 'bg-loss/10 text-loss' :
                      stock.volatility === 'medium' ? 'bg-accent/20 text-accent' :
                      'bg-gain/10 text-gain'
                    }`}>
                      {volLabel[stock.volatility]}
                    </span>
                  </td>
                )}
                {showActions && (
                  <td className="py-2.5 px-2 text-center">
                    <div className="flex gap-1 justify-center">
                      <Button size="sm" variant="outline" className="h-7 text-xs px-3 text-gain border-gain/30 hover:bg-gain/10" onClick={() => onBuy?.(stock)}>
                        매수
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs px-3 text-loss border-loss/30 hover:bg-loss/10" onClick={() => onSell?.(stock)}>
                        매도
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
