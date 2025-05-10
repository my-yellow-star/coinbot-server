import { StrategyConfig } from "../types";
import { BollingerBands } from "./indicator-calculator"; // indicator-calculator에서 BollingerBands 타입 가져오기

// 점수 계산 결과 타입
export interface ScoreOutput {
  score: number;
  reasons: string[];
}

// 점수 계산 가중치 타입 (StrategyConfig 내에 정의될 예정)
// export interface StrategyWeights { ... } // types.ts로 이동

export class ScoreCalculator {
  constructor() {
    // 초기화 로직 (필요시)
  }

  /**
   * 매수 경향성 점수를 계산합니다.
   * @param currentPrice 현재 가격
   * @param bollingerBands 볼린저 밴드 객체
   * @param emaShort 단기 EMA
   * @param emaMid 중기 EMA
   * @param emaLong 장기 EMA
   * @param rsi RSI 값
   * @param currentVolume 현재 거래량
   * @param avgVolume 평균 거래량
   * @param strategyCfg 전략 설정 객체
   * @param macdResult MACD 결과
   * @returns ScoreOutput 점수와 판단 근거
   */
  public calculateBuyScore(
    currentPrice: number,
    bollingerBands: BollingerBands,
    emaShort: number,
    emaMid: number,
    emaLong: number,
    rsi: number,
    currentVolume: number,
    avgVolume: number,
    strategyCfg: StrategyConfig,
    macdResult: {
      macdLine: number;
      signalLine: number;
      histogram: number;
    } | null
  ): ScoreOutput {
    let score = 0;
    const reasons: string[] = [];
    const weights = strategyCfg.weights || {};

    // EMA 정배열 조건
    const isEmaGoldenCross = emaShort > emaMid && emaMid > emaLong;
    if (isEmaGoldenCross) {
      score += weights.emaGoldenCross || 30;
      reasons.push(
        `EMA 정배열(S:${emaShort.toFixed(0)} > M:${emaMid.toFixed(
          0
        )} > L:${emaLong.toFixed(0)})`
      );
    }

    // 볼린저 밴드 상단 돌파 조건
    const isBollingerUpperBreakout = currentPrice > bollingerBands.upper;
    if (isBollingerUpperBreakout) {
      score += weights.bollingerBreakout || 30;
      reasons.push(
        `볼린저 상단 돌파(${currentPrice.toFixed(
          0
        )} > ${bollingerBands.upper.toFixed(0)})`
      );
    }

    // 거래량 급증 조건
    const volumeSpikeMultiplier = strategyCfg.volumeSpikeMultiplier || 2.0;
    const isVolumeSpike = currentVolume > avgVolume * volumeSpikeMultiplier;
    if (isVolumeSpike) {
      score += weights.volumeSpike || 25;
      reasons.push(`거래량 급증(${(currentVolume / avgVolume).toFixed(1)}배)`);
    }

    // RSI 조건
    const rsiOversoldThreshold = strategyCfg.rsiOversoldThreshold || 30;
    const rsiOverboughtThreshold = strategyCfg.rsiOverboughtThreshold || 70;
    if (rsi < rsiOversoldThreshold) {
      score += weights.rsiOversold || 20;
      reasons.push(`RSI 과매도(${rsi.toFixed(1)} < ${rsiOversoldThreshold})`);
    } else if (rsi < rsiOverboughtThreshold - 10) {
      // 예: RSI < 60 (과매수 바로 직전이 아닌, 상승 여력 있는 상태)
      score += weights.rsiNeutral || 10;
      reasons.push(`RSI 적정(${rsi.toFixed(1)})`);
    }

    // 시너지 효과: EMA 정배열 + 볼린저 돌파 + 거래량 급증
    if (isEmaGoldenCross && isBollingerUpperBreakout && isVolumeSpike) {
      score += weights.buySynergy || 15;
      reasons.push("주요 매수 조건 동시 충족(시너지)");
    }

    // MACD 조건 (매수)
    if (macdResult) {
      const { macdLine, signalLine, histogram } = macdResult;
      // MACD 골든 크로스
      if (macdLine > signalLine) {
        score += weights.buyMacdGoldenCross || 0;
        reasons.push(
          `MACD 골든크로스(L:${macdLine.toFixed(2)} > S:${signalLine.toFixed(
            2
          )})`
        );
      }
      // MACD 히스토그램 양수
      if (histogram > 0) {
        score += weights.buyMacdHistogramPositive || 0;
        reasons.push(`MACD 오실레이터 양수(${histogram.toFixed(2)})`);
      }
    }

    return { score, reasons };
  }

