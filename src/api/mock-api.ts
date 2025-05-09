import {
  Account,
  Market,
  Order,
  Ticker,
  CandleData,
  OrderHistory,
} from "../types";
import { UpbitAPI } from "./upbit-api";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config";

interface MockOrder {
  uuid: string;
  market: string;
  side: "bid" | "ask";
  price: number;
  volume: number;
  executed_volume: number;
  executed_funds: number;
  paid_fee: number;
  created_at: string;
  status: "wait" | "done" | "cancel";
  ord_type: Order["ord_type"];
}

interface MockBalance {
  currency: string;
  balance: number;
  locked: number;
  avg_buy_price: number;
}

const MOCK_MARKETS = config.trading.targetMarkets || [
  "KRW-BTC",
  "KRW-ETH",
  "KRW-SOL",
  "KRW-XRP",
  "KRW-ADA",
];
const INITIAL_PRICES: Record<string, number> = {
  "KRW-BTC": 60000000,
  "KRW-ETH": 4000000,
  "KRW-SOL": 150000,
  "KRW-XRP": 700,
  "KRW-ADA": 500,
};

export class MockUpbitAPI extends UpbitAPI {
  private mockBalances: MockBalance[] = [];
  private mockOrders: MockOrder[] = [];
  private mockTickers: Record<string, Ticker> = {};
  private mockCandleData: Record<string, CandleData[]> = {};
  private priceUpdateInterval: NodeJS.Timeout | null = null;
  private useRealData: boolean;

  constructor(
    useRealData: boolean = false,
    accessKey?: string,
    secretKey?: string
  ) {
    super(
      useRealData ? accessKey || config.upbit.accessKey : "mockAccessKey",
      useRealData ? secretKey || config.upbit.secretKey : "mockSecretKey"
    );
    this.useRealData = useRealData;

    this.initializeMockData();
    this.startPriceFluctuation();
    if (this.useRealData) {
      if (this.priceUpdateInterval) {
        clearInterval(this.priceUpdateInterval);
        this.priceUpdateInterval = null;
      }
      console.log(
        "[MockUpbitAPI] 실제 Upbit API 데이터를 사용합니다 (Ticker, Candles)."
      );
    }
  }

  private initializeMockData(): void {
    this.mockBalances = [
      { currency: "KRW", balance: 10000000, locked: 0, avg_buy_price: 0 },
      ...MOCK_MARKETS.map((market) => market.split("-")[1])
        .filter((c) => c !== "KRW")
        .map((currency) => ({
          currency,
          balance: 0,
          locked: 0,
          avg_buy_price: 0,
        })),
    ];

    MOCK_MARKETS.forEach((market) => {
      const initialPrice = INITIAL_PRICES[market] || 10000;
      this.mockTickers[market] = this.generateMockTicker(market, initialPrice);
      this.mockCandleData[market] = this.generateMockCandles(
        market,
        initialPrice,
        200,
        5
      );
    });
  }

  private generateMockTicker(market: string, price: number): Ticker {
    const randomFluctuation = price * (Math.random() - 0.5) * 0.02;
    const trade_price = Math.max(0, price + randomFluctuation);
    return {
      market,
      trade_price,
      signed_change_rate: (Math.random() - 0.5) * 0.1,
      acc_trade_price_24h: trade_price * (10 + Math.random() * 10),
      high_price: trade_price * (1 + Math.random() * 0.02),
      low_price: trade_price * (1 - Math.random() * 0.02),
    };
  }

