import { GameState, Stock, NewsItem, Player } from '@/types/game';

const DEFAULT_STOCKS: Stock[] = [
  { id: 'edu', name: '에듀테크코', code: 'EDU', industry: 'IT', price: 50000, previousPrice: 50000, initialPrice: 50000, volatility: 'medium' },
  { id: 'grn', name: '그린에너지', code: 'GRN', industry: '에너지', price: 35000, previousPrice: 35000, initialPrice: 35000, volatility: 'high' },
  { id: 'kfd', name: '한국식품', code: 'KFD', industry: '소비재', price: 28000, previousPrice: 28000, initialPrice: 28000, volatility: 'low' },
  { id: 'mvs', name: '메타버스엔터', code: 'MVS', industry: '엔터', price: 72000, previousPrice: 72000, initialPrice: 72000, volatility: 'high' },
  { id: 'sbk', name: '안전은행', code: 'SBK', industry: '금융', price: 45000, previousPrice: 45000, initialPrice: 45000, volatility: 'low' },
  { id: 'bhl', name: '바이오헬스', code: 'BHL', industry: '헬스케어', price: 60000, previousPrice: 60000, initialPrice: 60000, volatility: 'medium' },
  { id: 'slg', name: '스마트물류', code: 'SLG', industry: '물류', price: 33000, previousPrice: 33000, initialPrice: 33000, volatility: 'medium' },
];

const DEFAULT_NEWS: NewsItem[] = [
  { id: 'n1', title: '중앙은행, 기준금리 인하 발표', description: '경기 부양을 위해 기준금리를 0.5%p 인하했습니다.', type: 'market_positive', duration: 120, strength: 1.5 },
  { id: 'n2', title: '정부, 대규모 경기부양책 발표', description: '50조 원 규모의 경기부양책이 발표되었습니다.', type: 'market_positive', duration: 90, strength: 1.0 },
  { id: 'n3', title: '국제 유가 급등, 인플레이션 우려', description: '원유 가격이 배럴당 $120을 돌파했습니다.', type: 'market_negative', duration: 120, strength: 1.5 },
  { id: 'n4', title: '글로벌 공급망 위기 심화', description: '주요 항만 폐쇄로 물류 대란이 발생했습니다.', type: 'market_negative', duration: 90, strength: 1.0 },
  { id: 'n5', title: '외국인 투자자 대규모 매수세', description: '글로벌 펀드들이 국내 시장에 주목하고 있습니다.', type: 'market_positive', duration: 60, strength: 0.8 },
  { id: 'n6', title: '미중 무역갈등 재점화', description: '양국 간 관세 인상 조치가 발표되었습니다.', type: 'market_negative', duration: 60, strength: 0.8 },
  { id: 'n7', title: '에듀테크코, AI 교육 플랫폼 대박', description: '글로벌 100만 유저 돌파!', type: 'stock_positive', targetStockId: 'edu', targetStockName: '에듀테크코', duration: 90, strength: 2.0 },
  { id: 'n8', title: '에듀테크코, 보안 사고 발생', description: '학생 개인정보 유출 의혹이 제기되었습니다.', type: 'stock_negative', targetStockId: 'edu', targetStockName: '에듀테크코', duration: 90, strength: 1.8 },
  { id: 'n9', title: '그린에너지, 정부 보조금 확정', description: '신재생에너지 보조금 500억 확정!', type: 'stock_positive', targetStockId: 'grn', targetStockName: '그린에너지', duration: 90, strength: 1.5 },
  { id: 'n10', title: '한국식품, 리콜 사태 발생', description: '주력 제품에서 이물질이 발견되었습니다.', type: 'stock_negative', targetStockId: 'kfd', targetStockName: '한국식품', duration: 120, strength: 2.0 },
  { id: 'n11', title: '메타버스엔터, 대형 IP 계약 체결', description: '글로벌 엔터사와 메타버스 콘텐츠 독점 계약!', type: 'stock_positive', targetStockId: 'mvs', targetStockName: '메타버스엔터', duration: 60, strength: 1.5 },
  { id: 'n12', title: '안전은행, 부실채권 급증', description: '대출 연체율이 급격히 상승했습니다.', type: 'stock_negative', targetStockId: 'sbk', targetStockName: '안전은행', duration: 90, strength: 1.5 },
  { id: 'n13', title: '바이오헬스, 신약 임상 3상 성공', description: '혁신 항암제 임상시험이 성공적으로 완료!', type: 'stock_positive', targetStockId: 'bhl', targetStockName: '바이오헬스', duration: 120, strength: 2.0 },
  { id: 'n14', title: '스마트물류, 아마존과 파트너십 체결', description: '글로벌 물류 네트워크 확장 계약!', type: 'stock_positive', targetStockId: 'slg', targetStockName: '스마트물류', duration: 90, strength: 1.5 },
  { id: 'n15', title: '바이오헬스, FDA 승인 거부', description: '주력 신약이 미국 FDA 승인에 실패했습니다.', type: 'stock_negative', targetStockId: 'bhl', targetStockName: '바이오헬스', duration: 120, strength: 2.0 },
];

export function createInitialState(): GameState {
  return {
    status: 'waiting',
    stocks: DEFAULT_STOCKS.map(s => ({ ...s })),
    newsPool: DEFAULT_NEWS.map(n => ({ ...n })),
    activeNews: [],
    newsHistory: [],
    currentPlayer: undefined,
    leaderboard: [],
    tickInterval: 3000,
    volatilityMultiplier: 1.0,
    newsStrengthMultiplier: 1.0,
    initialCash: 1000000,
  };
}

export function getPlayerTotalAssets(player: Player, stocks: Stock[]): number {
  const holdingsValue = player.holdings.reduce((sum, h) => {
    const stock = stocks.find(s => s.id === h.stockId);
    return sum + (stock ? stock.price * h.quantity : 0);
  }, 0);
  return player.cash + holdingsValue;
}

export function getPlayerReturn(player: Player, stocks: Stock[], initialCash: number): number {
  const total = getPlayerTotalAssets(player, stocks);
  return ((total - initialCash) / initialCash) * 100;
}

export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
}
