// 계좌 정보 타입
export interface Account {
  currency: string;
  balance: string;
  locked: string;
  avg_buy_price: string;
  avg_buy_price_modified: boolean;
  unit_currency: string;
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
  volume?: string;
  price?: string;
  ord_type: "limit" | "price" | "market"; // limit: 지정가, price: 시장가(매수), market: 시장가(매도)
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
  price?: number;
  volume?: number;
  reason: string;
}
