import { Account, Market, Order, Ticker } from "./types";
import { UpbitAPI } from "./upbit-api";
import { v4 as uuidv4 } from "uuid";

interface MockOrder {
  uuid: string;
  market: string;
  side: "bid" | "ask";
  price: number;
  volume: number;
  executed_volume: number;
  created_at: string;
  status: "wait" | "done" | "cancel";
}

interface MockBalance {
  currency: string;
  balance: number;
  locked: number;
  avg_buy_price: number;
}

export class MockUpbitAPI extends UpbitAPI {
  private mockBalances: MockBalance[] = [
    { currency: "KRW", balance: 1000000, locked: 0, avg_buy_price: 0 },
    { currency: "BTC", balance: 0, locked: 0, avg_buy_price: 0 },
    { currency: "ETH", balance: 0, locked: 0, avg_buy_price: 0 },
    { currency: "XRP", balance: 0, locked: 0, avg_buy_price: 0 },
    { currency: "SOL", balance: 0, locked: 0, avg_buy_price: 0 },
    { currency: "ADA", balance: 0, locked: 0, avg_buy_price: 0 },
  ];

  private mockOrders: MockOrder[] = [];
  private mockTickers: Record<string, number> = {};

  constructor() {
    super();
  }

  // 모킹된 전체 계좌 조회
  async getAccounts(): Promise<Account[]> {
    return this.mockBalances.map((balance) => ({
      currency: balance.currency,
      balance: balance.balance.toString(),
      locked: balance.locked.toString(),
      avg_buy_price: balance.avg_buy_price.toString(),
      avg_buy_price_modified: false,
      unit_currency: balance.currency === "KRW" ? "KRW" : "KRW",
    }));
  }

  // 마켓 코드 조회 - 실제 API 사용
  async getMarkets(): Promise<Market[]> {
    return super.getMarkets();
  }

  // 현재가 조회
  async getTicker(markets: string): Promise<Ticker[]> {
    return super.getTicker(markets);
  }

  // 분 캔들 조회 - 실제 API 사용
  async getMinuteCandles(
    market: string,
    unit: number = 1,
    count: number = 200
  ): Promise<any[]> {
    return super.getMinuteCandles(market, unit, count);
  }

