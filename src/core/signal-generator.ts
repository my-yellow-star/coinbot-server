import { IndicatorCalculator } from "./indicator-calculator";
import { StrategyResult, Position, StrategyConfig } from "../types";
import { config } from "../config";
import { ScoreCalculator, ScoreOutput } from "./score-calculator";

// 개별 전략에 필요한 파라미터 타입 (예시) - types.ts의 GlobalStrategyConfig 사용
// export interface StrategyConfig { ... } // 기존 정의 제거 또는 GlobalStrategyConfig 사용 명시

/**
 * @class SignalGenerator
 * @description 계산된 기술적 지표와 정의된 매매 전략에 따라 매수/매도/보류 신호를 생성합니다.
 * 다양한 전략을 내부에 포함하거나, 외부에서 전략 객체를 주입받아 사용할 수 있습니다.
 */
export class SignalGenerator {
  private indicatorCalc: IndicatorCalculator;
  private scoreCalc: ScoreCalculator;
  // private activePositions: Map<string, Position>; // 현재 보유 포지션 정보 (RiskManager 또는 PortfolioManager와 연동)

  constructor(indicatorCalc: IndicatorCalculator) {
    this.indicatorCalc = indicatorCalc;
    this.scoreCalc = new ScoreCalculator();
    // this.activePositions = new Map();
  }

