import { UpbitAPI } from "./api/upbit-api";
import { MockUpbitAPI } from "./api/mock-api";
import { config } from "./config";
import { OrderHistory } from "./types";

import { DataManager } from "./core/data-manager";
import { IndicatorCalculator } from "./core/indicator-calculator";
import { PortfolioManager } from "./core/portfolio-manager";
import { SignalGenerator } from "./core/signal-generator";
import { RiskManager } from "./core/risk-manager";
import { OrderExecutor } from "./core/order-executor";
import { TradingStrategyOrchestrator } from "./strategy"; // 이전 strategy.ts가 리팩토링된 파일
import { addSignalLog } from "./services/signalLog.service"; // addSignalLog 임포트
import { SignalLog, StrategyResult } from "./types"; // SignalLog, StrategyResult 임포트

export class TradingBot {
  private upbitAPI: UpbitAPI;
  private dataManager: DataManager;
  private indicatorCalculator: IndicatorCalculator;
  private portfolioManager: PortfolioManager;
  private signalGenerator: SignalGenerator;
  private riskManager: RiskManager;
  private orderExecutor: OrderExecutor;
  private strategyOrchestrator: TradingStrategyOrchestrator;

  private interval: NodeJS.Timeout | null = null;
  private targetMarkets: string[] = config.trading.targetMarkets || [
    "KRW-BTC",
    "KRW-ETH",
    // 추가 마켓들...
  ];
  private isRunningCycle: boolean = false; // 동시에 여러 사이클 실행 방지

  constructor(useMockAPI: boolean = false, useRealData: boolean = false) {
    if (useMockAPI || !config.upbit.accessKey || !config.upbit.secretKey) {
      console.warn(
        "실제 Upbit API 키가 제공되지 않았거나 mock API 사용이 명시되어 MockUpbitAPI를 사용합니다."
      );
      this.upbitAPI = new MockUpbitAPI(useRealData);
    } else {
      this.upbitAPI = new UpbitAPI(
        config.upbit.accessKey,
        config.upbit.secretKey
      );
    }

    // Core Modules 초기화
    this.dataManager = new DataManager(this.upbitAPI);
    this.indicatorCalculator = new IndicatorCalculator();
    this.portfolioManager = new PortfolioManager(
      this.dataManager,
      this.upbitAPI
    );
    this.signalGenerator = new SignalGenerator(this.indicatorCalculator);
    this.riskManager = new RiskManager(this.portfolioManager);
    this.orderExecutor = new OrderExecutor(this.upbitAPI);

    // Strategy Orchestrator 초기화
    this.strategyOrchestrator = new TradingStrategyOrchestrator(
      this.dataManager,
      this.signalGenerator,
      this.portfolioManager
    );

    console.log(`거래 대상 마켓: ${this.targetMarkets.join(", ")}`);
  }

  setTargetMarkets(markets: string[]): void {
    this.targetMarkets = markets;
    console.log(`거래 대상 마켓 변경: ${this.targetMarkets.join(", ")}`);
  }

  async start(): Promise<void> {
    console.log("자동 거래 서버를 시작합니다...");
    console.log(`거래 주기: ${config.trading.interval / 1000}초`);

    // 포트폴리오 초기화 및 잔고 동기화
    await this.portfolioManager.initialize(); // loadInitialPortfolio 이름 변경 제안
    await this.portfolioManager.syncKrwBalanceFromAPI();

    const initialKrw = this.portfolioManager.getKrwBalance();
    console.log(`초기 KRW 잔고: ${initialKrw.toFixed(0)} KRW`);
    // 초기 포지션 로드 시 pyramidingCount도 함께 로드되도록 PortfolioManager 수정 필요 가정
    console.log("초기 보유 포지션:", this.portfolioManager.getAllPositions());

    this.interval = setInterval(async () => {
      if (!this.isRunningCycle) {
        this.isRunningCycle = true;
        await this.runTradingCycle();
        this.isRunningCycle = false;
      } else {
        console.log(
          "이전 거래 주기가 아직 실행 중입니다. 이번 주기는 건너<0xEB><0x9B><0x84>니다."
        );
      }
    }, config.trading.interval);

    // 즉시 첫 거래 주기 실행
    if (!this.isRunningCycle) {
      this.isRunningCycle = true;
      await this.runTradingCycle();
      this.isRunningCycle = false;
    }
  }

