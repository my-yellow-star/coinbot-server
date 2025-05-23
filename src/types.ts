// 계좌 정보 타입
export interface Account {
  currency: string;
  balance: string;
  locked: string;
  avg_buy_price: string; // 매수 평균 가격
  avg_buy_price_modified: boolean; // 매수 평균 가격 수정 여부
  unit_currency: string; // 화폐 단위
}

// 마켓 코드 타입
export interface Market {
  market: string;
  korean_name: string;
  english_name: string;
}

// 현재가 정보 타입
export interface Ticker {
  market: string;
  trade_price: number;
  signed_change_rate: number;
  acc_trade_price_24h: number;
  high_price: number;
  low_price: number;
}

// 주문 타입
export interface Order {
  market: string;
  side: "bid" | "ask"; // bid: 매수, ask: 매도
  volume?: string | null; // null: 최유리 주문
  price?: string;
  ord_type: "limit" | "price" | "market" | "best"; // limit: 지정가, price: 시장가(매수), market: 시장가(매도), best: 최유리
  time_in_force?: "ioc" | "fok"; // best 주문 시 필수 필드, ioc: 즉시체결 + 잔량 취소, fok: 전체체결, 그렇지 않으면 취소
}

export interface OrderHistory {
  uuid: string;
  side: "bid" | "ask";
  ord_type: "limit" | "price" | "market" | "best";
  price: string; // 주문 당시 화폐 가격
  state: "done" | "cancel";
  market: string;
  created_at: string;
  volume: string;
  remaining_volume: string;
  reserved_fee: string; // 수수료 예약 비용
  remaining_fee: string; // 남은 수수료
  paid_fee: string; // 사용된 수수료
  locked: string; // 거래에 사용중인 비용
  executed_volume: string; // 체결된 양
  executed_funds: string; // 체결된 금액
}

// 거래 타입
export interface Trade {
  market: string;
  side: "bid" | "ask";
  price: number;
  volume: number;
  timestamp: number;
}

// 전략 결과 타입
export interface StrategyResult {
  action: "buy" | "sell" | "hold";
  market: string;
  score: number; // 점수 (매수/매도 결정 강도 등)
  reason: string;
  price?: number; // 주문 실행 시 제안 가격 (지정가 등)
}

// 포지션 정보 타입
export interface Position {
  market: string; // 마켓 코드 (예: "KRW-BTC")
  entryPrice: number; // 진입 가격
  volume: number; // 보유 수량
  timestamp?: string; // 진입 시간 (ISO 문자열)
  pyramidingCount?: number; // 해당 포지션에 대해 실행된 분할 매수 횟수
  // 필요한 경우 추가 정보: 현재가, 평가금액, 수익률 등
}

// 캔들 데이터 타입 (Upbit API 응답 기준)
// getMinuteCandles 응답이 any[]로 되어 있어, 좀 더 구체적인 타입 정의
export interface CandleData {
  market: string; // 마켓명
  candle_date_time_utc: string; // 캔들 기준 시각 (UTC 기준)
  candle_date_time_kst: string; // 캔들 기준 시각 (KST 기준)
  opening_price: number; // 시가
  high_price: number; // 고가
  low_price: number; // 저가
  trade_price: number; // 종가
  timestamp: number; // 해당 _캔들의_ 마지막_티커_시간(ms)
  candle_acc_trade_price: number; // 누적 거래 금액
  candle_acc_trade_volume: number; // 누적 거래량
  unit: number; // 분 단위 (유닛)
}

// SignalGenerator에서 사용할 수 있는 전략 설정 타입
export interface StrategyConfig {
  bollingerPeriod?: number;
  bollingerStdDev?: number;
  emaShortPeriod?: number;
  emaLongPeriod?: number;
  emaMidPeriod?: number; // 중기 EMA 기간
  rsiPeriod?: number;
  rsiOverboughtThreshold?: number;
  rsiOversoldThreshold?: number;
  volumeSpikeMultiplier?: number; // 거래량 급증 기준 배수
  buyScoreThreshold?: number; // 매수 결정 최소 점수 (사용처 확인 필요, ShortTerm과 중복 가능성)
  stopLossPercentShortTerm?: number; // 단기 매매용 손절 비율
  profitTargetPercentShortTerm?: number; // 단기 매매용 1차 익절 비율
  buyScoreThresholdShortTerm?: number; // 단기 매매용 매수 결정 점수 임계값
  sellScoreThresholdShortTerm?: number; // 단기 매매용 매도 결정 점수 임계값 (RSI 등 기반)

  // MACD 관련 파라미터
  macdShortPeriod?: number;
  macdLongPeriod?: number;
  macdSignalPeriod?: number;

  // 분할 매수 (Pyramiding/Averaging Down) 관련 파라미터
  allowPyramiding?: boolean; // 분할 매수 허용 여부
  maxPyramidingCount?: number; // 최대 분할 매수 횟수
  pyramidingConditionDropPercent?: number; // 추가 매수 조건: 기준가(첫매수가 또는 직전 분할매수가) 대비 하락률 (%)
  pyramidingRsiCondition?: { below?: number; above?: number }; // 추가 매수 조건: RSI 값 범위 (예: below: 35)
  pyramidingOrderSizeRatio?: number; // 추가 매수 시 주문량 비율 (첫 매수량 대비 또는 현재 보유량 대비)

  weights?: StrategyWeights; // 점수 계산 가중치
}

// 점수 계산 가중치 타입
export interface StrategyWeights {
  // 매수 관련 가중치
  emaGoldenCross?: number; // EMA 골든크로스
  bollingerBreakout?: number; // 볼린저밴드 상단 돌파
  volumeSpike?: number; // 거래량 급증
  rsiOversold?: number; // RSI 과매도
  rsiNeutral?: number; // RSI 중립(상승 여력)
  buyMacdGoldenCross?: number; // MACD 골든크로스 (MACD선 > 시그널선)
  buyMacdHistogramPositive?: number; // MACD 히스토그램 양전환 또는 증가
  buySynergy?: number; // 주요 매수 조건 동시 충족 시너지

  // 매도 관련 가중치 (지표 기반)
  rsiOverboughtSell?: number; // RSI 과매수
  emaDeadCrossSell?: number; // EMA 데드크로스
  sellMacdDeadCross?: number; // MACD 데드크로스 (MACD선 < 시그널선)
  sellMacdHistogramNegative?: number; // MACD 히스토그램 음전환 또는 감소
  sellSynergyRsiEma?: number; // RSI 과매수 + EMA 데드크로스 시너지
  sellSynergyEmaBbMiddle?: number; // EMA 데드크로스 + BB중단 하회 시너지
  profitTargetWeight?: number; // 목표 수익률 달성 가중치

  // 분할매수 신호 발생 시 추가 점수 (선택적)
  pyramidingSignalBoost?: number;
  // 추세 추종 추가 매수 신호 발생 시 추가 점수 (선택적)
  trendFollowingSignalBoost?: number;
  // 필요시 추가 가중치 정의
}

export interface SignalLog {
  timestamp: string; // ISO 8601 형식
  market: string;
  action: "buy" | "sell" | "hold";
  price?: number; // 매수 또는 매도 결정 시의 가격
  score: number;
  reason: string;
  // 필요에 따라 추가 지표 값 등
  // indicators?: {
  //   rsi?: number;
  //   bollingerBands?: { upper: number; middle: number; lower: number };
  //   emaShort?: number;
  //   emaMid?: number;
  //   emaLong?: number;
  // };
}
