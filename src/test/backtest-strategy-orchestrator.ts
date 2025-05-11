import {
  BacktestCandleData,
  BacktestStrategySignal,
  BacktestStrategyConfig,
  BacktestPosition,
} from "./types";
import { BacktestDataManager } from "./backtest-data-manager";
import { SignalGenerator } from "../core/signal-generator";
import {
  StrategyConfig as CoreStrategyConfig,
  Position as CorePosition,
  StrategyResult as CoreStrategyResult,
  CandleData as CoreCandleData,
} from "../types";
import { BacktestPortfolioManager } from "./backtest-portfolio-manager";

export class BacktestStrategyOrchestrator {
  private dataManager: BacktestDataManager;
  private signalGenerator: SignalGenerator;
  private portfolioManager: BacktestPortfolioManager;

  constructor(
    dataManager: BacktestDataManager,
    signalGenerator: SignalGenerator,
    portfolioManager: BacktestPortfolioManager
  ) {
    this.dataManager = dataManager;
    this.signalGenerator = signalGenerator;
    this.portfolioManager = portfolioManager;
  }

  private convertToCoreStrategyConfig(
    config: BacktestStrategyConfig
  ): CoreStrategyConfig {
    const coreConfig: CoreStrategyConfig = {
      ...config,
      rsiOverboughtThreshold: config.rsiOverbought,
      rsiOversoldThreshold: config.rsiOversold,
      weights: config.weights || {},
      pyramidingRsiCondition: config.pyramidingRsiCondition || {},
      stopLossPercentShortTerm:
        config.stopLossPercent !== undefined
          ? config.stopLossPercent * 100
          : undefined,
      profitTargetPercentShortTerm:
        config.takeProfitPercent !== undefined
          ? config.takeProfitPercent * 100
          : undefined,
    };
    delete (coreConfig as any).rsiOverbought;
    delete (coreConfig as any).rsiOversold;
    delete (coreConfig as any).mfiPeriod;
    delete (coreConfig as any).mfiOverbought;
    delete (coreConfig as any).mfiOversold;
    delete (coreConfig as any).minTradeVolume;
    delete (coreConfig as any).maxTradeRatio;
    delete (coreConfig as any).initialBalance;
    delete (coreConfig as any).printSignalDetails;
    delete (coreConfig as any).candleUnit;
    delete (coreConfig as any).candleCount;
    return coreConfig;
  }

  private convertToCorePosition(
    position: BacktestPosition | undefined
  ): CorePosition | null {
    if (!position || position.volume <= 0) return null;
    return {
      market: position.market,
      entryPrice: position.averageEntryPrice,
      volume: position.volume,
    };
  }

  public async determineSignalForMarket(
    market: string,
    unit: number,
    strategyConfig: BacktestStrategyConfig,
    currentCandleIndex: number
  ): Promise<BacktestStrategySignal> {
    try {
      const candleCount = strategyConfig.candleCount || 200;

      const candles: BacktestCandleData[] = this.dataManager.getCandles(
        market,
        unit,
        candleCount,
        currentCandleIndex
      );

      if (
        candles.length === 0 ||
        candles.length < (strategyConfig.bollingerPeriod || 20) ||
        candles.length < (strategyConfig.rsiPeriod || 14 + 1)
      ) {
        return {
          action: "hold",
          market,
          reason: "Not enough candle data for strategy execution",
        };
      }

      const closePrices: number[] = candles.map((c) => c.trade_price);
      const tradeVolumes: number[] = candles.map(
        (c) => c.candle_acc_trade_volume
      );

      const currentBacktestPosition = this.portfolioManager.getPosition(market);
      const corePosition: CorePosition | null = this.convertToCorePosition(
        currentBacktestPosition
      );
      const coreStrategyConfig: CoreStrategyConfig =
        this.convertToCoreStrategyConfig(strategyConfig);

      const coreSignal: CoreStrategyResult =
        await this.signalGenerator.generateSignal(
          market,
          closePrices,
          tradeVolumes,
          corePosition,
          coreStrategyConfig
        );

      const backtestSignal: BacktestStrategySignal = {
        action: coreSignal.action,
        market: coreSignal.market,
        price: coreSignal.price,
        reason: coreSignal.reason,
        score: coreSignal.score,
      };

      if (strategyConfig.printSignalDetails) {
        const currentPrice = candles[0].trade_price;
        let positionInfo = "No position";
        if (currentBacktestPosition && currentBacktestPosition.volume > 0) {
          const profitRate =
            currentBacktestPosition.profitRate !== undefined
              ? (currentBacktestPosition.profitRate * 100).toFixed(2)
              : "N/A";
          positionInfo = `Volume: ${currentBacktestPosition.volume.toFixed(
            4
          )}, AvgEntry: ${currentBacktestPosition.averageEntryPrice.toFixed(
            2
          )}, Profit: ${profitRate}%`;
        }
        console.log(
          `[${market} - Candle#${currentCandleIndex} @ ${candles[0]?.candle_date_time_kst}] ` +
            `Price: ${currentPrice}, Position: ${positionInfo}, Signal: ${backtestSignal.action.toUpperCase()}, ` +
            `Reason: ${backtestSignal.reason || "N/A"}, Score: ${
              backtestSignal.score?.toFixed(2) || "N/A"
            }`
        );
      }

      return backtestSignal;
    } catch (error) {
      console.error(
        `[${market}] Error in determineSignalForMarket at index ${currentCandleIndex}:`,
        error
      );
      return {
        action: "hold",
        market,
        reason: `Strategy execution error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
}
