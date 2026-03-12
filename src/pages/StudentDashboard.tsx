import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '@/hooks/useGameStore';
import { formatKRW, getPlayerTotalAssets, getPlayerReturn } from '@/lib/gameEngine';
import { StockTable } from '@/components/game/StockTable';
import { RankingBoard } from '@/components/game/RankingBoard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Stock } from '@/types/game';

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { state, updateState } = useGameStore();
  const [playerId, setPlayerId] = useState(() => sessionStorage.getItem('vstock_pid') || '');
  const [nickname, setNickname] = useState('');
  const [activeTab, setActiveTab] = useState<'stocks' | 'portfolio' | 'ranking' | 'history'>('stocks');
  const [tradeStock, setTradeStock] = useState<Stock | null>(null);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [tradeQty, setTradeQty] = useState('');

  const player = state.players.find(p => p.id === playerId);

  // Join form
  if (!player) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🎓</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">게임 참가하기</h1>
          {state.status === 'waiting' ? (
            <p className="text-sm text-muted-foreground">게임이 아직 시작되지 않았습니다. 닉네임을 먼저 등록해주세요.</p>
          ) : state.status === 'ended' ? (
            <p className="text-sm text-loss">게임이 종료되었습니다.</p>
          ) : (
            <p className="text-sm text-gain">게임이 진행 중입니다!</p>
          )}
        </div>
        <div className="flex gap-2 w-full max-w-xs">
          <Input
            placeholder="닉네임 입력"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && joinGame()}
            className="bg-secondary border-border"
          />
          <Button onClick={joinGame} disabled={!nickname.trim() || state.status === 'ended'}>입장</Button>
        </div>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => navigate('/')}>← 홈으로</Button>
      </div>
    );
  }

  function joinGame() {
    if (!nickname.trim()) return;
    const id = crypto.randomUUID();
    updateState(s => ({
      ...s,
      players: [...s.players, { id, nickname: nickname.trim(), cash: s.initialCash, holdings: [], transactions: [] }],
    }));
    sessionStorage.setItem('vstock_pid', id);
    setPlayerId(id);
  }

  const totalAssets = getPlayerTotalAssets(player, state.stocks);
  const returnPct = getPlayerReturn(player, state.stocks, state.initialCash);

  function openTrade(stock: Stock, mode: 'buy' | 'sell') {
    if (state.status !== 'running') return;
    setTradeStock(stock);
    setTradeMode(mode);
    setTradeQty('');
  }

  function executeTrade() {
    if (!tradeStock || !tradeQty) return;
    const qty = parseInt(tradeQty);
    if (isNaN(qty) || qty <= 0) return;

    updateState(s => {
      const stock = s.stocks.find(st => st.id === tradeStock.id);
      const pIdx = s.players.findIndex(p => p.id === playerId);
      if (!stock || pIdx === -1) return s;

      const p = { ...s.players[pIdx] };
      const newHoldings = [...p.holdings];
      const hIdx = newHoldings.findIndex(h => h.stockId === stock.id);

      if (tradeMode === 'buy') {
        const cost = stock.price * qty;
        if (p.cash < cost) return s;
        p.cash -= cost;
        if (hIdx >= 0) {
          const h = newHoldings[hIdx];
          const totalQty = h.quantity + qty;
          newHoldings[hIdx] = { ...h, quantity: totalQty, avgPrice: Math.round((h.avgPrice * h.quantity + stock.price * qty) / totalQty) };
        } else {
          newHoldings.push({ stockId: stock.id, quantity: qty, avgPrice: stock.price });
        }
      } else {
        if (hIdx < 0 || newHoldings[hIdx].quantity < qty) return s;
        newHoldings[hIdx] = { ...newHoldings[hIdx], quantity: newHoldings[hIdx].quantity - qty };
        p.cash += stock.price * qty;
        if (newHoldings[hIdx].quantity === 0) newHoldings.splice(hIdx, 1);
      }

      p.holdings = newHoldings;
      p.transactions = [
        { id: crypto.randomUUID(), stockId: stock.id, stockName: stock.name, type: tradeMode, quantity: qty, price: stock.price, timestamp: Date.now() },
        ...p.transactions,
      ];

      const newPlayers = [...s.players];
      newPlayers[pIdx] = p;
      return { ...s, players: newPlayers };
    });
    setTradeStock(null);
  }

  const currentHolding = tradeStock ? player.holdings.find(h => h.stockId === tradeStock.id) : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>← 홈</Button>
            <span className="font-bold text-foreground">{player.nickname}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${state.status === 'running' ? 'bg-gain/10 text-gain' : state.status === 'paused' ? 'bg-accent/20 text-accent' : 'bg-loss/10 text-loss'}`}>
              {state.status === 'running' ? '진행 중' : state.status === 'paused' ? '일시정지' : '종료'}
            </span>
          </div>
          <div className="flex gap-4 text-xs">
            <div><span className="text-muted-foreground">보유현금 </span><span className="font-mono font-bold text-foreground">{formatKRW(player.cash)}</span></div>
            <div><span className="text-muted-foreground">총자산 </span><span className="font-mono font-bold text-foreground">{formatKRW(totalAssets)}</span></div>
            <div><span className="text-muted-foreground">수익률 </span><span className={`font-mono font-bold ${returnPct >= 0 ? 'text-gain' : 'text-loss'}`}>{returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%</span></div>
          </div>
        </div>
      </div>

      {/* Active News Banner */}
      {state.activeNews.length > 0 && (
        <div className="px-4 py-2 bg-secondary/50 border-b border-border">
          <div className="flex gap-3 overflow-x-auto text-xs">
            {state.activeNews.map(n => (
              <span key={n.id} className={`shrink-0 px-2 py-1 rounded ${n.type.includes('positive') ? 'bg-gain/10 text-gain' : 'bg-loss/10 text-loss'}`}>
                {n.type.includes('positive') ? '📈' : '📉'} {n.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['stocks', 'portfolio', 'ranking', 'history'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${activeTab === tab ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}>
            {tab === 'stocks' ? '📊 시세' : tab === 'portfolio' ? '💼 포트폴리오' : tab === 'ranking' ? '🏆 랭킹' : '📋 거래내역'}
          </button>
        ))}
      </div>

      <div className="p-4">
        {activeTab === 'stocks' && (
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <StockTable stocks={state.stocks} showActions={state.status === 'running'} onBuy={s => openTrade(s, 'buy')} onSell={s => openTrade(s, 'sell')} />
            </CardContent>
          </Card>
        )}

        {activeTab === 'portfolio' && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">💼 보유 종목</CardTitle></CardHeader>
            <CardContent>
              {player.holdings.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">보유 종목이 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {player.holdings.map(h => {
                    const stock = state.stocks.find(s => s.id === h.stockId);
                    if (!stock) return null;
                    const currentValue = stock.price * h.quantity;
                    const costBasis = h.avgPrice * h.quantity;
                    const pnl = currentValue - costBasis;
                    const pnlPct = ((pnl / costBasis) * 100).toFixed(2);
                    return (
                      <div key={h.stockId} className="flex items-center justify-between p-3 rounded-md bg-secondary/30">
                        <div>
                          <div className="font-bold text-foreground text-sm">{stock.name} <span className="text-muted-foreground font-normal">({stock.code})</span></div>
                          <div className="text-xs text-muted-foreground">{h.quantity}주 · 평균 {formatKRW(h.avgPrice)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm font-bold text-foreground">{formatKRW(currentValue)}</div>
                          <div className={`font-mono text-xs ${pnl >= 0 ? 'text-gain' : 'text-loss'}`}>
                            {pnl >= 0 ? '+' : ''}{formatKRW(pnl)} ({pnlPct}%)
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'ranking' && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">🏆 실시간 랭킹</CardTitle></CardHeader>
            <CardContent>
              <RankingBoard players={state.players} stocks={state.stocks} initialCash={state.initialCash} currentPlayerId={playerId} />
            </CardContent>
          </Card>
        )}

        {activeTab === 'history' && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">📋 거래 내역</CardTitle></CardHeader>
            <CardContent>
              {player.transactions.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">거래 내역이 없습니다</p>
              ) : (
                <div className="space-y-1 max-h-[500px] overflow-y-auto">
                  {player.transactions.map(t => (
                    <div key={t.id} className="flex items-center justify-between py-2 border-b border-border/50 text-xs">
                      <div>
                        <span className={`font-bold mr-1 ${t.type === 'buy' ? 'text-gain' : 'text-loss'}`}>
                          {t.type === 'buy' ? '매수' : '매도'}
                        </span>
                        <span className="text-foreground">{t.stockName}</span>
                        <span className="text-muted-foreground ml-1">{t.quantity}주</span>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-foreground">{formatKRW(t.price)}</div>
                        <div className="text-muted-foreground">{new Date(t.timestamp).toLocaleTimeString('ko-KR')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Trade Dialog */}
      <Dialog open={!!tradeStock} onOpenChange={() => setTradeStock(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {tradeStock?.name} {tradeMode === 'buy' ? '매수' : '매도'}
            </DialogTitle>
          </DialogHeader>
          {tradeStock && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                현재가: <span className="font-mono font-bold text-foreground">{formatKRW(tradeStock.price)}</span>
              </div>
              {tradeMode === 'sell' && currentHolding && (
                <div className="text-sm text-muted-foreground">보유: {currentHolding.quantity}주</div>
              )}
              <div className="text-sm text-muted-foreground">보유현금: {formatKRW(player.cash)}</div>
              <Input
                type="number" min="1" placeholder="수량 입력"
                value={tradeQty} onChange={e => setTradeQty(e.target.value)}
                className="bg-secondary border-border"
              />
              {tradeQty && parseInt(tradeQty) > 0 && (
                <div className="text-sm">
                  총 금액: <span className="font-mono font-bold text-foreground">{formatKRW(tradeStock.price * parseInt(tradeQty))}</span>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setTradeStock(null)}>취소</Button>
                <Button className="flex-1" onClick={executeTrade}
                  disabled={!tradeQty || parseInt(tradeQty) <= 0}>
                  {tradeMode === 'buy' ? '매수 확인' : '매도 확인'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentDashboard;
