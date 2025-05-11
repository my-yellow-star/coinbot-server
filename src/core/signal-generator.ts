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

  constructor(indicatorCalc: IndicatorCalculator) {
    this.indicatorCalc = indicatorCalc;
    this.scoreCalc = new ScoreCalculator();
  }

  async generateSignal(
    market: string,
    closePrices: number[], // 종가 배열 (최신 가격이 맨 앞)
    volumes: number[], // 거래량 배열 (최신 거래량이 맨 앞)
    currentPosition: Position | null, // 현재 포지션 정보
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
      // MACD 파라미터
      macdShortPeriod = 12,
      macdLongPeriod = 26,
      macdSignalPeriod = 9,
      // 분할매수 파라미터
      allowPyramiding = false,
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

      // 1. 손절 조건 (가장 우선)
      const stopLossPrice = entryPrice * (1 - stopLossPercentShortTerm / 100);
      if (currentPrice <= stopLossPrice) {
        // 분할 매수 조건 평가
        if (allowPyramiding) {
          const pyramidingSignal = this.handlePyramidingSignal(
            market,
            currentPrice,
            rsi,
            macdResult,
            currentPosition,
            strategyCfg,
            buyScoreThresholdShortTerm,
            finalScore
          );

          if (pyramidingSignal) {
            return pyramidingSignal;
          }
        }

        reason = `[단기 손절] ${stopLossPercentShortTerm}% 하락 (현재가: ${currentPrice.toFixed(
          0
        )}, 손절가: ${stopLossPrice.toFixed(0)})`;
        finalScore = 100;
        return {
          action: "sell",
          market,
          reason,
          price: currentPrice,
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
          score: finalScore,
        };
      }
    }

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

    // 매수 신호 평가
    if (buySignal.score >= buyScoreThresholdShortTerm) {
      reason = `[단기 신규매수] ${buySignal.reasons.join(", ")}`;
      finalScore = buySignal.score;
      return {
        action: "buy",
        market,
        reason,
        price: currentPrice,
        score: finalScore,
      };
    } else {
      reason = `신규매수 대기 (신호 강도: ${buySignal.score}점, 조건: ${
        buySignal.reasons.join(", ") || "특이사항 없음"
      })`;
      finalScore = buySignal.score > 0 ? buySignal.score : 0;
    }

    return { action: "hold", market, reason, score: finalScore };
  }

  /**
   * 분할 매수(Pyramiding) 신호를 처리합니다.
   * @param market 마켓 코드
   * @param currentPrice 현재 가격
   * @param rsi 현재 RSI 값
   * @param macdResult 현재 MACD 결과
   * @param currentPosition 현재 포지션
   * @param strategyCfg 전략 설정
   * @param buyScoreThresholdShortTerm 일반 단기 매수 점수 임계값
   * @param baseScore 기본 점수 (신호 강도 결정용)
   * @returns StrategyResult | null 분할매수 신호 또는 null
   */
  private handlePyramidingSignal(
    market: string,
    currentPrice: number,
    rsi: number,
    macdResult: any,
    currentPosition: Position,
    strategyCfg: StrategyConfig,
    buyScoreThresholdShortTerm: number,
    baseScore: number = 0
  ): StrategyResult | null {
    const {
      maxPyramidingCount = 2,
      pyramidingConditionDropPercent = 5,
      pyramidingRsiCondition = { below: 40 },
    } = strategyCfg;

    const currentPyramidingCount = currentPosition.pyramidingCount || 0;
    if (currentPyramidingCount >= maxPyramidingCount) {
      return null;
    }

    // 1. 가격 하락 점수 계산 (0-30점)
    let priceDropScore = 0;

    // 분할 매수 차수에 따른 하락 비율 조정
    const dropPercent =
      currentPyramidingCount === 0
        ? pyramidingConditionDropPercent
        : pyramidingConditionDropPercent * 1.5;

    const priceDropTarget =
      currentPosition.entryPrice * (1 - dropPercent / 100);

    // 목표 하락가 대비 현재 가격 위치 확인
    const priceRatio = currentPrice / currentPosition.entryPrice;
    const expectedRatio = 1 - dropPercent / 100; // 목표 하락 비율

    if (priceRatio <= expectedRatio) {
      // 목표 하락가 이상 하락했을 때 (더 많이 하락할수록 높은 점수)
      const extraDropPercent = (expectedRatio - priceRatio) * 100;
      priceDropScore = 20 + Math.min(extraDropPercent * 2, 10); // 20-30점

      // 단, 과도한 하락(15% 이상)은 오히려 감점
      if ((1 - priceRatio) * 100 > 15) {
        priceDropScore = Math.max(10, priceDropScore - 10); // 급락 시 점수 감소
      }
    } else {
      // 목표 하락가에 도달하지 않았을 때
      // 목표 대비 얼마나 근접했는지 계산 (0-20점)
      const progressToTarget =
        1 - (priceRatio - expectedRatio) / (1 - expectedRatio);
      priceDropScore = Math.max(0, Math.min(20, progressToTarget * 20));
    }

    // 2. RSI 점수 계산 (0-30점)
    let rsiScore = 0;
    const rsiBelow = pyramidingRsiCondition.below || 40;
    const rsiAbove = pyramidingRsiCondition.above;

    let pyramidingRsiMet = true; // RSI 조건 충족 여부

    if (rsiBelow && rsi >= rsiBelow) {
      pyramidingRsiMet = false;
    }
    if (rsiAbove && rsi <= rsiAbove) {
      pyramidingRsiMet = false;
    }

    if (pyramidingRsiMet) {
      if (rsiBelow) {
        // 과매도 깊이에 따른 점수 (낮을수록 높은 점수)
        if (rsi <= rsiBelow * 0.7) {
          // 극심한 과매도
          rsiScore = 30;
        } else if (rsi <= rsiBelow * 0.8) {
          // 심한 과매도
          rsiScore = 25;
        } else if (rsi <= rsiBelow * 0.9) {
          // 명확한 과매도
          rsiScore = 20;
        } else {
          // 약한 과매도
          rsiScore = 15;
        }
      }

      if (rsiAbove && !rsiBelow) {
        // above만 정의된 경우 (특수 케이스)
        rsiScore = 15;
      }
    }

    // 3. MACD 점수 계산 (0-20점)
    let macdScore = 0;
    if (macdResult) {
      const { histogram, macdLine, signalLine } = macdResult;

      if (histogram > 0) {
        // 히스토그램 양수 (상승 추세 시작 가능성)
        macdScore = 15;
      } else if (histogram > -0.5) {
        // 약한 음수 히스토그램 (반등 가능성)
        macdScore = 10;
      } else if (histogram > histogram * 0.9) {
        // 히스토그램 감소 속도 둔화 (바닥 다지기 가능성)
        macdScore = 5;
      }

      // MACD 라인과 시그널 라인이 모두 감소 중이면 약간 감점 (약세 지속)
      if (
        macdLine < 0 &&
        macdLine < macdLine * 1.05 &&
        signalLine < signalLine * 1.05
      ) {
        macdScore = Math.max(0, macdScore - 5);
      }
    }

    // 4. 추세와 거래량 점수 계산 (0-20점)
    let marketContextScore = 0;

    // 현재 나와있는 분할매수 차수에 따른 보너스/패널티
    if (currentPyramidingCount === 0) {
      // 첫 번째 분할매수
      marketContextScore += 10; // 기본 10점
    } else {
      // 두 번째 이상 분할매수 (조심스럽게 접근)
      marketContextScore += 5; // 기본 5점
    }

    // 가중치에서 추가 보너스 점수 가져오기
    marketContextScore += strategyCfg.weights?.pyramidingSignalBoost || 0;

    // 최종 분할매수 점수 계산 (0-100)
    const finalPyramidingScore = Math.min(
      100,
      priceDropScore + rsiScore + macdScore + marketContextScore
    );

    // 분할매수 임계값 (buyScoreThresholdShortTerm의 60%)보다 높으면 신호 생성
    const thresholdScore = buyScoreThresholdShortTerm * 0.6;

    if (finalPyramidingScore >= thresholdScore) {
      // 이유 문자열 구성
      const details = [];
      details.push(`가격하락: ${((1 - priceRatio) * 100).toFixed(1)}%`);
      details.push(`RSI: ${rsi.toFixed(1)}`);

      if (macdResult) {
        details.push(`MACD: ${macdResult.histogram.toFixed(2)}`);
      }

      const pyramidingReason = `[분할매수 ${
        currentPyramidingCount + 1
      }차] 점수: ${finalPyramidingScore.toFixed(0)}/100 (${details.join(
        ", "
      )})`;

      return {
        action: "buy",
        market,
        reason: pyramidingReason,
        price: currentPrice,
        score: finalPyramidingScore,
      };
    }

    return null;
  }
}