  // 주문하기 - 모킹 (실제 주문은 하지 않음)
  async createOrder(order: Order): Promise<any> {
    try {
      const currency = order.market.split("-")[1];
      const market = order.market;
      const price = parseFloat(order.price || "0");
      const volume = parseFloat(order.volume || "0");

      // 주문 타입에 따른 처리
      if (order.side === "bid") {
        // 매수 주문
        let orderPrice = price;
        let orderVolume = 0;

        if (order.ord_type === "price") {
          // 시장가 매수: 가격으로 주문
          const currentPrice = this.mockTickers[market];
          orderVolume = price / currentPrice;
          orderPrice = currentPrice;
        } else {
          // 지정가 매수
          orderVolume = volume;
        }

        // KRW 잔고 확인
        const krwBalance = this.mockBalances.find((b) => b.currency === "KRW");
        if (!krwBalance || krwBalance.balance < orderPrice * orderVolume) {
          throw new Error("잔고가 부족합니다");
        }

        // 잔고 업데이트
        krwBalance.balance -= orderPrice * orderVolume;

        // 코인 잔고 업데이트
        const coinBalance = this.mockBalances.find(
          (b) => b.currency === currency
        );
        if (coinBalance) {
          // 평균 매수가 계산
          const totalValue =
            coinBalance.balance * coinBalance.avg_buy_price +
            orderPrice * orderVolume;
          const totalVolume = coinBalance.balance + orderVolume;
          coinBalance.avg_buy_price = totalValue / totalVolume;
          coinBalance.balance += orderVolume;
        } else {
          // 새 코인 추가
          this.mockBalances.push({
            currency,
            balance: orderVolume,
            locked: 0,
            avg_buy_price: orderPrice,
          });
        }
      } else if (order.side === "ask") {
        // 매도 주문
        const currentPrice = this.mockTickers[market];
        const orderVolume = volume;

        // 코인 잔고 확인
        const coinBalance = this.mockBalances.find(
          (b) => b.currency === currency
        );
        if (!coinBalance || coinBalance.balance < orderVolume) {
          throw new Error("코인 잔고가 부족합니다");
        }

        // 코인 잔고 업데이트
        coinBalance.balance -= orderVolume;

        // KRW 잔고 업데이트 (수수료 0.05% 가정)
        const krwBalance = this.mockBalances.find((b) => b.currency === "KRW");
        if (krwBalance) {
          const fee = currentPrice * orderVolume * 0.0005;
          krwBalance.balance += currentPrice * orderVolume - fee;
        }
      }

      // 주문 내역 저장
      const mockOrder: MockOrder = {
        uuid: uuidv4(),
        market: order.market,
        side: order.side,
        price: parseFloat(order.price || this.mockTickers[market].toString()),
        volume:
          order.side === "bid"
            ? order.ord_type === "price"
              ? price / this.mockTickers[market]
              : parseFloat(order.volume || "0")
            : parseFloat(order.volume || "0"),
        executed_volume:
          order.side === "bid"
            ? order.ord_type === "price"
              ? price / this.mockTickers[market]
              : parseFloat(order.volume || "0")
            : parseFloat(order.volume || "0"),
        created_at: new Date().toISOString(),
        status: "done",
      };

      this.mockOrders.push(mockOrder);

      return {
        uuid: mockOrder.uuid,
        side: order.side,
        ord_type: order.ord_type,
        price: order.price,
        avg_price: mockOrder.price.toString(),
        state: "done",
        market: order.market,
        created_at: mockOrder.created_at,
        volume: mockOrder.volume.toString(),
        remaining_volume: "0",
        reserved_fee: "0",
        remaining_fee: "0",
        paid_fee: "0",
        locked: "0",
        executed_volume: mockOrder.executed_volume.toString(),
        trades_count: 1,
      };
    } catch (error) {
      console.error("모의 주문 실패:", error);
      throw error;
    }
  }

  // 주문 취소 - 모킹
  async cancelOrder(uuid: string): Promise<any> {
    const orderIndex = this.mockOrders.findIndex(
      (order) => order.uuid === uuid
    );

    if (orderIndex === -1) {
      throw new Error("주문을 찾을 수 없습니다");
    }

    // 주문 상태를 취소로 변경
    this.mockOrders[orderIndex].status = "cancel";

    return {
      uuid,
      side: this.mockOrders[orderIndex].side,
      ord_type: "limit",
      price: this.mockOrders[orderIndex].price.toString(),
      state: "cancel",
      market: this.mockOrders[orderIndex].market,
      created_at: this.mockOrders[orderIndex].created_at,
      volume: this.mockOrders[orderIndex].volume.toString(),
      remaining_volume: this.mockOrders[orderIndex].volume.toString(),
      reserved_fee: "0",
      remaining_fee: "0",
      paid_fee: "0",
      locked: "0",
      executed_volume: "0",
      trades_count: 0,
    };
  }

  // 수익률 조회 메서드
  getProfitRate(market: string): number | null {
    const currency = market.split("-")[1];
    const coinBalance = this.mockBalances.find((b) => b.currency === currency);

    if (!coinBalance || coinBalance.balance <= 0) {
      return null;
    }

    const currentPrice = this.mockTickers[market];
    const avgBuyPrice = coinBalance.avg_buy_price;

    return currentPrice / avgBuyPrice - 1; // 수익률 (1.2 = 20% 수익)
  }

