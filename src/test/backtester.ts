import { BacktestDataManager } from "./backtest-data-manager";
import { BacktestPortfolioManager } from "./backtest-portfolio-manager";
import { MockOrderExecutor } from "./mock-order-executor";
import { BacktestStrategyOrchestrator } from "./backtest-strategy-orchestrator";
import {
  BacktestStrategyConfig,
  BacktestTrade,
  OrderSide,
  OrderType,
  BacktestOrder,
} from "./types";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { IndicatorCalculator } from "../core/indicator-calculator";
import { SignalGenerator } from "../core/signal-generator";

// 기본 전략 설정 (필요시 types.ts의 BacktestStrategyConfig와 동기화)
const DEFAULT_STRATEGY_CONFIG: BacktestStrategyConfig = {
  candleUnit: 1,
  candleCount: 200,
  bollingerPeriod: 20,
  bollingerStdDev: 2,
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  mfiPeriod: 14,
  mfiOverbought: 80,
  mfiOversold: 20,
  movingAveragePeriod: 20,
  minTradeVolume: 0.0001,
  maxTradeRatio: 0.25, // 자산의 최대 25%까지 한 번에 거래
  stopLossPercent: 0.05, // 5% 손절 (미구현)
  takeProfitPercent: 0.1, // 10% 익절 (미구현)
  feeRate: 0.0005, // 업비트 KRW 마켓 기준 0.05%
  initialBalance: 1000000, // 기본 초기 자본 100만원
  printSignalDetails: false,
};

interface BacktestRunResult {
  market: string;
  unit: number;
  initialBalance: number;
  finalBalance: number;
  totalProfit: number;
  totalProfitRate: number;
  trades: BacktestTrade[];
  winCount: number;
  lossCount: number;
  winRate: number;
  maxDrawdown: number;
  buySignals: number;
  sellSignals: number;
  holdSignals: number;
  strategyConfig: BacktestStrategyConfig;
  totalCandles: number;
  simulatedCandles: number;
  simulationDurationMs: number;
}

export class Backtester {
  private dataManager: BacktestDataManager;
  private portfolioManager: BacktestPortfolioManager;
  private orderExecutor: MockOrderExecutor;
  private indicatorCalculator: IndicatorCalculator;
  private signalGenerator: SignalGenerator;
  private strategyOrchestrator: BacktestStrategyOrchestrator;
  private strategyConfig: BacktestStrategyConfig;

  constructor(customConfig?: Partial<BacktestStrategyConfig>) {
    this.strategyConfig = { ...DEFAULT_STRATEGY_CONFIG, ...customConfig };

    this.dataManager = new BacktestDataManager();
    this.portfolioManager = new BacktestPortfolioManager(
      this.strategyConfig.initialBalance!,
      "KRW",
      this.strategyConfig.feeRate
    );
    this.orderExecutor = new MockOrderExecutor(this.portfolioManager);
    this.indicatorCalculator = new IndicatorCalculator();
    this.signalGenerator = new SignalGenerator(this.indicatorCalculator);
    this.strategyOrchestrator = new BacktestStrategyOrchestrator(
      this.dataManager,
      this.signalGenerator,
      this.portfolioManager
    );
    console.log("[Backtester] Initialized with config:", this.strategyConfig);
  }

  private calculateTradeVolume(
    market: string,
    currentPrice: number,
    action: "buy" | "sell",
    config: BacktestStrategyConfig
  ): number {
    const maxTradeRatio = config.maxTradeRatio || 0.25;
    const minTradeVolumeAsset = config.minTradeVolume || 0.0001;
    const minTradeValueKRW = 5000;
    const feeRate = config.feeRate || 0.0005;

    if (action === "buy") {
      const availableBalance = this.portfolioManager.getCurrentBalance();
      const maxSpendable = availableBalance / (1 + feeRate);

      if (maxSpendable < minTradeValueKRW) {
        return 0;
      }

      let targetSpend = maxSpendable * maxTradeRatio;
      if (targetSpend < minTradeValueKRW) {
        targetSpend = minTradeValueKRW;
      }

      let volume = targetSpend / currentPrice;

      if (volume < minTradeVolumeAsset) {
        const costForMinAssetVolume = minTradeVolumeAsset * currentPrice;
        if (
          costForMinAssetVolume >= minTradeValueKRW &&
          costForMinAssetVolume * (1 + feeRate) <= maxSpendable
        ) {
          volume = minTradeVolumeAsset;
        } else {
          return 0;
        }
      }
      return volume;
    } else {
      const position = this.portfolioManager.getPosition(market);
      if (position && position.volume > 0) {
        let volumeToSell =
          position.volume * (config.sellRatioOfPosition || 1.0);

        if (
          volumeToSell < minTradeVolumeAsset ||
          volumeToSell * currentPrice < minTradeValueKRW
        ) {
          if (
            position.volume >= minTradeVolumeAsset &&
            position.volume * currentPrice >= minTradeValueKRW
          ) {
            volumeToSell = position.volume;
          } else {
            return 0;
          }
        }
        return volumeToSell;
      }
      return 0;
    }
  }