  private async runTradingCycle(): Promise<void> {
    console.log(`\n[${new Date().toLocaleString()}] 새 거래 주기 시작...`);

    for (const market of this.targetMarkets) {
      try {
        const signal: StrategyResult =
          await this.strategyOrchestrator.determineSignalForMarket(market);

        // 신호 로깅 추가
        const signalLogEntry: SignalLog = {
          timestamp: new Date().toISOString(),
          market: signal.market,
          action: signal.action,
          price: signal.price, // StrategyResult에 price가 있을 경우 사용
          score: signal.score || 0, // score가 undefined일 경우 0으로 설정
          reason: signal.reason,
        };
        await addSignalLog(signalLogEntry);
        // 로깅 후 기존 로직 진행

        const currentPrice =
          signal.price ||
          (await this.dataManager.getTicker(market))?.[0]?.trade_price;

        if (
          !currentPrice &&
          (signal.action === "buy" || signal.action === "sell")
        ) {
          console.warn(
            `[${market}] 현재가를 가져올 수 없어 주문을 진행할 수 없습니다.`
          );
          continue;
        }

        if (signal.action === "buy" && signal.price) {
          // signal.price는 매수 제안가(현재가)
          const investmentAmount =
            this.riskManager.determineInvestmentAmountForBuy(market, signal);

          if (investmentAmount && investmentAmount > 0) {
            console.log(
              `[${market}] 매수 결정: 투자금액 ${investmentAmount.toFixed(
                0
              )} KRW (제안가: ${signal.price.toFixed(2)})`
            );
            // 지정가 매수를 위해 signal.price를 executionPrice로 전달, 시장가 매수 시에는 investmentAmount만 사용
            // OrderExecutor는 executionPrice 유무로 시장가/지정가 구분
            const orderResult: OrderHistory =
              await this.orderExecutor.executeBuyOrder(
                market,
                investmentAmount,
                signal.price
              );

            if (orderResult && orderResult.uuid) {
              console.log(
                `[${market}] 매수 주문 API 요청 성공: UUID ${orderResult.uuid}, 상태 ${orderResult.state}`
              );
              // 실제 체결 처리는 웹훅 또는 주기적인 주문 상태 폴링으로 처리해야 이상적
              // 여기서는 주문 즉시 전량 체결 가정 (Mock/단순화)
              // Upbit API 응답: executed_volume, executed_funds, paid_fee
              if (parseFloat(orderResult.executed_volume) > 0) {
                const executedVolume = parseFloat(orderResult.executed_volume);
                const executedFunds = parseFloat(orderResult.executed_funds);
                const paidFee = parseFloat(orderResult.paid_fee);
                const averagePrice = executedFunds / executedVolume; // 실제 체결 평균 단가

                this.portfolioManager.updatePositionAfterBuy(
                  market,
                  averagePrice,
                  executedVolume,
                  executedFunds + paidFee, // 사용된 KRW = 체결금액 + 수수료
                  signal.reason.includes("[분할매수]") // 분할매수 여부 전달
                );
              } else {
                console.log(
                  `[${market}] 매수 주문(${orderResult.uuid})은 되었으나, 즉시 체결되지 않았습니다. 상태: ${orderResult.state}`
                );
                // TODO: 미체결 주문 관리 로직 추가 (예: 일정 시간 후 취소)
              }
            }
          } else {
            console.log(
              `[${market}] 매수 조건 충족했으나, 투자 금액 결정 불가 또는 0원.`
            );
          }
        } else if (signal.action === "sell" && signal.price) {
          const currentPosition = this.portfolioManager.getPosition(market);
          if (currentPosition && currentPosition.volume > 0) {
            const sellVolume = this.riskManager.determineOrderVolumeForSell(
              market,
              signal,
              currentPosition
            );

            if (sellVolume && sellVolume > 0) {
              console.log(
                `[${market}] 매도 결정: 수량 ${sellVolume} (제안가: ${signal.price.toFixed(
                  2
                )})`
              );
              // 지정가 매도를 위해 signal.price를 executionPrice로 전달, 시장가 매도 시에는 sellVolume만 사용
              const orderResult: OrderHistory =
                await this.orderExecutor.executeSellOrder(
                  market,
                  sellVolume,
                  signal.price
                );

              if (orderResult && orderResult.uuid) {
                console.log(
                  `[${market}] 매도 주문 API 요청 성공: UUID ${orderResult.uuid}, 상태 ${orderResult.state}`
                );
                if (parseFloat(orderResult.executed_volume) > 0) {
                  const executedVolume = parseFloat(
                    orderResult.executed_volume
                  );
                  const executedFunds = parseFloat(orderResult.executed_funds);
                  const paidFee = parseFloat(orderResult.paid_fee);

                  this.portfolioManager.updatePositionAfterSell(
                    market,
                    executedVolume,
                    executedFunds - paidFee // 얻은 KRW = 체결금액 - 수수료
                  );
                } else {
                  console.log(
                    `[${market}] 매도 주문(${orderResult.uuid})은 되었으나, 즉시 체결되지 않았습니다. 상태: ${orderResult.state}`
                  );
                  // TODO: 미체결 주문 관리 로직 추가
                }
              }
            } else {
              console.log(
                `[${market}] 매도 조건 충족했으나, 매도 수량 결정 불가 또는 0.`
              );
            }
          } else {
            console.log(
              `[${market}] 매도 신호 발생했으나, 해당 코인 보유 수량 없음.`
            );
          }
        }
      } catch (error) {
        console.error(`[${market}] 거래 주기 중 해당 마켓 처리 오류:`, error);
      }
      // API 호출 제한을 피하기 위한 짧은 대기
      await new Promise((resolve) =>
        setTimeout(resolve, config.trading.delayBetweenMarkets || 200)
      );
    }
    // 주기 끝날 때 KRW 잔고 최종 동기화
    await this.portfolioManager.syncKrwBalanceFromAPI();
    console.log(
      `[${new Date().toLocaleString()}] 거래 주기 완료. 현재 KRW: ${this.portfolioManager
        .getKrwBalance()
        .toFixed(0)}`
    );
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("자동 거래 서버를 중지했습니다.");
    }
  }

  // 필요한 경우 외부에서 UpbitAPI 직접 접근 허용
  getUpbitAPI(): UpbitAPI {
    return this.upbitAPI;
  }
  // 다른 core 모듈 접근자도 필요에 따라 추가 가능
  getPortfolioManager(): PortfolioManager {
    return this.portfolioManager;
  }

  getDataManager(): DataManager {
    return this.dataManager;
  }

  getOrderExecutor(): OrderExecutor {
    return this.orderExecutor;
  }
}