  private generateMockCandles(
    market: string,
    startPrice: number,
    count: number,
    unit: number
  ): CandleData[] {
    const candles: CandleData[] = [];
    let currentPrice = startPrice;
    const now = Date.now();

    for (let i = 0; i < count; i++) {
      const open = currentPrice;
      const close = Math.max(
        0,
        currentPrice + (Math.random() - 0.5) * currentPrice * 0.05
      );
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);
      const volume = 1 + Math.random() * 10;
      const timestamp = now - (count - 1 - i) * unit * 60 * 1000;

      candles.push({
        market,
        candle_date_time_utc: new Date(timestamp).toISOString(),
        candle_date_time_kst: new Date(timestamp + 9 * 60 * 60 * 1000)
          .toISOString()
          .replace(".000Z", "+09:00"),
        opening_price: open,
        high_price: high,
        low_price: low,
        trade_price: close,
        timestamp,
        candle_acc_trade_price: close * volume,
        candle_acc_trade_volume: volume,
        unit,
      });
      currentPrice = close;
    }
    return candles.reverse();
  }

  private startPriceFluctuation(): void {
    if (this.useRealData) return;
    if (this.priceUpdateInterval) clearInterval(this.priceUpdateInterval);
    this.priceUpdateInterval = setInterval(() => {
      MOCK_MARKETS.forEach((market) => {
        const currentTicker = this.mockTickers[market];
        if (currentTicker) {
          const oldPrice = currentTicker.trade_price;
          this.mockTickers[market] = this.generateMockTicker(market, oldPrice);
          const latestCandles = this.mockCandleData[market];
          if (latestCandles && latestCandles.length > 0) {
            const lastCandle = latestCandles[0];
            const newCandleTime =
              new Date(lastCandle.candle_date_time_utc).getTime() +
              lastCandle.unit * 60 * 1000;
            if (Date.now() >= newCandleTime) {
              const newCandle = this.generateMockCandles(
                market,
                this.mockTickers[market].trade_price,
                1,
                lastCandle.unit
              )[0];
              latestCandles.unshift(newCandle);
              if (latestCandles.length > 250) {
                latestCandles.pop();
              }
            }
          }
        }
      });
    }, 5000);
  }

  async getAccounts(): Promise<Account[]> {
    if (this.useRealData) {
      // 실제 API 사용 시 경고 또는 에러 처리 (현재는 모의 데이터 사용)
      // console.warn("[MockUpbitAPI] getAccounts는 현재 모의 데이터만 지원합니다. 실제 계좌 조회를 위해서는 UpbitAPI 직접 사용 또는 MockUpbitAPI 수정 필요.");
      // 또는 실제 API 호출
      // return super.getAccounts();
    }

    return this.mockBalances.map((balance) => ({
      currency: balance.currency,
      balance: `${balance.balance.toFixed(config.upbit.volumePrecision || 8)}`,
      locked: `${balance.locked.toFixed(config.upbit.volumePrecision || 8)}`,
      avg_buy_price: `${balance.avg_buy_price.toFixed(2)}`,
      avg_buy_price_modified: false,
      unit_currency: "KRW",
    }));
  }

  async getMarkets(): Promise<Market[]> {
    if (this.useRealData) {
      return super.getMarkets();
    }
    return MOCK_MARKETS.map((marketCode) => ({
      market: marketCode,
      korean_name: marketCode,
      english_name: marketCode,
    }));
  }

  async getTicker(markets: string): Promise<Ticker[]> {
    if (this.useRealData) {
      try {
        return await super.getTicker(markets);
      } catch (error) {
        console.error(
          `[MockUpbitAPI] 실제 Ticker 조회 실패 (markets: ${markets}):`,
          error
        );
        return [];
      }
    }

    const marketList = markets.split(",");
    const result: Ticker[] = [];
    for (const market of marketList) {
      if (this.mockTickers[market]) {
        result.push(this.mockTickers[market]);
      } else {
        console.warn(
          `[MockAPI] Ticker for ${market} not found, generating default.`
        );
        const initialPrice =
          INITIAL_PRICES[market] ||
          (MOCK_MARKETS.includes(market)
            ? INITIAL_PRICES[market] || 1000
            : 1000);
        this.mockTickers[market] = this.generateMockTicker(
          market,
          initialPrice
        );
        result.push(this.mockTickers[market]);
      }
    }
    if (result.length === 0 && markets === "") {
      return [];
    }
    if (result.length === 0) {
      console.error(`[MockAPI] No ticker data for markets: ${markets}`);
      return [];
    }
    return result;
  }

  async getMinuteCandles(
    market: string,
    unit: number = 1,
    count: number = 200
  ): Promise<CandleData[]> {
    if (this.useRealData) {
      try {
        return await super.getMinuteCandles(market, unit, count);
      } catch (error) {
        console.error(
          `[MockUpbitAPI] 실제 Candle 조회 실패 (market: ${market}, unit: ${unit}, count: ${count}):`,
          error
        );
        return [];
      }
    }

    if (this.mockCandleData[market]) {
      const candles = this.mockCandleData[market];
      return candles.slice(0, count);
    } else {
      console.warn(
        `[MockAPI] Candle data for ${market} not found, generating default.`
      );
      const initialPrice = INITIAL_PRICES[market] || 1000;
      this.mockCandleData[market] = this.generateMockCandles(
        market,
        initialPrice,
        count,
        unit
      );
      return this.mockCandleData[market].slice(0, count);
    }
  }

  async createOrder(order: Order): Promise<OrderHistory> {
    const market = order.market;
    const side = order.side;
    const ord_type = order.ord_type;
    const feeRate = config.upbit.feeRate;

    let orderPrice = parseFloat(order.price || "0");
    let orderVolume = parseFloat(order.volume || "0");

    const currentTicker = this.mockTickers[market];
    if (
      !currentTicker &&
      (ord_type === "price" || ord_type === "market" || ord_type === "limit")
    ) {
      console.error(
        `[MockAPI] ${market}의 현재 시세를 찾을 수 없어 주문을 처리할 수 없습니다.`
      );
      throw new Error(`${market}의 현재 시세를 찾을 수 없습니다.`);
    }
    const currentMarketPrice = currentTicker?.trade_price || orderPrice;

    let executed_volume = 0;
    let executed_funds = 0;
    let paid_fee = 0;
    let avg_price = 0;

    const krwAccount = this.mockBalances.find((b) => b.currency === "KRW");
    if (!krwAccount) throw new Error("KRW 계좌를 찾을 수 없습니다.");

    const coinCurrency = market.split("-")[1];
    let coinAccount = this.mockBalances.find(
      (b) => b.currency === coinCurrency
    );
    if (!coinAccount && side === "bid") {
      this.mockBalances.push({
        currency: coinCurrency,
        balance: 0,
        locked: 0,
        avg_buy_price: 0,
      });
      coinAccount = this.mockBalances.find((b) => b.currency === coinCurrency)!;
    }
    if (!coinAccount && side === "ask") {
      throw new Error(`${coinCurrency} 코인 계좌가 없어 매도할 수 없습니다.`);
    }

    if (side === "bid") {
      if (ord_type === "price") {
        if (orderPrice < config.upbit.minOrderAmountKRW)
          throw new Error(
            `최소 주문 금액(${config.upbit.minOrderAmountKRW} KRW) 미만입니다.`
          );
        if (krwAccount.balance < orderPrice) throw new Error("KRW 잔고 부족");

        executed_volume = orderPrice / currentMarketPrice;
        executed_volume = parseFloat(
          executed_volume.toFixed(config.upbit.volumePrecision)
        );

        const actualCoinPurchaseCost = orderPrice / (1 + feeRate);
        executed_volume = parseFloat(
          (actualCoinPurchaseCost / currentMarketPrice).toFixed(
            config.upbit.volumePrecision
          )
        );
        executed_funds = actualCoinPurchaseCost;
        paid_fee = orderPrice - actualCoinPurchaseCost;
        avg_price = currentMarketPrice;

        krwAccount.balance -= orderPrice;
        if (coinAccount) {
          const newTotalVolume = coinAccount.balance + executed_volume;
          coinAccount.avg_buy_price =
            (coinAccount.avg_buy_price * coinAccount.balance +
              currentMarketPrice * executed_volume) /
            newTotalVolume;
          coinAccount.balance = newTotalVolume;
        }
      } else if (ord_type === "limit") {
        if (orderPrice * orderVolume < config.upbit.minOrderAmountKRW)
          throw new Error(
            `최소 주문 금액(${config.upbit.minOrderAmountKRW} KRW) 미만입니다.`
          );
        if (krwAccount.balance < orderPrice * orderVolume * (1 + feeRate))
          throw new Error("KRW 잔고 부족 (수수료 포함)");

        if (currentMarketPrice <= orderPrice) {
          executed_volume = orderVolume;
          executed_funds = orderPrice * executed_volume;
          paid_fee = executed_funds * feeRate;
          avg_price = orderPrice;

          krwAccount.balance -= executed_funds + paid_fee;
          if (coinAccount) {
            const newTotalVolume = coinAccount.balance + executed_volume;
            coinAccount.avg_buy_price =
              (coinAccount.avg_buy_price * coinAccount.balance +
                orderPrice * executed_volume) /
              newTotalVolume;
            coinAccount.balance = newTotalVolume;
          }
        } else {
          console.log(
            `[MockAPI] ${market} 지정가 매수 주문: 현재가(${currentMarketPrice})가 지정가(${orderPrice})보다 높아 미체결`
          );
        }
      } else {
        throw new Error("지원하지 않는 매수 주문 유형입니다.");
      }
    } else {
      if (!coinAccount || coinAccount.balance < orderVolume)
        throw new Error(`${coinCurrency} 잔고 부족`);

      if (ord_type === "market") {
        if (currentMarketPrice * orderVolume < config.upbit.minOrderAmountKRW)
          throw new Error(
            `최소 주문 금액(${config.upbit.minOrderAmountKRW} KRW) 미만입니다.`
          );
        executed_volume = orderVolume;
        executed_funds = currentMarketPrice * executed_volume;
        paid_fee = executed_funds * feeRate;
        avg_price = currentMarketPrice;

        coinAccount.balance -= executed_volume;
        krwAccount.balance += executed_funds - paid_fee;
      } else if (ord_type === "limit") {
        if (orderPrice * orderVolume < config.upbit.minOrderAmountKRW)
          throw new Error(
            `최소 주문 금액(${config.upbit.minOrderAmountKRW} KRW) 미만입니다.`
          );
        if (currentMarketPrice >= orderPrice) {
          executed_volume = orderVolume;
          executed_funds = orderPrice * executed_volume;
          paid_fee = executed_funds * feeRate;
          avg_price = orderPrice;

          coinAccount.balance -= executed_volume;
          krwAccount.balance += executed_funds - paid_fee;
        } else {
          console.log(
            `[MockAPI] ${market} 지정가 매도 주문: 현재가(${currentMarketPrice})가 지정가(${orderPrice})보다 낮아 미체결`
          );
        }
      } else {
        throw new Error("지원하지 않는 매도 주문 유형입니다.");
      }
    }

    const newMockOrder: MockOrder = {
      uuid: uuidv4(),
      market,
      side,
      price: orderPrice,
      volume: orderVolume,
      executed_volume,
      executed_funds,
      paid_fee,
      created_at: new Date().toISOString(),
      status: executed_volume > 0 ? "done" : "wait",
      ord_type: ord_type,
    };
    this.mockOrders.push(newMockOrder);

    return {
      uuid: newMockOrder.uuid,
      side: newMockOrder.side,
      ord_type: newMockOrder.ord_type,
      price: newMockOrder.price.toString(),
      avg_price: avg_price.toString(),
      state: newMockOrder.status as OrderHistory["state"],
      market: newMockOrder.market,
      created_at: newMockOrder.created_at,
      volume: newMockOrder.volume.toString(),
      remaining_volume: (
        newMockOrder.volume - newMockOrder.executed_volume
      ).toString(),
      reserved_fee: "0",
      remaining_fee: "0",
      paid_fee: newMockOrder.paid_fee.toString(),
      locked: "0",
      executed_volume: newMockOrder.executed_volume.toString(),
      executed_funds: newMockOrder.executed_funds.toString(),
      trades_count: newMockOrder.executed_volume > 0 ? 1 : 0,
    } as OrderHistory;
  }

  async cancelOrder(uuid: string): Promise<OrderHistory> {
    const orderIndex = this.mockOrders.findIndex(
      (order) => order.uuid === uuid
    );
    if (orderIndex === -1) throw new Error("취소할 주문을 찾을 수 없습니다.");

    const orderToCancel = this.mockOrders[orderIndex];
    if (orderToCancel.status !== "wait")
      throw new Error("대기 중인 주문만 취소할 수 있습니다.");

    orderToCancel.status = "cancel";

    return {
      uuid: orderToCancel.uuid,
      side: orderToCancel.side,
      ord_type: orderToCancel.ord_type,
      price: orderToCancel.price.toString(),
      avg_price: "0",
      state: "cancel",
      market: orderToCancel.market,
      created_at: orderToCancel.created_at,
      volume: orderToCancel.volume.toString(),
      remaining_volume: orderToCancel.volume.toString(),
      reserved_fee: "0",
      remaining_fee: "0",
      paid_fee: "0",
      locked: "0",
      executed_volume: "0",
      executed_funds: "0",
      trades_count: 0,
    } as OrderHistory;
  }

  async getProfitRate(market: string): Promise<number | null> {
    const currency = market.split("-")[1];
    const coinBalance = this.mockBalances.find((b) => b.currency === currency);

    if (
      !coinBalance ||
      coinBalance.balance <= 0 ||
      coinBalance.avg_buy_price <= 0
    ) {
      return null;
    }

    let currentPrice = this.mockTickers[market]?.trade_price;

    if (!currentPrice || currentPrice <= 0) {
      try {
        const tickerData = await this.getTicker(market);
        if (
          tickerData &&
          tickerData.length > 0 &&
          tickerData[0].trade_price > 0
        ) {
          currentPrice = tickerData[0].trade_price;
          this.mockTickers[market] = tickerData[0];
        } else {
          console.warn(
            `[MockAPI] 수익률 계산 시 ${market} 현재가를 가져올 수 없습니다.`
          );
          return null;
        }
      } catch (error) {
        console.error(
          `[MockAPI] 수익률 계산 중 현재가 조회 실패: ${market}`,
          error
        );
        return null;
      }
    }
    return (
      currentPrice / coinBalance.avg_buy_price - 1 - config.upbit.feeRate * 2
    );
  }

  async getOpenOrders(
    params: {
      market?: string;
      state?: string;
      states?: string[];
      page?: number;
      limit?: number;
      order_by?: string;
    } = {}
  ): Promise<OrderHistory[]> {
    const statesToFilter =
      params.states || (params.state ? [params.state] : ["wait"]);

    let filteredOrders = this.mockOrders.filter(
      (order) =>
        statesToFilter.includes(order.status) &&
        (!params.market || order.market === params.market)
    );

    filteredOrders.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (params.order_by === "asc") {
      filteredOrders.reverse();
    }

    const page = params.page || 1;
    const limit = params.limit || 100;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedOrders = filteredOrders.slice(start, end);

    return paginatedOrders.map(
      (o) =>
        ({
          uuid: o.uuid,
          side: o.side,
          ord_type: o.ord_type,
          price: o.price.toString(),
          avg_price:
            o.executed_volume > 0
              ? (o.executed_funds / o.executed_volume).toString()
              : "0",
          state: o.status as OrderHistory["state"],
          market: o.market,
          created_at: o.created_at,
          volume: o.volume.toString(),
          remaining_volume: (o.volume - o.executed_volume).toString(),
          reserved_fee: "0",
          remaining_fee: "0",
          paid_fee: o.paid_fee.toString(),
          locked: "0",
          executed_volume: o.executed_volume.toString(),
          executed_funds: o.executed_funds.toString(),
          trades_count: o.executed_volume > 0 ? 1 : 0,
        } as OrderHistory)
    );
  }

  async getClosedOrders(
    params: {
      market?: string;
      state?: string;
      states?: string[];
      uuids?: string[];
      identifiers?: string[];
      page?: number;
      limit?: number;
      order_by?: string;
    } = {}
  ): Promise<OrderHistory[]> {
    const defaultStates: OrderHistory["state"][] = ["done", "cancel"];
    const statesToFilter = params.states
      ? (params.states.filter((s) =>
          defaultStates.includes(s as OrderHistory["state"])
        ) as OrderHistory["state"][])
      : params.state
      ? [params.state as OrderHistory["state"]]
      : defaultStates;

    let filteredOrders = this.mockOrders.filter((order) => {
      const statusMatch = statesToFilter.includes(
        order.status as OrderHistory["state"]
      );
      const marketMatch = !params.market || order.market === params.market;
      const uuidMatch = !params.uuids || params.uuids.includes(order.uuid);
      return statusMatch && marketMatch && uuidMatch;
    });

    filteredOrders.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (params.order_by === "asc") {
      filteredOrders.reverse();
    }

    const page = params.page || 1;
    const limit = params.limit || 100;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedOrders = filteredOrders.slice(start, end);

    return paginatedOrders.map(
      (o) =>
        ({
          uuid: o.uuid,
          side: o.side,
          ord_type: o.ord_type,
          price: o.price.toString(),
          avg_price:
            o.executed_volume > 0
              ? (o.executed_funds / o.executed_volume).toString()
              : "0",
          state: o.status as OrderHistory["state"],
          market: o.market,
          created_at: o.created_at,
          volume: o.volume.toString(),
          remaining_volume: (o.volume - o.executed_volume).toString(),
          reserved_fee: "0",
          remaining_fee: "0",
          paid_fee: o.paid_fee.toString(),
          locked: "0",
          executed_volume: o.executed_volume.toString(),
          executed_funds: o.executed_funds.toString(),
          trades_count: o.executed_volume > 0 ? 1 : 0,
        } as OrderHistory)
    );
  }

  async getOrders(
    params: {
      market?: string;
      uuids?: string[];
      identifiers?: string[];
      state?: OrderHistory["state"];
      states?: OrderHistory["state"][];
      page?: number;
      limit?: number;
      order_by?: string;
    } = {}
  ): Promise<OrderHistory[]> {
    let filteredOrders = this.mockOrders.filter((order) => {
      const marketMatch = !params.market || order.market === params.market;
      const uuidMatch = !params.uuids || params.uuids.includes(order.uuid);

      let stateMatch = true;
      if (params.state) {
        stateMatch = order.status === params.state;
      } else if (params.states && params.states.length > 0) {
        stateMatch = params.states.includes(
          order.status as OrderHistory["state"]
        );
      }
      return marketMatch && uuidMatch && stateMatch;
    });

    filteredOrders.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (params.order_by === "asc") {
      filteredOrders.reverse();
    }

    const page = params.page || 1;
    const limit = params.limit || 100;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedOrders = filteredOrders.slice(start, end);

    return paginatedOrders.map(
      (o) =>
        ({
          uuid: o.uuid,
          side: o.side,
          ord_type: o.ord_type,
          price: o.price.toString(),
          avg_price:
            o.executed_volume > 0
              ? (o.executed_funds / o.executed_volume).toString()
              : "0",
          state: o.status as OrderHistory["state"],
          market: o.market,
          created_at: o.created_at,
          volume: o.volume.toString(),
          remaining_volume: (o.volume - o.executed_volume).toString(),
          reserved_fee: "0",
          remaining_fee: "0",
          paid_fee: o.paid_fee.toString(),
          locked: "0",
          executed_volume: o.executed_volume.toString(),
          executed_funds: o.executed_funds.toString(),
          trades_count: o.executed_volume > 0 ? 1 : 0,
        } as OrderHistory)
    );
  }
}
