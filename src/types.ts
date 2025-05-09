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
  state: "wait" | "watch";
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
  score: number;
  reason: string;
}