  /**
   * 매도 경향성 점수(지표 기반)를 계산합니다.
   * (손절 및 목표가 익절은 SignalGenerator에서 별도 처리)
   */
  public calculateSellPressureScore(
    currentPrice: number,
    bollingerBands: BollingerBands,
    emaShort: number,
    emaMid: number,
    rsi: number,
    strategyCfg: StrategyConfig,
    currentProfitRate: number | null, // 수익률 (정보 제공용)
    macdResult: {
      macdLine: number;
      signalLine: number;
      histogram: number;
    } | null // MACD 결과 추가
  ): ScoreOutput {
    let score = 0;
    const reasons: string[] = [];
    const weights = strategyCfg.weights || {};
    const rsiOverboughtThreshold = strategyCfg.rsiOverboughtThreshold || 70;

    // RSI 과매수 조건
    if (rsi > rsiOverboughtThreshold) {
      score = weights.rsiOverboughtSell || 60;
      reasons.push(`RSI 과매수(${rsi.toFixed(1)} > ${rsiOverboughtThreshold})`);
    }

    // EMA 데드크로스 (단기 < 중기)
    const isEmaDeadCross = emaShort < emaMid;
    if (isEmaDeadCross) {
      score = Math.max(score, weights.emaDeadCrossSell || 50);
      reasons.push(
        `EMA 데드크로스(S:${emaShort.toFixed(0)} < M:${emaMid.toFixed(0)})`
      );
    }

    // 시너지: RSI 과매수 + EMA 데드크로스
    if (rsi > rsiOverboughtThreshold && isEmaDeadCross) {
      score = Math.max(score, weights.sellSynergyRsiEma || 85);
      if (!reasons.includes("RSI 과매수 + EMA 데드크로스 시너지")) {
        reasons.push("RSI 과매수 + EMA 데드크로스 시너지");
      }
    }

    // 시너지: EMA 데드크로스 + 볼린저밴드 중단 하회
    if (isEmaDeadCross && currentPrice < bollingerBands.middle) {
      let tempScore = weights.sellSynergyEmaBbMiddle || 80;
      // RSI도 과매수 상태면 매도 압력 가중
      if (rsi > rsiOverboughtThreshold) {
        tempScore += 10; // 예시 가산점
      }
      score = Math.max(score, tempScore);
      if (!reasons.includes("EMA 데드크로스 + BB중단 하회 시너지")) {
        reasons.push(
          `EMA 데드크로스 + BB중단 하회 (현재가:${currentPrice.toFixed(
            0
          )}, BB중단:${bollingerBands.middle.toFixed(0)})`
        );
      }
    }

    if (
      currentProfitRate !== null &&
      currentProfitRate > (strategyCfg.profitTargetPercentShortTerm || 3.0) &&
      score > 70
    ) {
      reasons.push(
        `높은 수익률(${currentProfitRate.toFixed(1)}%) 매도 압력 지지`
      );
      score += 5; // 높은 수익률 상태에서 매도 신호 발생 시 점수 소폭 가산
    }

    // MACD 조건 (매도)
    if (macdResult) {
      const { macdLine, signalLine, histogram } = macdResult;
      // MACD 데드 크로스
      if (macdLine < signalLine) {
        score = Math.max(score, weights.sellMacdDeadCross || 0); // 기존 점수와 비교하여 더 큰 값 사용
        reasons.push(
          `MACD 데드크로스(L:${macdLine.toFixed(2)} < S:${signalLine.toFixed(
            2
          )})`
        );
      }
      // MACD 히스토그램 음수
      if (histogram < 0) {
        score = Math.max(score, weights.sellMacdHistogramNegative || 0);
        reasons.push(`MACD 오실레이터 음수(${histogram.toFixed(2)})`);
      }

      // 시너지: RSI 과매수 + MACD 데드크로스
      if (rsi > rsiOverboughtThreshold && macdLine < signalLine) {
        score = Math.max(score, (weights.sellSynergyRsiEma || 0) + 10); // 기존 시너지 가중치에 추가 가점 (예시)
        if (!reasons.includes("RSI 과매수 + MACD 데드크로스 시너지")) {
          reasons.push("RSI 과매수 + MACD 데드크로스 시너지");
        }
      }
    }

    return { score, reasons };
  }
}
