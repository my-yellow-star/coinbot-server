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
      // 분할매수 RSI 조건 같은 객체 내부 값도 병합되도록 명시적 처리 (필요시)
      pyramidingRsiCondition: {
        ...config.trading.defaultStrategyConfig.pyramidingRsiCondition,
        ...(strategyCfgInput.pyramidingRsiCondition || {}),
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
      // MACD 파라미터
      macdShortPeriod = 12,
      macdLongPeriod = 26,
      macdSignalPeriod = 9,
      // 분할매수 파라미터
      allowPyramiding = false,
      maxPyramidingCount = 2,
      pyramidingConditionDropPercent = 5,
      pyramidingRsiCondition = { below: 40 },
      pyramidingOrderSizeRatio = 1.0,
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

    // MACD 계산
    const macdResult = this.indicatorCalc.calculateMACD(
      closePrices, // 최신 가격이 맨 앞인 배열 전달
      macdShortPeriod,
      macdLongPeriod,
      macdSignalPeriod
    );

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
          currentProfitRate,
          macdResult // MACD 결과 전달
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

      // === 분할 매수 로직 ===
      if (allowPyramiding) {
        const currentPyramidingCount = currentPosition.pyramidingCount || 0;
        if (currentPyramidingCount < maxPyramidingCount) {
          const priceDropTarget =
            currentPosition.entryPrice *
            (1 - pyramidingConditionDropPercent / 100);
          let pyramidingRsiMet = true; // RSI 조건 기본 충족으로 가정
          if (
            pyramidingRsiCondition.below &&
            rsi >= pyramidingRsiCondition.below
          ) {
            pyramidingRsiMet = false;
          }
          if (
            pyramidingRsiCondition.above &&
            rsi <= pyramidingRsiCondition.above
          ) {
            pyramidingRsiMet = false;
          }

          if (currentPrice <= priceDropTarget && pyramidingRsiMet) {
            let pyramidingScore =
              strategyCfg.weights?.pyramidingSignalBoost || 0;
            // 추가적인 분할매수 점수 로직 (예: MACD 상태 등)
            if (macdResult && macdResult.histogram > -0.5) {
              // 히스토그램이 너무 부정적이지 않을때 (예시)
              pyramidingScore += 15;
            }
            if (rsi < (pyramidingRsiCondition.below || 30) + 5) {
              // RSI가 타겟보다 조금 더 낮으면 가점
              pyramidingScore += 10;
            }

            // 분할매수 점수가 기존 매수 임계값의 일부를 넘거나, 특정 점수 이상일때만 실행 (과도한 물타기 방지)
            if (pyramidingScore >= buyScoreThresholdShortTerm * 0.6) {
              // 예: 일반 매수 점수의 60%
              const pyramidingReason = `[분할매수 ${
                currentPyramidingCount + 1
              }차] 가격 ${pyramidingConditionDropPercent}% 하락 (목표가: ${priceDropTarget.toFixed(
                0
              )}, 현재가: ${currentPrice.toFixed(0)}), RSI: ${rsi.toFixed(1)}`;
              // 분할매수시 주문량 결정: 여기서는 첫 주문량의 N 배율로 가정. TradingBot에서 실제 주문량 계산.
              // SignalGenerator는 신호와 추천 가격/점수만 제공.
              return {
                action: "buy",
                market,
                reason: pyramidingReason,
                price: currentPrice, // 현재가로 즉시 체결 가정 또는 약간 유리한 지정가
                score: finalScore + pyramidingScore, // 기존 점수에 분할매수 점수 가산
                // volume: 여기서 직접 지정하기보다 TradingBot에서 결정. (예: initialOrderAmount * pyramidingOrderSizeRatio)
              };
            }
          }
        }
      }

      // 모든 매도 조건 미해당 시 보유 이유 업데이트
      reason = `보유 중 (수익률 ${currentProfitRate.toFixed(
        1
      )}%), 매도 신호 약함(${sellPressure.score}점: ${
        sellPressure.reasons.join(", ") || "특이사항 없음"
      })`;
      finalScore = Math.max(
        0,
        sellPressure.score > 0 ? sellPressure.score : 30,
        macdResult && macdResult.histogram < 0 ? 20 : 0 // MACD 히스토그램 음수면 최소 보유 점수 약간 더 부여 (예시)
      ); // 매도 압력이 조금이라도 있으면 반영, 아니면 기본 보유 점수
    }
    // --- 매수 조건 평가 (포지션 미보유 또는 분할 매수) ---
    else {
      // 1. 일반 신규 매수 조건 평가
      const buySignal: ScoreOutput = this.scoreCalc.calculateBuyScore(
        currentPrice,
        bollingerBands,
        emaShort,
        emaMid,
        emaLong,
        rsi,
        currentVolume,
        avgVolume,
        strategyCfg,
        macdResult // MACD 결과 전달
      );

      if (buySignal.score >= buyScoreThresholdShortTerm) {
        reason = `[단기 신규매수] ${buySignal.reasons.join(", ")}`;
        finalScore = buySignal.score;
        return {
          action: "buy",
          market,
          reason,
          price: currentPrice,
          score: finalScore,
          // volume: 기본 주문량 (TradingBot에서 결정)
        };
      } else {
        reason = `신규매수 대기 (신호 강도: ${buySignal.score}점, 조건: ${
          buySignal.reasons.join(", ") || "특이사항 없음"
        })`;
        finalScore = buySignal.score > 0 ? buySignal.score : 0;
      }

      // 2. 분할 매수 (Pyramiding / Averaging Down) 조건 평가
      //    - 현재 포지션이 있고 (currentPosition), 첫 매수가 아님을 의미 (위의 else 블록)
      //    - allowPyramiding 설정이 true일 때
      //    - 주의: 이 로직은 currentPosition이 null일 때는 실행되지 않음. currentPosition이 있지만 volume이 0인 경우도 고려 필요.
      //          SignalGenerator의 현재 구조상, 포지션은 있으나 volume=0이면 위에서 걸러지지 않으므로 여기서 체크 가능.
      //          하지만 명확성을 위해, 이 로직은 currentPosition이 실제로 존재하고, 첫번째 매수가 아닌 '추가' 매수 상황을 가정.
      //          첫 매수는 위의 buySignal.score >= buyScoreThresholdShortTerm 로직으로 처리.
      //          따라서, 분할매수는 이미 포지션이 있는 상태(currentPosition != null && currentPosition.volume > 0)에서,
      //          매도 조건은 만족하지 않았지만, 특정 조건 하에 추가 매수를 고려하는 경우로 재정의 필요.
      //          현재 코드는 else 블록에 있으므로, currentPosition이 없거나(신규매수 시도) 또는 currentPosition.volume <= 0 인 경우임.
      //          분할 매수 로직은 currentPosition && currentPosition.volume > 0 인 블록의 hold 시나리오에서 파생되어야 함.
      //          일단은 이 위치에서 포지션 없는 상태에서의 분할매수는 말이 안되므로, 신규 매수 실패 후 로직으로만 남김.
    }

    return { action: "hold", market, reason, score: finalScore };
  }

  // 여기에 다양한 전략 메서드를 추가하거나, 전략 패턴을 사용하여 확장 가능
  // private bollingerBreakoutStrategy(...) : StrategyResult { ... }
  // private rsiDivergenceStrategy(...) : StrategyResult { ... }
}