  /**
   * 주어진 시장 데이터와 전략 설정을 바탕으로 매매 신호를 생성합니다.
   * @param market 마켓 코드 (예: "KRW-BTC")
   * @param candles 최신 캔들 데이터 (종가 배열 등)
   * @param currentPosition 현재 해당 마켓의 포지션 정보 (RiskManager로부터 받음)
   * @param strategyCfg 특정 전략에 사용될 파라미터
   * @returns StrategyResult 매매 신호 결과
   */
  async generateSignal(
    market: string,
    closePrices: number[], // 종가 배열 (최신 가격이 맨 앞)
    volumes: number[], // 거래량 배열 (최신 거래량이 맨 앞)
    currentPosition: Position | null, // 현재 포지션 정보
    // strategyCfg 타입을 GlobalStrategyConfig로 변경
    strategyCfgInput: StrategyConfig = {}
  ): Promise<StrategyResult> {
    const strategyCfg: StrategyConfig = {
      ...config.trading.defaultStrategyConfig,
      ...strategyCfgInput,
      weights: {
        ...config.trading.defaultStrategyConfig.weights,
        ...(strategyCfgInput.weights || {}),
      },
    };

    // 파라미터 추출 (기본값 포함)
    const {
      bollingerPeriod = 20,
      bollingerStdDev = 2,
      emaShortPeriod = 5,
      emaMidPeriod = 10,
      emaLongPeriod = 20,
      rsiPeriod = 14,
      buyScoreThresholdShortTerm = 80,
      stopLossPercentShortTerm = 1.5,
      profitTargetPercentShortTerm = 3.0,
      sellScoreThresholdShortTerm = 75, // 매도 결정 임계값 (지표 기반)
    } = strategyCfg;

    if (
      closePrices.length <
      Math.max(bollingerPeriod, emaLongPeriod, rsiPeriod + 1)
    ) {
      return { action: "hold", market, reason: "데이터 부족", score: 0 };
    }

    const currentPrice = closePrices[0];

    // 1. 지표 계산
    const bollingerBands = this.indicatorCalc.calculateBollingerBands(
      closePrices,
      bollingerPeriod,
      bollingerStdDev
    );

    const reversedPrices = [...closePrices].reverse();
    const emaShort = this.indicatorCalc.calculateEMA(
      reversedPrices,
      emaShortPeriod
    );
    const emaMid = this.indicatorCalc.calculateEMA(
      reversedPrices,
      emaMidPeriod
    ); // 중기 EMA 계산
    const emaLong = this.indicatorCalc.calculateEMA(
      reversedPrices,
      emaLongPeriod
    );

    const rsi = this.indicatorCalc.calculateRSI(closePrices, rsiPeriod);

    const currentVolume = volumes[0];
    const avgVolume =
      volumes
        .slice(1, bollingerPeriod + 1) // 거래량 평균은 볼린저 기간 사용
        .reduce((sum, vol) => sum + vol, 0) / bollingerPeriod;

    let reason = "기본 관망";
    let finalScore = 0;

    // --- 매도 (청산) 조건 우선 평가 (포지션 보유 시) ---
    if (currentPosition && currentPosition.volume > 0) {
      const entryPrice = currentPosition.entryPrice;
      const currentProfitRate = (currentPrice / entryPrice - 1) * 100;

      // 1. 손절 조건 (가장 우선)
      const stopLossPrice = entryPrice * (1 - stopLossPercentShortTerm / 100);
      if (currentPrice <= stopLossPrice) {
        reason = `[단기 손절] ${stopLossPercentShortTerm}% 하락 (현재가: ${currentPrice.toFixed(
          0
        )}, 손절가: ${stopLossPrice.toFixed(0)})`;
        finalScore = 100;
        return {
          action: "sell",
          market,
          reason,
          price: currentPrice,
          volume: currentPosition.volume,
          score: finalScore,
        };
      }

      // 2. 익절 조건 (1차 목표)
      const profitTargetPrice =
        entryPrice * (1 + profitTargetPercentShortTerm / 100);
      if (currentPrice >= profitTargetPrice) {
        reason = `[단기 익절] ${profitTargetPercentShortTerm}% 상승 (현재가: ${currentPrice.toFixed(
          0
        )}, 목표가: ${profitTargetPrice.toFixed(0)})`;
        finalScore = 95; // 손절보다는 낮지만 높은 점수
        return {
          action: "sell",
          market,
          reason,
          price: currentPrice,
          volume: currentPosition.volume,
          score: finalScore,
        };
      }

      // 3. 지표 기반 매도 압력 점수 계산
      const sellPressure: ScoreOutput =
        this.scoreCalc.calculateSellPressureScore(
          currentPrice,
          bollingerBands,
          emaShort,
          emaMid,
          rsi,
          strategyCfg,
          currentProfitRate
        );

      if (sellPressure.score >= sellScoreThresholdShortTerm) {
        reason = `[지표 매도] ${sellPressure.reasons.join(
          ", "
        )}. 수익률: ${currentProfitRate.toFixed(1)}%`;
        finalScore = sellPressure.score;
        return {
          action: "sell",
          market,
          reason,
          price: currentPrice,
          volume: currentPosition.volume,
          score: finalScore,
        };
      }

      // 모든 매도 조건 미해당 시 보유 이유 업데이트
      reason = `보유 중 (수익률 ${currentProfitRate.toFixed(
        1
      )}%), 매도 신호 약함(${sellPressure.score}점: ${
        sellPressure.reasons.join(", ") || "특이사항 없음"
      })`;
      finalScore = Math.max(
        0,
        sellPressure.score > 0 ? sellPressure.score : 30
      ); // 매도 압력이 조금이라도 있으면 반영, 아니면 기본 보유 점수
    }
    // --- 매수 조건 평가 (포지션 미보유 시) ---
    else {
      // currentPosition이 없거나 volume이 0인 경우
      const buySignal: ScoreOutput = this.scoreCalc.calculateBuyScore(
        currentPrice,
        bollingerBands,
        emaShort,
        emaMid,
        emaLong,
        rsi,
        currentVolume,
        avgVolume,
        strategyCfg
      );

      if (buySignal.score >= buyScoreThresholdShortTerm) {
        reason = `[단기 매수] ${buySignal.reasons.join(", ")}`;
        finalScore = buySignal.score;
        return {
          action: "buy",
          market,
          reason,
          price: currentPrice,
          score: finalScore,
        };
      } else {
        reason = `매수 대기 (신호 강도: ${buySignal.score}점, 조건: ${
          buySignal.reasons.join(", ") || "특이사항 없음"
        })`;
        finalScore = buySignal.score > 0 ? buySignal.score : 0;
      }
    }

    return { action: "hold", market, reason, score: finalScore };
  }

  // 여기에 다양한 전략 메서드를 추가하거나, 전략 패턴을 사용하여 확장 가능
  // private bollingerBreakoutStrategy(...) : StrategyResult { ... }
  // private rsiDivergenceStrategy(...) : StrategyResult { ... }
}