  // 주문 내역 조회 - 모킹
  async getOrders(market?: string): Promise<any[]> {
    // 부모 클래스(UpbitAPI)의 getOrders 메서드 사용
    if (!market) {
      return this.mockOrders.map((order) => ({
        uuid: order.uuid,
        side: order.side,
        ord_type: order.side === "bid" ? "price" : "market",
        price: order.price.toString(),
        state: order.status,
        market: order.market,
        created_at: order.created_at,
        volume: order.volume.toString(),
        remaining_volume: "0",
        reserved_fee: "0",
        remaining_fee: "0",
        paid_fee: "0",
        locked: "0",
        executed_volume: order.executed_volume.toString(),
        trades_count: 1,
      }));
    } else {
      // 특정 마켓의 주문만 필터링
      return this.mockOrders
        .filter((order) => order.market === market)
        .map((order) => ({
          uuid: order.uuid,
          side: order.side,
          ord_type: order.side === "bid" ? "price" : "market",
          price: order.price.toString(),
          state: order.status,
          market: order.market,
          created_at: order.created_at,
          volume: order.volume.toString(),
          remaining_volume: "0",
          reserved_fee: "0",
          remaining_fee: "0",
          paid_fee: "0",
          locked: "0",
          executed_volume: order.executed_volume.toString(),
          trades_count: 1,
        }));
    }
  }

  // 대기 주문 조회 - 모킹
  async getOpenOrders(
    params: {
      market?: string;
      state?: string;
      states?: string[];
      page?: number;
      limit?: number;
      order_by?: string;
    } = {}
  ): Promise<any[]> {
    // 필터링할 상태 결정
    const statesToFilter = params.states || [params.state || "wait"];

    // 주문 필터링
    let filteredOrders = this.mockOrders.filter(
      (order) =>
        statesToFilter.includes(order.status) &&
        (!params.market || order.market === params.market)
    );

    // 정렬
    if (params.order_by === "asc") {
      filteredOrders.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    } else {
      filteredOrders.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    // 페이징
    const page = params.page || 1;
    const limit = params.limit || 100;
    const start = (page - 1) * limit;
    const end = start + limit;

    filteredOrders = filteredOrders.slice(start, end);

    // 응답 포맷에 맞게 변환
    return filteredOrders.map((order) => ({
      uuid: order.uuid,
      side: order.side,
      ord_type: order.side === "bid" ? "price" : "market",
      price: order.price.toString(),
      state: order.status,
      market: order.market,
      created_at: order.created_at,
      volume: order.volume.toString(),
      remaining_volume: "0",
      reserved_fee: "0",
      remaining_fee: "0",
      paid_fee: "0",
      locked: "0",
      executed_volume: order.executed_volume.toString(),
      trades_count: 1,
    }));
  }

  // 종료된 주문 조회 - 모킹
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
  ): Promise<any[]> {
    // 필터링할 상태 결정
    const statesToFilter = params.state
      ? [params.state]
      : params.states || ["done", "cancel"];

    // 주문 필터링
    let filteredOrders = this.mockOrders.filter((order) => {
      // 상태 필터링
      const statusMatch = statesToFilter.includes(order.status);

      // 마켓 필터링
      const marketMatch = !params.market || order.market === params.market;

      // UUID 필터링
      const uuidMatch = !params.uuids || params.uuids.includes(order.uuid);

      return statusMatch && marketMatch && uuidMatch;
    });

    // 정렬
    if (params.order_by === "asc") {
      filteredOrders.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    } else {
      filteredOrders.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    // 페이징
    const page = params.page || 1;
    const limit = params.limit || 100;
    const start = (page - 1) * limit;
    const end = start + limit;

    filteredOrders = filteredOrders.slice(start, end);

    // 응답 포맷에 맞게 변환
    return filteredOrders.map((order) => ({
      uuid: order.uuid,
      side: order.side,
      ord_type: order.side === "bid" ? "price" : "market",
      price: order.price.toString(),
      state: order.status,
      market: order.market,
      created_at: order.created_at,
      volume: order.volume.toString(),
      remaining_volume: "0",
      reserved_fee: "0",
      remaining_fee: "0",
      paid_fee: "0",
      locked: "0",
      executed_volume: order.executed_volume.toString(),
      trades_count: 1,
    }));
  }
}
