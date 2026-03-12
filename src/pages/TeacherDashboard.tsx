import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore, saveGameState } from '@/hooks/useGameStore';
import { processTick, createInitialState, formatKRW, getPlayerReturn, getPlayerTotalAssets } from '@/lib/gameEngine';
import { StockTable } from '@/components/game/StockTable';
import { RankingBoard } from '@/components/game/RankingBoard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { NewsItem } from '@/types/game';

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const { state, updateState } = useGameStore();
  const [activeTab, setActiveTab] = useState<'market' | 'news' | 'ranking'>('market');

  // Tick engine
  useEffect(() => {
    if (state.status !== 'running') return;
    const interval = setInterval(() => {
      updateState(processTick);
    }, state.tickInterval);
    return () => clearInterval(interval);
  }, [state.status, state.tickInterval, updateState]);

  const startGame = () => updateState(s => ({ ...s, status: 'running', startedAt: s.startedAt || Date.now() }));
  const pauseGame = () => updateState(s => ({ ...s, status: 'paused' }));
  const resumeGame = () => updateState(s => ({ ...s, status: 'running' }));
  const endGame = () => updateState(s => ({ ...s, status: 'ended' }));
  const resetGame = () => { saveGameState(createInitialState()); window.location.reload(); };

  const activateNews = (newsId: string) => {
    updateState(s => {
      const news = s.newsPool.find(n => n.id === newsId);
      if (!news) return s;
      // Don't activate if already active
      if (s.activeNews.some(n => n.id === newsId)) return s;
      const activated = { ...news, activatedAt: Date.now() };
      return {
        ...s,
        activeNews: [...s.activeNews, activated],
        newsHistory: [activated, ...s.newsHistory],
      };
    });
  };

  const statusColors: Record<string, string> = {
    waiting: 'bg-muted text-muted-foreground',
    running: 'bg-gain/10 text-gain',
    paused: 'bg-accent/20 text-accent',
    ended: 'bg-loss/10 text-loss',
  };
  const statusLabels: Record<string, string> = {
    waiting: '대기 중', running: '진행 중', paused: '일시정지', ended: '종료됨',
  };

  const elapsed = state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;
  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;

  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="border-b border-border px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>← 홈</Button>
          <h1 className="text-lg font-bold text-foreground">🏫 교사 대시보드</h1>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[state.status]}`}>
            {statusLabels[state.status]}
          </span>
          {state.startedAt && (
            <span className="text-xs text-muted-foreground font-mono">
              {elapsedMin}:{elapsedSec.toString().padStart(2, '0')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">참가자: {state.players.length}명</span>
          {state.status === 'waiting' && <Button size="sm" onClick={startGame}>▶️ 게임 시작</Button>}
          {state.status === 'running' && <Button size="sm" variant="secondary" onClick={pauseGame}>⏸ 일시정지</Button>}
          {state.status === 'paused' && <Button size="sm" onClick={resumeGame}>▶️ 재개</Button>}
          {(state.status === 'running' || state.status === 'paused') && (
            <Button size="sm" variant="destructive" onClick={endGame}>⏹ 종료</Button>
          )}
          <Button size="sm" variant="outline" onClick={resetGame}>🔄 초기화</Button>
        </div>
      </div>

      {/* Mobile Tabs */}
      <div className="flex border-b border-border md:hidden">
        {(['market', 'news', 'ranking'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-sm font-medium ${activeTab === tab ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}
          >
            {tab === 'market' ? '📊 시세' : tab === 'news' ? '📰 뉴스' : '🏆 랭킹'}
          </button>
        ))}
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Stocks */}
        <div className={`md:col-span-1 ${activeTab !== 'market' ? 'hidden md:block' : ''}`}>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground">📊 종목 시세</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <StockTable stocks={state.stocks} compact />
            </CardContent>
          </Card>
        </div>

        {/* News */}
        <div className={`md:col-span-1 ${activeTab !== 'news' ? 'hidden md:block' : ''}`}>
          <Card className="bg-card border-border mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground">🔴 활성 뉴스</CardTitle>
            </CardHeader>
            <CardContent>
              <ActiveNewsList activeNews={state.activeNews} />
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground">📰 뉴스 발생시키기</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
              {state.newsPool.map(news => (
                <NewsButton
                  key={news.id}
                  news={news}
                  isActive={state.activeNews.some(n => n.id === news.id)}
                  onActivate={() => activateNews(news.id)}
                  disabled={state.status !== 'running'}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Rankings + Settings */}
        <div className={`md:col-span-1 ${activeTab !== 'ranking' ? 'hidden md:block' : ''}`}>
          {/* Settings */}
          <Card className="bg-card border-border mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground">⚙️ 난이도 설정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  전체 변동성: {state.volatilityMultiplier.toFixed(1)}x
                </label>
                <Slider
                  value={[state.volatilityMultiplier]}
                  min={0.2} max={3.0} step={0.1}
                  onValueChange={([v]) => updateState(s => ({ ...s, volatilityMultiplier: v }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  뉴스 영향력: {state.newsStrengthMultiplier.toFixed(1)}x
                </label>
                <Slider
                  value={[state.newsStrengthMultiplier]}
                  min={0.2} max={3.0} step={0.1}
                  onValueChange={([v]) => updateState(s => ({ ...s, newsStrengthMultiplier: v }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  틱 간격: {(state.tickInterval / 1000).toFixed(1)}초
                </label>
                <Slider
                  value={[state.tickInterval]}
                  min={1000} max={10000} step={500}
                  onValueChange={([v]) => updateState(s => ({ ...s, tickInterval: v }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground">🏆 실시간 랭킹</CardTitle>
            </CardHeader>
            <CardContent>
              <RankingBoard players={state.players} stocks={state.stocks} initialCash={state.initialCash} />
            </CardContent>
          </Card>

          {/* Game Results */}
          {state.status === 'ended' && (
            <Card className="bg-card border-border mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground">📋 최종 결과</CardTitle>
              </CardHeader>
              <CardContent>
                <GameResults players={state.players} stocks={state.stocks} initialCash={state.initialCash} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* News History Timeline */}
      {state.newsHistory.length > 0 && (
        <div className="px-4 pb-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground">📜 뉴스 타임라인</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {state.newsHistory.slice(0, 20).map((n, i) => (
                  <div key={`${n.id}-${i}`} className="flex items-start gap-2 text-xs py-1">
                    <span className={`shrink-0 ${n.type.includes('positive') ? 'text-gain' : 'text-loss'}`}>
                      {n.type.includes('positive') ? '📈' : '📉'}
                    </span>
                    <span className="text-foreground">{n.title}</span>
                    {n.targetStockName && (
                      <span className="text-muted-foreground">({n.targetStockName})</span>
                    )}
                    {n.activatedAt && (
                      <span className="text-muted-foreground ml-auto shrink-0">
                        {new Date(n.activatedAt).toLocaleTimeString('ko-KR')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

function ActiveNewsList({ activeNews }: { activeNews: NewsItem[] }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  if (activeNews.length === 0) {
    return <p className="text-muted-foreground text-xs">활성 뉴스 없음</p>;
  }

  return (
    <div className="space-y-2">
      {activeNews.map(n => {
        const remaining = n.activatedAt
          ? Math.max(0, n.duration - Math.floor((Date.now() - n.activatedAt) / 1000))
          : 0;
        return (
          <div key={n.id} className={`p-2 rounded-md text-xs ${n.type.includes('positive') ? 'bg-gain/10' : 'bg-loss/10'}`}>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-loss animate-pulse-dot" />
              <span className="font-medium text-foreground">{n.title}</span>
            </div>
            <div className="text-muted-foreground mt-1 flex justify-between">
              <span>{n.targetStockName ? `영향: ${n.targetStockName}` : '시장 전체'}</span>
              <span className="font-mono">{remaining}초 남음</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NewsButton({ news, isActive, onActivate, disabled }: {
  news: NewsItem; isActive: boolean; onActivate: () => void; disabled: boolean;
}) {
  const isPositive = news.type.includes('positive');
  return (
    <button
      onClick={onActivate}
      disabled={disabled || isActive}
      className={`w-full text-left p-2.5 rounded-md text-xs border transition-colors ${
        isActive
          ? 'opacity-40 cursor-not-allowed border-border'
          : disabled
            ? 'opacity-50 cursor-not-allowed border-border'
            : isPositive
              ? 'border-gain/30 hover:bg-gain/10 cursor-pointer'
              : 'border-loss/30 hover:bg-loss/10 cursor-pointer'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span>{isPositive ? '📈' : '📉'}</span>
        <span className="font-medium text-foreground">{news.title}</span>
      </div>
      <div className="text-muted-foreground mt-0.5">
        {news.description}
        {news.targetStockName && <span className="ml-1 text-primary">· {news.targetStockName}</span>}
        <span className="ml-1">· {news.duration}초</span>
      </div>
    </button>
  );
}

