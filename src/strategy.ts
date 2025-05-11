import { DataManager } from "./core/data-manager";
import { SignalGenerator } from "./core/signal-generator";
import { PortfolioManager } from "./core/portfolio-manager";
import { StrategyResult, CandleData, StrategyConfig } from "./types";
import { config } from "./config";

/**
 * @class TradingStrategyOrchestrator
 * @description 데이터 수집, 신호 생성, 포트폴리오 상태를 종합하여 거래 결정을 내리는 오케스트레이터.
 *             기존 TradingStrategy의 역할을 분담하고 핵심 모듈을 사용합니다.
 */
export class TradingStrategyOrchestrator {
  private dataManager: DataManager;
  private signalGenerator: SignalGenerator;
  private portfolioManager: PortfolioManager; // 포지션 정보 조회, 수익률 계산 등에 사용

  constructor(
    dataManager: DataManager,
    signalGenerator: SignalGenerator,
    portfolioManager: PortfolioManager
  ) {
    this.dataManager = dataManager;
    this.signalGenerator = signalGenerator;
    this.portfolioManager = portfolioManager;
  }

  /**
   * 특정 마켓에 대한 거래 전략을 실행하고 매매 신호를 결정합니다.
   * @param market 마켓 코드 (예: "KRW-BTC")
   * @param customStrategyConfig 특정 전략에 사용할 사용자 정의 파라미터 (옵션)
   * @returns Promise<StrategyResult>
   */
  async determineSignalForMarket(
    market: string,
    customStrategyConfig?: StrategyConfig
  ): Promise<StrategyResult> {
    try {
      const strategyConfigToUse = {
        ...config.trading.defaultStrategyConfig,
        ...customStrategyConfig,
      };

      // 1. 데이터 가져오기 (DataManager 사용)
      // Upbit API는 최근 데이터가 배열의 0번 인덱스에 오므로, 별도 reverse 필요 없음.
      const candles: CandleData[] = await this.dataManager.getCandles(
        market,
        strategyConfigToUse.candleUnit || 5,
        strategyConfigToUse.candleCount || 200
      );

      if (candles.length < (strategyConfigToUse.bollingerPeriod || 20)) {
        return {
          action: "hold",
          market,
          reason: "스트리밍 캔들 데이터 부족",
          score: 0,
        };
      }

      const closePrices = candles.map((candle) => candle.trade_price);
      const volumes = candles.map((candle) => candle.candle_acc_trade_volume);
      const currentPrice = closePrices[0]; // 현재가 (최신 종가)

      // 2. 현재 포지션 정보 가져오기 (PortfolioManager 사용)
      const currentPosition = this.portfolioManager.getPosition(market);

      // 3. 매매 신호 생성 (SignalGenerator 사용)
      const signal = await this.signalGenerator.generateSignal(
        market,
        closePrices,
        volumes,
        currentPosition,
        strategyConfigToUse
      );

      // SignalGenerator가 price, volume 등을 이미 채워줄 것으로 기대.
      // 필요시 여기서 추가 정보 (예: 현재 수익률)를 reason에 덧붙일 수 있음.
      if (config.trading.printStrategy) {
        let positionInfo = "미보유";
        if (currentPosition) {
          const profitRate = await this.portfolioManager.getCurrentProfitRate(
            market
          );
          positionInfo = `보유 (매수가: ${currentPosition.entryPrice.toFixed(
            2
          )}, 수량: ${currentPosition.volume}, 현재수익률: ${(profitRate !==
          null
            ? profitRate * 100
            : 0
          ).toFixed(2)}%)`;
        }
        console.log(
          `[${market}] 최종 전략 판단 (${new Date().toLocaleTimeString()}):`
        );
        console.log(`  - 현재가: ${currentPrice.toFixed(2)}`);
        console.log(`  - 포지션: ${positionInfo}`);
        console.log(
          `  - 신호: ${signal.action.toUpperCase()}, 점수: ${
            signal.score?.toFixed(2) || "N/A"
          }, 이유: ${signal.reason}`
        );
        if (signal.price)
          console.log(`  - 제안 가격: ${signal.price.toFixed(2)}`);
      }

      return signal;
    } catch (error) {
      console.error(`[${market}] 전략 실행 중 오류 발생:`, error);
      return {
        action: "hold",
        market,
        score: 0,
        reason: `전략 실행 오류: ${
          error instanceof Error ? error.message : String(error)
        }
        `,
      };
    }
  }
}