  public async run(
    market: string,
    unit: number,
    csvRelativePath: string, // 예: "data/BTC_1min_candles.csv"
    runStrategyConfig?: Partial<BacktestStrategyConfig> // 실행 시 오버라이드할 설정
  ): Promise<BacktestRunResult> {
    const startTime = Date.now();
    // 실행 시 설정이 있으면 병합
    const currentRunConfig = {
      ...this.strategyConfig,
      ...runStrategyConfig,
      unit,
    }; // unit은 run 파라미터로 고정

    this.portfolioManager.reset(); // 각 실행마다 포트폴리오 초기화

    const csvFilePath = path.join(__dirname, csvRelativePath); // __dirname은 현재 파일 위치 기준
    await this.dataManager.loadCandlesFromCSV(market, unit, csvFilePath);
    const allCandles = this.dataManager.getAllLoadedCandles(market, unit);

    if (allCandles.length === 0) {
      throw new Error(
        `No candle data loaded for ${market} ${unit}min from ${csvFilePath}.`
      );
    }

    console.log(
      `[Backtester] Starting simulation for ${market} (${unit}min). ` +
        `Total candles: ${allCandles.length}. Config:`,
      currentRunConfig
    );

    let buySignals = 0;
    let sellSignals = 0;
    let holdSignals = 0;
    let peakBalance = this.portfolioManager.getInitialBalance();
    let maxDrawdown = 0;

    // 데이터의 첫 부분은 지표 계산을 위해 건너뛸 수 있으므로, 실제 시뮬레이션 시작 인덱스 결정
    // 예: 최소 20개 캔들은 있어야 안정적인 지표 계산이 가능하다고 가정
    const minCandlesForIndicators = Math.max(
      currentRunConfig.candleCount || 0,
      currentRunConfig.bollingerPeriod || 0,
      currentRunConfig.rsiPeriod || 0,
      20
    );
    let simulatedCandlesCount = 0;

    for (let i = 0; i < allCandles.length; i++) {
      const currentCandle = allCandles[i];
      this.portfolioManager.updateMarketPrice(
        market,
        currentCandle.trade_price
      );

      // 지표 계산에 충분한 데이터가 쌓였는지 확인 후 전략 실행
      if (i < minCandlesForIndicators - 1) {
        // console.log(`Skipping candle ${i} for indicator warmup`);
        continue;
      }
      simulatedCandlesCount++;

      const signal = await this.strategyOrchestrator.determineSignalForMarket(
        market,
        unit,
        currentRunConfig,
        i // 현재 캔들 데이터의 인덱스 (dataManager.getCandles에서 사용)
      );

      let tradeExecuted: BacktestTrade | null = null;
      let volumeToTrade = signal.volume;

      if (signal.action === "buy") {
        if (!volumeToTrade || volumeToTrade <= 0) {
          volumeToTrade = this.calculateTradeVolume(
            market,
            currentCandle.trade_price,
            "buy",
            currentRunConfig
          );
        }

        if (volumeToTrade && volumeToTrade > 0) {
          buySignals++;
          const order: BacktestOrder = {
            market,
            side: OrderSide.BID,
            ord_type: signal.price ? OrderType.LIMIT : OrderType.MARKET,
            volume: volumeToTrade.toString(),
            price: signal.price?.toString(),
            uuid: uuidv4(),
          };
          tradeExecuted = await this.orderExecutor.createOrder(
            order,
            currentCandle
          );
        }
      } else if (signal.action === "sell") {
        const currentPosition = this.portfolioManager.getPosition(market);
        if (!currentPosition || currentPosition.volume <= 0) {
          holdSignals++;
        } else {
          if (!volumeToTrade || volumeToTrade <= 0) {
            volumeToTrade = this.calculateTradeVolume(
              market,
              currentCandle.trade_price,
              "sell",
              currentRunConfig
            );
          }

          if (volumeToTrade && volumeToTrade > currentPosition.volume) {
            volumeToTrade = currentPosition.volume;
          }

          if (volumeToTrade && volumeToTrade > 0) {
            sellSignals++;
            const order: BacktestOrder = {
              market,
              side: OrderSide.ASK,
              ord_type: signal.price ? OrderType.LIMIT : OrderType.MARKET,
              volume: volumeToTrade.toString(),
              price: signal.price?.toString(),
              uuid: uuidv4(),
            };
            tradeExecuted = await this.orderExecutor.createOrder(
              order,
              currentCandle
            );
          } else {
            holdSignals++;
          }
        }
      } else {
        holdSignals++;
      }

      // MDD 계산
      const currentTotalAssetValue = this.portfolioManager.getTotalAssetValue();
      if (currentTotalAssetValue > peakBalance) {
        peakBalance = currentTotalAssetValue;
      }
      const drawdown =
        peakBalance > 0
          ? (peakBalance - currentTotalAssetValue) / peakBalance
          : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    const endTime = Date.now();
    const trades = this.portfolioManager.getTrades();
    const finalBalance = this.portfolioManager.getTotalAssetValue();
    const initialBalance = this.portfolioManager.getInitialBalance();
    const totalProfit = finalBalance - initialBalance;
    const totalProfitRate =
      initialBalance > 0 ? totalProfit / initialBalance : 0;

    let winCount = 0;
    let lossCount = 0;
    trades.forEach((trade) => {
      if (trade.profit === undefined) return; // 매수 거래 또는 손익 계산 불가 거래는 제외
      if (trade.profit > 0) winCount++;
      else if (trade.profit < 0) lossCount++;
    });
    const winRate =
      winCount + lossCount > 0 ? winCount / (winCount + lossCount) : 0;

    const result: BacktestRunResult = {
      market,
      unit,
      initialBalance,
      finalBalance,
      totalProfit,
      totalProfitRate,
      trades,
      winCount,
      lossCount,
      winRate,
      maxDrawdown,
      buySignals,
      sellSignals,
      holdSignals,
      strategyConfig: currentRunConfig,
      totalCandles: allCandles.length,
      simulatedCandles: simulatedCandlesCount,
      simulationDurationMs: endTime - startTime,
    };

    this.printResult(result);
    return result;
  }

  private printResult(result: BacktestRunResult): void {
    console.log("\n--- Backtest Result ---");
    console.log(`Market: ${result.market}, Unit: ${result.unit} min`);
    console.log(
      `Data Period: ${result.totalCandles} candles, Simulated: ${result.simulatedCandles} candles`
    );
    console.log(
      `Simulation Time: ${(result.simulationDurationMs / 1000).toFixed(2)}s`
    );
    console.log(
      `Strategy Config:`,
      JSON.stringify(result.strategyConfig, null, 2)
    );
    console.log("--- Performance ---");
    console.log(
      `Initial Balance: ${result.initialBalance.toLocaleString()} KRW`
    );
    console.log(`Final Balance: ${result.finalBalance.toLocaleString()} KRW`);
    console.log(
      `Total Profit: ${result.totalProfit.toLocaleString(undefined, {
        minimumFractionDigits: 2,
      })} KRW`
    );
    console.log(
      `Total Profit Rate: ${(result.totalProfitRate * 100).toFixed(2)}%`
    );
    console.log(
      `Max Drawdown (MDD): ${(result.maxDrawdown * 100).toFixed(2)}%`
    );
    console.log(`Total Trades: ${result.trades.length}`);
    console.log(
      `Wins: ${result.winCount}, Losses: ${result.lossCount}, Win Rate: ${(
        result.winRate * 100
      ).toFixed(2)}%`
    );
    console.log(
      `Signals: Buy=${result.buySignals}, Sell=${result.sellSignals}, Hold=${result.holdSignals}`
    );
    console.log("--- Trades Log (Last 10 or All if <10) ---");
    const tradesToShow = result.trades.slice(-10);
    if (result.trades.length > 10)
      console.log(`(Showing last 10 of ${result.trades.length} trades)`);
    tradesToShow.forEach((trade) => {
      const tradeTime = new Date(trade.timestamp).toLocaleString();
      const profitStr =
        trade.profit !== undefined
          ? trade.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })
          : "N/A";
      console.log(
        `${tradeTime} - ${trade.side.toUpperCase()} ${trade.market} | ` +
          `Vol: ${trade.volume.toFixed(6)} | Price: ${trade.price.toFixed(
            2
          )} | ` +
          `Fee: ${trade.fee.toFixed(4)} | P/L: ${profitStr}`
      );
    });
    console.log("---------------------\n");
  }
}

