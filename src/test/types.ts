/**
 * 백테스팅 환경을 위한 타입 정의
 */

// 기존 CandleData와 유사하게 하되, 백테스팅에 필요한 필드만 포함 가능
export interface BacktestCandleData {
  market: string;
  candle_date_time_utc: string;
  candle_date_time_kst: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number; // 종가, 백테스팅에서 주요 가격으로 사용
  timestamp: number; // Unix timestamp (milliseconds)
  candle_acc_trade_price: number;
  candle_acc_trade_volume: number;
  unit?: number; // 분 단위
}

export const OrderSide = {
  BID: "bid", // 매수
  ASK: "ask", // 매도
} as const;
export type OrderSide = (typeof OrderSide)[keyof typeof OrderSide];

export const OrderType = {
  LIMIT: "limit", // 지정가
  MARKET: "market", // 시장가
  // 백테스팅에서는 주로 LIMIT, MARKET을 단순화하여 사용
} as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];

export const OrderState = {
  WAIT: "wait", // 체결 대기 (백테스팅에서는 거의 사용 안함, 즉시 체결 가정)
  DONE: "done", // 전체 체결 완료
  CANCEL: "cancel", // 주문 취소
} as const;
export type OrderState = (typeof OrderState)[keyof typeof OrderState];

// 가상 주문을 위한 단순화된 주문 객체
export interface BacktestOrder {
  market: string;
  side: OrderSide;
  ord_type: OrderType;
  volume: string; // 주문 수량
  price?: string; // 지정가 주문 시 가격
  uuid?: string; // 주문 ID (생성 시 할당)
  createdAt?: string; // 주문 생성 시간
}

// 실행된 거래를 나타내는 객체 (PortfolioManager가 기록)
export interface BacktestTrade {
  uuid: string; // 거래 ID (주문 ID와 다를 수 있음, 또는 주문 ID 사용)
  market: string;
  side: OrderSide;
  orderType: OrderType;
  price: number; // 실제 체결 가격
  volume: number; // 실제 체결 수량
  amount: number; // 총 거래 대금 (price * volume)
  fee: number; // 발생한 수수료
  timestamp: number; // 체결 시각 (Unix ms)
  profit?: number; // 해당 거래로 발생한 손익 (매도 시점에 계산)
}

// 특정 자산의 포지션 정보
export interface BacktestPosition {
  market: string;
  baseCurrency: string; // 예: KRW-BTC에서 BTC
  quoteCurrency: string; // 예: KRW-BTC에서 KRW
  volume: number; // 보유 수량
  averageEntryPrice: number; // 평균 매수 단가
  currentPrice?: number; // 현재 시장 가격
  currentValue?: number; // 현재 평가액 (volume * currentPrice)
  profit?: number; // 평가 손익
  profitRate?: number; // 평가 수익률
}

// 전략 실행 결과를 나타내는 객체
export interface BacktestStrategySignal {
  action: "buy" | "sell" | "hold";
  market: string;
  price?: number; // 매수/매도 제안 가격 (지정가)
  volume?: number; // 매수/매도 제안 수량
  reason?: string; // 신호 발생 이유
  score?: number; // 신호 점수 (옵션)
  // 필요한 경우 추가 지표 값 포함 가능
}

// 백테스팅에 사용될 전략 설정 타입 (기존 StrategyConfig 참고)
export interface BacktestStrategyConfig {
  candleUnit?: number; // 캔들 단위 (분)
  candleCount?: number; // 조회할 캔들 개수

  // 지표 파라미터 (예시)
  bollingerPeriod?: number;
  bollingerStdDev?: number;
  rsiPeriod?: number;
  rsiOverbought?: number;
  rsiOversold?: number;
  mfiPeriod?: number;
  mfiOverbought?: number;
  mfiOversold?: number;
  movingAveragePeriod?: number; // 이동평균선 기간

  // 거래 조건 파라미터 (예시)
  minTradeVolume?: number; // 최소 거래 수량
  maxTradeRatio?: number; // 총 자산 대비 최대 거래 비율
  stopLossPercent?: number; // 손절 비율 (0.05 = 5%)
  takeProfitPercent?: number; // 익절 비율

  feeRate?: number; // 거래 수수료율 (0.0005 = 0.05%)
  initialBalance?: number; // 초기 자본금

  // 기타 설정
  printSignalDetails?: boolean; // 신호 상세 정보 출력 여부
  [key: string]: any; // 유연성을 위한 추가 설정
}
