import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/hooks/useGameStore';

const Home = () => {
  const navigate = useNavigate();
  const { state, loading, error } = useGameStore();

  const statusLabel: Record<string, string> = {
    waiting: '대기 중',
    running: '🟢 게임 진행 중',
    paused: '⏸️ 일시정지',
    ended: '🔴 게임 종료',
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="mb-10 text-center">
        <div className="text-7xl mb-6">📈</div>
        <h1 className="text-4xl md:text-6xl font-extrabold text-foreground mb-3 tracking-tight">
          가상 주식시장
        </h1>
        <p className="text-xl md:text-2xl text-accent font-semibold mb-4">모의투자 게임</p>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
          이 게임은 가짜 돈으로 연습하는 주식시장입니다.
          뉴스와 가격 변화를 보면서 매수/매도를 해보세요.
          실제 돈은 전혀 사용되지 않습니다!
        </p>
        {!loading && state.status !== 'waiting' && (
          <p className="mt-4 text-sm font-medium text-primary">
            현재 상태: {statusLabel[state.status]} · 참가자 {state.leaderboard.length}명
          </p>
        )}
        {error && (
          <p className="mt-4 text-sm text-loss max-w-lg mx-auto">
            서버 연결 오류: {error}
          </p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <Button size="lg" onClick={() => navigate('/teacher')} className="min-w-[200px] text-base font-bold">
          🏫 교사/운영자 입장
        </Button>
        <Button size="lg" variant="secondary" onClick={() => navigate('/student')} className="min-w-[200px] text-base font-bold">
          🎓 학생 입장
        </Button>
      </div>

      {state.status === 'ended' && (
        <p className="text-xs text-muted-foreground">새 게임 초기화는 운영자 화면에서 할 수 있습니다.</p>
      )}
    </div>
  );
};

export default Home;