// --- 백테스터 실행 예제 ---
async function runBacktest() {
  console.log("Starting backtest execution...");
  const backtester = new Backtester({
    // 여기서 기본 설정을 오버라이드 하거나, run 메서드에서 오버라이드 가능
    initialBalance: 5000000, // 예: 500만원으로 시작
    feeRate: 0.0005,
    printSignalDetails: true, // 시뮬레이션 중 신호 상세 정보 출력
    rsiPeriod: 14,
    rsiOversold: 28,
    rsiOverbought: 72,
    maxTradeRatio: 0.5, // 자산의 최대 50% 거래
  });

  try {
    await backtester.run(
      "KRW-BTC",
      1, // 1분봉 데이터 사용
      "data/BTC_1min_candles.csv" // backtester.ts 파일 위치 기준 상대 경로
      // 실행 시 특정 설정을 추가로 오버라이드 할 수 있음
      // { candleCount: 100, rsiPeriod: 10 }
    );

    // 다른 마켓 또는 다른 유닛으로 추가 실행 가능
    // await backtester.run(
    //   "KRW-ETH",
    //   5,
    //   "data/ETH_5min_candles.csv",
    //   { rsiOversold: 30, rsiOverbought: 70 }
    // );
  } catch (error) {
    console.error("Backtest run failed:", error);
  }
}

// 스크립트로 직접 실행 시 아래 주석 해제
runBacktest().catch(console.error);
