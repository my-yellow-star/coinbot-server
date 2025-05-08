import { MockUpbitAPI } from "./mock-api";
import { TradingStrategy } from "./strategy";
import { config } from "./config";
import { Order } from "./types";
import { UpbitAPI } from "./upbit-api";

export class TradingServer {
  private upbitAPI: UpbitAPI;
  private strategy: TradingStrategy;
  private interval: NodeJS.Timeout | null = null;
  private targetMarkets: string[] = ["KRW-BTC"]; // 기본 거래 대상 마켓, 원화-비트코인

  constructor(upbitAPI?: UpbitAPI) {
    this.upbitAPI = upbitAPI || new MockUpbitAPI();
    this.strategy = new TradingStrategy(this.upbitAPI);
  }

  // 거래 대상 마켓 설정
  setTargetMarkets(markets: string[]): void {
    this.targetMarkets = markets;
  }

  // 서버 시작
  async start(): Promise<void> {
    console.log("자동 거래 서버를 시작합니다...");
    console.log(`거래 주기: ${config.trading.interval / 1000}초`);
    console.log(`거래 대상 마켓: ${this.targetMarkets.join(", ")}`);

    // 계정 잔액 정보 출력
    try {
      const accounts = await this.upbitAPI.getAccounts();
      console.log("보유 자산 정보:");
      accounts.forEach((account) => {
        console.log(
          `${account.currency}: ${account.balance} (평균 매수가: ${account.avg_buy_price} ${account.unit_currency})`
        );
      });
    } catch (error) {
      console.error("계정 정보 조회 실패:", error);
    }

    // 주기적으로 전략 실행 및 거래
    this.interval = setInterval(async () => {
      await this.runTradingCycle();
    }, config.trading.interval);

    // 초기 실행
    await this.runTradingCycle();
  }

  // 거래 주기 실행
  private async runTradingCycle(): Promise<void> {
    console.log(`\n[${new Date().toLocaleString()}] 거래 주기 실행 중...`);

    for (const market of this.targetMarkets) {
      try {
        // 전략 실행 및 결과 확인
        const strategyResult = await this.strategy.execute(market);
        console.log(
          `[${market}] 전략 결과: ${strategyResult.action} (${strategyResult.reason})`
        );

        // 매수 또는 매도 신호가 있을 경우 주문 실행
        if (strategyResult.action === "buy") {
          const order: Order = {
            market,
            side: "bid",
            volume: strategyResult.volume?.toString(),
            price: strategyResult.price?.toString(),
            ord_type: "price",
          };

          // 시장가 매수는 price 사용, volume 생략
          delete order.volume;

          console.log(`[${market}] 매수 주문 생성 중... (${order.price} KRW)`);
          const result = await this.upbitAPI.createOrder(order);
          console.log(`[${market}] 매수 주문 생성 완료:`, result.uuid);
        } else if (strategyResult.action === "sell") {
          const order: Order = {
            market,
            side: "ask",
            volume: strategyResult.volume?.toString(),
            ord_type: "market",
          };

          console.log(
            `[${market}] 매도 주문 생성 중... (수량: ${order.volume})`
          );
          const result = await this.upbitAPI.createOrder(order);
          console.log(`[${market}] 매도 주문 생성 완료:`, result.uuid);
        }
      } catch (error) {
        console.error(`[${market}] 거래 주기 실행 중 오류:`, error);
      }
    }
  }

  // 서버 중지
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("자동 거래 서버를 중지했습니다.");
    }
  }

  // API 객체 반환 (웹 클라이언트에서 사용)
  getAPI(): UpbitAPI {
    return this.upbitAPI;
  }
}
