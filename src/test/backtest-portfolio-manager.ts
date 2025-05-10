import {
  BacktestOrder,
  BacktestTrade,
  BacktestPosition,
  OrderSide,
  OrderType,
  BacktestStrategyConfig,
  BacktestCandleData,
} from "./types";
import { v4 as uuidv4 } from "uuid";

export class BacktestPortfolioManager {
  private initialBalance: number;
  private currentBalance: number;
  private baseCurrency: string;
  private feeRate: number;
  private positions: Map<string, BacktestPosition>; // market -> Position
  private trades: BacktestTrade[];
  private marketPrices: Map<string, number>; // market -> current_price

  constructor(
    initialBalance: number,
    baseCurrency: string = "KRW",
    feeRate: number = 0.0005
  ) {
    this.initialBalance = initialBalance;
    this.currentBalance = initialBalance;
    this.baseCurrency = baseCurrency;
    this.feeRate = feeRate;
    this.positions = new Map();
    this.trades = [];
    this.marketPrices = new Map();
    console.log(
      `[BacktestPortfolioManager] Initialized with Balance: ${initialBalance} ${baseCurrency}, Fee Rate: ${
        feeRate * 100
      }%`
    );
  }

  public reset(): void {
    this.currentBalance = this.initialBalance;
    this.positions.clear();
    this.trades = [];
    this.marketPrices.clear();
    console.log(
      `[BacktestPortfolioManager] Portfolio reset. Current Balance: ${this.currentBalance} ${this.baseCurrency}`
    );
  }

  public getInitialBalance(): number {
    return this.initialBalance;
  }

  public getCurrentBalance(): number {
    return this.currentBalance;
  }

  public getTrades(): BacktestTrade[] {
    return [...this.trades];
  }

  public updateMarketPrice(market: string, price: number): void {
    this.marketPrices.set(market, price);
    // 포지션 평가 업데이트 (필요시)
    if (this.positions.has(market)) {
      const position = this.positions.get(market)!;
      position.currentPrice = price;
      position.currentValue = position.volume * price;
      if (position.averageEntryPrice > 0) {
        position.profit =
          (price - position.averageEntryPrice) * position.volume;
        position.profitRate = price / position.averageEntryPrice - 1;
      }
    }
  }

  public getPosition(market: string): BacktestPosition | undefined {
    return this.positions.get(market);
  }

  // 특정 시점(캔들)을 기준으로 포지션 정보를 가져오는 함수 (MDD, 승률 계산 등에 사용될 수 있음)
  // 여기서는 가장 최근 포지션 정보를 단순 반환. 더 정확한 시점별 추적은 복잡도 증가
  public getPositionBeforeTrade(
    market: string,
    timestamp?: number
  ): BacktestPosition | undefined {
    // 현재 구현에서는 가장 최근 포지션을 반환. timestamp를 활용한 정확한 히스토리 추적은 추가 구현 필요
    return this.positions.get(market);
  }

  public getTotalAssetValue(): number {
    let totalValue = this.currentBalance;
    for (const position of this.positions.values()) {
      const currentPrice =
        this.marketPrices.get(position.market) || position.averageEntryPrice; // 현재가 없으면 평균 매수가로 계산
      totalValue += position.volume * currentPrice;
    }
    return totalValue;
  }

  /**
   * 가상 주문을 처리하고 포트폴리오 상태를 업데이트합니다.
   * @param order 실행할 주문 정보
   * @param currentCandle 현재 캔들 데이터 (시장가 주문 시 체결 가격으로 사용)
   * @returns 생성된 거래 내역 또는 null (거래 실패 시)
   */
  public recordTrade(
    order: BacktestOrder,
    currentCandle: BacktestCandleData // 시장가 체결 및 타임스탬프용
  ): BacktestTrade | null {
    const market = order.market;
    const side = order.side;
    const volume = parseFloat(order.volume);
    const orderType = order.ord_type;

    let price = 0;
    if (orderType === OrderType.LIMIT && order.price) {
      price = parseFloat(order.price);
    } else if (orderType === OrderType.MARKET) {
      price = currentCandle.trade_price; // 시장가 주문은 현재 캔들의 종가로 체결
    } else {
      console.warn(
        `[BacktestPortfolioManager] Unsupported order type or missing price for limit order: ${orderType}`
      );
      return null;
    }

    if (volume <= 0 || price <= 0) {
      console.warn(
        `[BacktestPortfolioManager] Invalid volume or price for trade: V=${volume}, P=${price}`
      );
      return null;
    }

    const amount = price * volume;
    const fee = amount * this.feeRate;

    const tradeUuid = order.uuid || uuidv4();
    let tradeProfit: number | undefined = undefined;

    if (side === OrderSide.BID) {
      // 매수
      if (this.currentBalance < amount + fee) {
        // console.warn(`[BacktestPortfolioManager] Insufficient balance to buy ${market}. Need: ${amount + fee}, Have: ${this.currentBalance}`);
        return null;
      }
      this.currentBalance -= amount + fee;

      const position = this.positions.get(market) || {
        market,
        baseCurrency: market.split("-")[1], // e.g., BTC
        quoteCurrency: market.split("-")[0], // e.g., KRW
        volume: 0,
        averageEntryPrice: 0,
      };

      const newTotalVolume = position.volume + volume;
      position.averageEntryPrice =
        (position.averageEntryPrice * position.volume + amount) /
        newTotalVolume;
      position.volume = newTotalVolume;
      this.positions.set(market, position);
    } else {
      // 매도 (OrderSide.ASK)
      const position = this.positions.get(market);
      if (!position || position.volume < volume) {
        // console.warn(`[BacktestPortfolioManager] Insufficient position to sell ${market}. Need: ${volume}, Have: ${position?.volume || 0}`);
        return null;
      }
      if (position.averageEntryPrice > 0) {
        tradeProfit = (price - position.averageEntryPrice) * volume - fee;
      }

      this.currentBalance += amount - fee;

      position.volume -= volume;
      // 수량이 0이 되면 포지션 정리 (평균가 등 초기화)
      if (position.volume <= 1e-8) {
        // 부동소수점 비교 오차 고려
        this.positions.delete(market);
      } else {
        // 부분 매도 시 평균 매수가는 유지
        this.positions.set(market, position);
      }
    }

    const newTrade: BacktestTrade = {
      uuid: tradeUuid, // 주문 UUID를 거래 UUID로 사용
      market,
      side,
      orderType,
      price,
      volume,
      amount,
      fee,
      timestamp: currentCandle.timestamp, // 현재 캔들의 타임스탬프 사용
      profit: tradeProfit,
    };
    this.trades.push(newTrade);

    // console.log(`[BacktestPortfolioManager] Trade Recorded: ${side} ${volume} ${market} @ ${price.toFixed(2)}, Fee: ${fee.toFixed(2)}, Balance: ${this.currentBalance.toFixed(2)}`);
    return newTrade;
  }
}