function GameResults({ players, stocks, initialCash }: {
  players: typeof TeacherDashboard extends never ? never : any[];
  stocks: any[]; initialCash: number;
}) {
  const ranked = players
    .map(p => ({
      nickname: p.nickname,
      total: getPlayerTotalAssets(p, stocks),
      ret: getPlayerReturn(p, stocks, initialCash),
    }))
    .sort((a, b) => b.total - a.total);

  if (ranked.length === 0) return <p className="text-muted-foreground text-xs">참가자 없음</p>;

  const avgReturn = ranked.reduce((s, p) => s + p.ret, 0) / ranked.length;
  const bestReturn = Math.max(...ranked.map(p => p.ret));
  const worstReturn = Math.min(...ranked.map(p => p.ret));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-md bg-secondary">
          <div className="text-xs text-muted-foreground">최고 수익률</div>
          <div className="font-mono font-bold text-gain text-sm">+{bestReturn.toFixed(2)}%</div>
        </div>
        <div className="p-2 rounded-md bg-secondary">
          <div className="text-xs text-muted-foreground">최저 수익률</div>
          <div className="font-mono font-bold text-loss text-sm">{worstReturn.toFixed(2)}%</div>
        </div>
        <div className="p-2 rounded-md bg-secondary">
          <div className="text-xs text-muted-foreground">평균 수익률</div>
          <div className={`font-mono font-bold text-sm ${avgReturn >= 0 ? 'text-gain' : 'text-loss'}`}>
            {avgReturn >= 0 ? '+' : ''}{avgReturn.toFixed(2)}%
          </div>
        </div>
      </div>
      <div className="space-y-1">
        {ranked.map((p, i) => (
          <div key={i} className="flex justify-between text-xs py-1.5 border-b border-border/50">
            <span className="font-medium text-foreground">
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {p.nickname}
            </span>
            <div className="text-right">
              <span className="text-muted-foreground mr-2">{formatKRW(p.total)}</span>
              <span className={`font-mono ${p.ret >= 0 ? 'text-gain' : 'text-loss'}`}>
                {p.ret >= 0 ? '+' : ''}{p.ret.toFixed(2)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TeacherDashboard;
