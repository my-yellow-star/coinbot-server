import { StrategyConfig } from "../types";
import { BollingerBands } from "./indicator-calculator"; // indicator-calculator에서 BollingerBands 타입 가져오기

// 점수 계산 결과 타입
export interface ScoreOutput {
  score: number;
  reasons: string[];
  indicatorScores?: { [key: string]: number }; // 각 지표별 점수
}

// 점수 계산 가중치 타입 (StrategyConfig 내에 정의될 예정)
// export interface StrategyWeights { ... } // types.ts로 이동

export class ScoreCalculator {
  constructor() {
    // 초기화 로직 (필요시)
  }

  /**
   * 매수 경향성 점수를 계산합니다. (0-100 범위)
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
    // 기본 가중치 설정 (가중치 총합은 100)
    const defaultWeights = {
      emaGoldenCross: 20, // EMA 정배열
      bollingerBreakout: 15, // 볼린저 밴드 상단 돌파
      volumeSpike: 15, // 거래량 급증
      rsiCondition: 20, // RSI 상태
      macdCondition: 20, // MACD 상태
      synergyEffect: 10, // 시너지 효과
    };

    // 사용자 정의 가중치가 있으면 기본값에 병합
    const weights = strategyCfg.weights || {};

    // 각 지표별 점수 (0-100 범위) 및 이유 저장
    const indicatorScores: { [key: string]: number } = {};
    const reasons: string[] = [];

    // 1. EMA 정배열 점수 계산 (0-100)
    let emaScore = 0;
    if (emaShort > emaMid && emaMid > emaLong) {
      // 완벽한 정배열: emaShort > emaMid > emaLong
      const shortMidGap = (emaShort / emaMid - 1) * 100; // 단기-중기 EMA 간격 (%)
      const midLongGap = (emaMid / emaLong - 1) * 100; // 중기-장기 EMA 간격 (%)

      // 간격이 클수록 더 강한 상승 추세 (최대 100점)
      const gapBonus = Math.min(Math.max(shortMidGap + midLongGap, 0), 3) * 10; // 최대 30점 추가
      emaScore = 70 + gapBonus; // 기본 70점 + 간격 보너스

      reasons.push(
        `EMA 정배열(S:${emaShort.toFixed(0)} > M:${emaMid.toFixed(
          0
        )} > L:${emaLong.toFixed(0)})`
      );
    } else if (emaShort > emaMid || emaShort > emaLong) {
      // 부분 정배열: 일부 EMA만 정배열
      emaScore = 30;
      if (emaShort > emaMid) {
        emaScore += 20;
        reasons.push(
          `단기>중기 EMA(${emaShort.toFixed(0)} > ${emaMid.toFixed(0)})`
        );
      }
      if (emaShort > emaLong) {
        emaScore += 10;
        reasons.push(
          `단기>장기 EMA(${emaShort.toFixed(0)} > ${emaLong.toFixed(0)})`
        );
      }
    }
    indicatorScores["emaGoldenCross"] = emaScore;

    // 2. 볼린저 밴드 점수 계산 (0-100)
    let bbScore = 0;
    const bbMiddle = bollingerBands.middle;
    const bbUpper = bollingerBands.upper;
    const bbLower = bollingerBands.lower;
    const bbWidth = bollingerBands.bandwidth;

    if (currentPrice > bbUpper) {
      // 상단 돌파: 강한 상승 모멘텀
      const breakoutPercent = ((currentPrice - bbUpper) / bbUpper) * 100;
      bbScore = 80 + Math.min(breakoutPercent * 4, 20); // 돌파 정도에 따라 80-100점
      reasons.push(
        `볼린저 상단 돌파 ${breakoutPercent.toFixed(
          1
        )}% (${currentPrice.toFixed(0)} > ${bbUpper.toFixed(0)})`
      );
    } else if (currentPrice > bbMiddle) {
      // 중단-상단 사이: 상승 추세 가능성
      const positionRatio = (currentPrice - bbMiddle) / (bbUpper - bbMiddle);
      bbScore = 50 + positionRatio * 30; // 위치에 따라 50-80점
      reasons.push(
        `볼린저 상단 접근 ${(positionRatio * 100).toFixed(
          0
        )}% (${currentPrice.toFixed(0)})`
      );
    } else if (currentPrice < bbLower) {
      // 하단 아래: 과매도, 반등 가능성
      const belowPercent = ((bbLower - currentPrice) / bbLower) * 100;
      if (belowPercent > 3) {
        bbScore = 60 + Math.min(belowPercent * 3, 20); // 하단 이탈 정도에 따라 60-80점
        reasons.push(
          `볼린저 하단 이탈 ${belowPercent.toFixed(1)}% (반등 가능성)`
        );
      } else {
        bbScore = 40 + belowPercent * 6; // 약한 이탈 시 40-60점
        reasons.push(`볼린저 하단 접근 (약한 반등 가능성)`);
      }
    } else if (currentPrice < bbMiddle) {
      // 하단-중단 사이: 약한 하락 추세이나 반등 가능성
      const positionRatio = (bbMiddle - currentPrice) / (bbMiddle - bbLower);
      if (positionRatio > 0.8) {
        bbScore = 40 + positionRatio * 10; // 하단에 가까울수록 40-50점
        reasons.push(`볼린저 하단 접근 중 (${currentPrice.toFixed(0)})`);
      } else {
        bbScore = 20 + positionRatio * 20; // 중단에 가까울수록 20-40점
      }
    }
    indicatorScores["bollingerBreakout"] = bbScore;

    // 3. 거래량 점수 계산 (0-100)
    let volumeScore = 0;
    const volumeRatio = currentVolume / avgVolume;
    const volumeSpikeMultiplier = strategyCfg.volumeSpikeMultiplier || 2.0;

    if (volumeRatio >= volumeSpikeMultiplier) {
      // 거래량 급증: 강한 매수세
      volumeScore =
        80 +
        Math.min(
          ((volumeRatio - volumeSpikeMultiplier) / volumeSpikeMultiplier) * 20,
          20
        ); // 최대 100점
      reasons.push(`거래량 급증(${volumeRatio.toFixed(1)}배)`);
    } else if (volumeRatio >= 1.3) {
      // 거래량 증가: 관심 증가
      volumeScore =
        50 + ((volumeRatio - 1.3) / (volumeSpikeMultiplier - 1.3)) * 30; // 50-80점
      reasons.push(`거래량 증가(${volumeRatio.toFixed(1)}배)`);
    } else if (volumeRatio > 1) {
      // 약한 거래량 증가
      volumeScore = 30 + ((volumeRatio - 1) / 0.3) * 20; // 30-50점
    } else {
      // 거래량 감소
      volumeScore = Math.max(30 * volumeRatio, 0); // 0-30점
    }
    indicatorScores["volumeSpike"] = volumeScore;

    // 4. RSI 점수 계산 (0-100)
    let rsiScore = 0;
    const rsiOversoldThreshold = strategyCfg.rsiOversoldThreshold || 30;
    const rsiOverboughtThreshold = strategyCfg.rsiOverboughtThreshold || 70;

    if (rsi <= rsiOversoldThreshold) {
      // 과매도 상태: 강한 반등 가능성
      const oversoldDepth = rsiOversoldThreshold - rsi;
      rsiScore = 80 + Math.min(oversoldDepth * 2, 20); // 80-100점
      reasons.push(`RSI 과매도(${rsi.toFixed(1)} < ${rsiOversoldThreshold})`);
    } else if (rsi <= 40) {
      // 약한 과매도 상태: 반등 가능성
      rsiScore = 60 + ((40 - rsi) / (40 - rsiOversoldThreshold)) * 20; // 60-80점
      reasons.push(`RSI 낮음(${rsi.toFixed(1)})`);
    } else if (rsi <= 55) {
      // 중립 상태에서 상승 여력 있음
      rsiScore = 40 + ((55 - rsi) / 15) * 20; // 40-60점
      reasons.push(`RSI 중립(${rsi.toFixed(1)})`);
    } else if (rsi < rsiOverboughtThreshold) {
      // 상승 추세이나 과매수 접근 중
      rsiScore = Math.max(
        40 - ((rsi - 55) / (rsiOverboughtThreshold - 55)) * 40,
        0
      ); // 0-40점
    }
    // 과매수 상태면 0점
    indicatorScores["rsiCondition"] = rsiScore;

    // 5. MACD 점수 계산 (0-100)
    let macdScore = 0;
    if (macdResult) {
      const { macdLine, signalLine, histogram } = macdResult;

      if (macdLine > signalLine) {
        // 골든크로스 상태
        const crossStrength =
          (macdLine - signalLine) / Math.abs(signalLine || 0.001);
        macdScore = 60 + Math.min(crossStrength * 100, 40); // 60-100점
        reasons.push(
          `MACD 골든크로스(L:${macdLine.toFixed(2)} > S:${signalLine.toFixed(
            2
          )})`
        );
      } else if (macdLine > 0 && histogram > 0) {
        // MACD 양수이며 히스토그램 양수: 상승 추세
        macdScore = 50 + Math.min(histogram * 20, 10); // 50-60점
        reasons.push(`MACD 상승세(${histogram.toFixed(2)})`);
      } else if (histogram > 0) {
        // 히스토그램만 양수: 추세 전환 가능성
        macdScore = 50 + Math.min(histogram * 10, 10); // 50-60점
        reasons.push(`MACD 반등 조짐(${histogram.toFixed(2)})`);
      } else if (histogram < 0 && histogram > histogram * 1.05) {
        // 히스토그램이 감소 속도 둔화: 추세 전환 가능성
        macdScore = 30 + Math.min(Math.abs(histogram) * 10, 20); // 30-50점
        reasons.push(`MACD 하락세 둔화(${histogram.toFixed(2)})`);
      }
    }
    indicatorScores["macdCondition"] = macdScore;

    // 6. 시너지 효과 점수 계산 (0-100)
    let synergyScore = 0;
    // EMA 정배열 + 볼린저 상단 돌파 + 거래량 급증: 강력한 상승 시그널
    if (emaScore > 70 && bbScore > 70 && volumeScore > 70) {
      synergyScore = 100;
      reasons.push(
        "강력한 매수 시너지(EMA 정배열 + 볼린저 상단 돌파 + 거래량 급증)"
      );
    }
    // EMA 정배열 + RSI 낮음: 상승 추세에서의 조정, 매수 기회
    else if (emaScore > 70 && rsiScore > 70) {
      synergyScore = 90;
      reasons.push("상승 추세 속 조정(EMA 정배열 + RSI 낮음)");
    }
    // 볼린저 하단 돌파 + RSI 과매도: 강한 반등 가능성
    else if (currentPrice < bbLower && rsiScore > 80) {
      synergyScore = 85;
      reasons.push("강한 반등 가능성(볼린저 하단 돌파 + RSI 과매도)");
    }
    // MACD 골든크로스 + 거래량 증가: 추세 전환 신호
    else if (macdScore > 60 && volumeScore > 50) {
      synergyScore = 80;
      reasons.push("추세 전환 신호(MACD 골든크로스 + 거래량 증가)");
    }
    // 일부 지표만 양호한 경우
    else if (
      [emaScore, bbScore, volumeScore, rsiScore, macdScore].filter(
        (score) => score > 60
      ).length >= 2
    ) {
      synergyScore = 70;
      reasons.push("부분적 매수 신호(일부 지표 양호)");
    }
    // 대부분 지표가 중립적인 경우
    else if (
      [emaScore, bbScore, volumeScore, rsiScore, macdScore].filter(
        (score) => score > 40
      ).length >= 3
    ) {
      synergyScore = 50;
    }
    indicatorScores["synergyEffect"] = synergyScore;

    // 최종 점수 계산 (가중치 적용)
    let finalScore = 0;
    finalScore +=
      (indicatorScores["emaGoldenCross"] *
        (weights.emaGoldenCross || defaultWeights.emaGoldenCross)) /
      100;
    finalScore +=
      (indicatorScores["bollingerBreakout"] *
        (weights.bollingerBreakout || defaultWeights.bollingerBreakout)) /
      100;
    finalScore +=
      (indicatorScores["volumeSpike"] *
        (weights.volumeSpike || defaultWeights.volumeSpike)) /
      100;
    finalScore +=
      (indicatorScores["rsiCondition"] *
        (weights.rsiOversold || defaultWeights.rsiCondition)) /
      100;
    finalScore +=
      (indicatorScores["macdCondition"] *
        (weights.buyMacdGoldenCross || defaultWeights.macdCondition)) /
      100;
    finalScore +=
      (indicatorScores["synergyEffect"] *
        (weights.buySynergy || defaultWeights.synergyEffect)) /
      100;

    // 0-100 범위로 제한
    finalScore = Math.max(0, Math.min(100, finalScore));

    return {
      score: Math.round(finalScore),
      reasons,
      indicatorScores,
    };
  }

  /**
   * 매도 경향성 점수(지표 기반)를 계산합니다. (0-100 범위)
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
    // 기본 가중치 설정 (가중치 총합은 100)
    const defaultWeights = {
      rsiOverbought: 25, // RSI 과매수
      emaDeadCross: 20, // EMA 데드크로스
      bollingerBand: 15, // 볼린저 밴드 상태
      macdCondition: 20, // MACD 상태
      profitTarget: 10, // 수익률 달성
      synergyEffect: 10, // 시너지 효과
    };

    // 사용자 정의 가중치가 있으면 기본값에 병합
    const weights = strategyCfg.weights || {};

    // 각 지표별 점수 (0-100 범위) 및 이유 저장
    const indicatorScores: { [key: string]: number } = {};
    const reasons: string[] = [];

    const rsiOverboughtThreshold = strategyCfg.rsiOverboughtThreshold || 70;

    // 1. RSI 과매수 점수 계산 (0-100)
    let rsiScore = 0;
    if (rsi >= rsiOverboughtThreshold) {
      // 과매수 상태: 강한 매도 신호
      const overboughtDegree = rsi - rsiOverboughtThreshold;
      rsiScore = 70 + Math.min(overboughtDegree * 3, 30); // 70-100점
      reasons.push(`RSI 과매수(${rsi.toFixed(1)} > ${rsiOverboughtThreshold})`);
    } else if (rsi >= rsiOverboughtThreshold - 10) {
      // 과매수 접근 중: 중간 강도 매도 신호
      const approachRatio = (rsi - (rsiOverboughtThreshold - 10)) / 10;
      rsiScore = 40 + approachRatio * 30; // 40-70점
      reasons.push(`RSI 과매수 접근(${rsi.toFixed(1)})`);
    } else if (rsi >= 50) {
      // 중립 이상: 약한 매도 신호
      rsiScore = (rsi - 50) * 2; // 0-40점
    }
    indicatorScores["rsiOverbought"] = rsiScore;

    // 2. EMA 데드크로스 점수 계산 (0-100)
    let emaScore = 0;
    if (emaShort < emaMid) {
      // 데드크로스 발생: 강한 매도 신호
      const crossDepth = (emaMid / emaShort - 1) * 100; // 단기-중기 EMA 역전 정도 (%)
      emaScore = 70 + Math.min(crossDepth * 10, 30); // 70-100점
      reasons.push(
        `EMA 데드크로스(S:${emaShort.toFixed(0)} < M:${emaMid.toFixed(0)})`
      );
    } else if (emaShort < emaShort * 1.005) {
      // 데드크로스 임박: 중간 강도 매도 신호
      emaScore = 50;
      reasons.push(
        `EMA 데드크로스 임박(S:${emaShort.toFixed(0)} ≈ M:${emaMid.toFixed(0)})`
      );
    } else if (emaShort < emaShort * 1.01) {
      // 단기 EMA 상승세 둔화: 약한 매도 신호
      emaScore = 30;
      reasons.push(`EMA 상승세 둔화`);
    }
    indicatorScores["emaDeadCross"] = emaScore;

    // 3. 볼린저 밴드 상태 점수 계산 (0-100)
    let bbScore = 0;
    const bbMiddle = bollingerBands.middle;
    const bbUpper = bollingerBands.upper;

    if (currentPrice > bbUpper * 1.05) {
      // 볼린저 상단을 크게 돌파: 과열 신호
      const overExtension = (currentPrice / bbUpper - 1) * 100;
      bbScore = 80 + Math.min(overExtension, 20); // 80-100점
      reasons.push(`볼린저 상단 과도 돌파(${overExtension.toFixed(1)}%)`);
    } else if (currentPrice > bbUpper) {
      // 볼린저 상단 돌파: 매도 고려 시점
      bbScore = 60 + ((currentPrice - bbUpper) / bbUpper) * 100; // 60-80점
      reasons.push(`볼린저 상단 돌파`);
    } else if (currentPrice > bbMiddle && currentPrice > bbMiddle * 1.02) {
      // 볼린저 중단 위 & 빠른 상승: 조정 가능성
      bbScore = 40 + ((currentPrice - bbMiddle) / (bbUpper - bbMiddle)) * 20; // 40-60점
      reasons.push(`볼린저 상단 접근 중`);
    }
    indicatorScores["bollingerBand"] = bbScore;

    // 4. MACD 상태 점수 계산 (0-100)
    let macdScore = 0;
    if (macdResult) {
      const { macdLine, signalLine, histogram } = macdResult;

      if (macdLine < signalLine) {
        // 데드크로스 상태
        const crossStrength =
          (signalLine - macdLine) / Math.abs(signalLine || 0.001);
        macdScore = 70 + Math.min(crossStrength * 100, 30); // 70-100점
        reasons.push(
          `MACD 데드크로스(L:${macdLine.toFixed(2)} < S:${signalLine.toFixed(
            2
          )})`
        );
      } else if (histogram < 0 && histogram < histogram * 0.95) {
        // 히스토그램 감소 중: 모멘텀 약화
        macdScore = 50;
        reasons.push(`MACD 히스토그램 감소(${histogram.toFixed(2)})`);
      } else if (macdLine > 0 && macdLine < macdLine * 0.95) {
        // MACD 라인 하락 중: 상승세 약화
        macdScore = 40;
        reasons.push(`MACD 라인 하락 중`);
      }
    }
    indicatorScores["macdCondition"] = macdScore;

    // 5. 수익률 기반 점수 계산 (0-100)
    let profitScore = 0;
    if (currentProfitRate !== null) {
      const profitTargetPercent =
        strategyCfg.profitTargetPercentShortTerm || 3.0;

      if (currentProfitRate >= profitTargetPercent * 1.5) {
        // 목표 수익률의 150% 이상: 강한 매도 신호
        profitScore = 90;
        reasons.push(`높은 수익률 달성(${currentProfitRate.toFixed(1)}%)`);
      } else if (currentProfitRate >= profitTargetPercent) {
        // 목표 수익률 달성: 매도 고려
        profitScore = 70;
        reasons.push(`목표 수익률 달성(${currentProfitRate.toFixed(1)}%)`);
      } else if (currentProfitRate >= profitTargetPercent * 0.7) {
        // 목표 수익률의 70% 이상: 매도 검토
        profitScore = 50;
        reasons.push(`목표 수익률 접근(${currentProfitRate.toFixed(1)}%)`);
      }
    }
    indicatorScores["profitTarget"] = profitScore;

    // 6. 시너지 효과 점수 계산 (0-100)
    let synergyScore = 0;
    // RSI 과매수 + EMA 데드크로스: 강력한 매도 신호
    if (rsiScore > 70 && emaScore > 70) {
      synergyScore = 100;
      reasons.push("강력한 매도 시너지(RSI 과매수 + EMA 데드크로스)");
    }
    // RSI 과매수 + 볼린저 상단 과도 돌파: 조정 임박
    else if (rsiScore > 70 && bbScore > 80) {
      synergyScore = 90;
      reasons.push("조정 임박(RSI 과매수 + 볼린저 과열)");
    }
    // MACD 데드크로스 + EMA 데드크로스: 강한 하락 신호
    else if (macdScore > 70 && emaScore > 70) {
      synergyScore = 85;
      reasons.push("강한 하락 신호(MACD + EMA 데드크로스)");
    }
    // 높은 수익률 + 기술적 지표 악화: 차익실현 시점
    else if (
      profitScore > 70 &&
      (rsiScore > 60 || emaScore > 60 || macdScore > 60)
    ) {
      synergyScore = 80;
      reasons.push("차익실현 시점(높은 수익률 + 지표 악화)");
    }
    // 일부 지표만 나쁜 경우
    else if (
      [rsiScore, emaScore, bbScore, macdScore].filter((score) => score > 60)
        .length >= 2
    ) {
      synergyScore = 70;
      reasons.push("부분적 매도 신호(일부 지표 악화)");
    }
    indicatorScores["synergyEffect"] = synergyScore;

    // 최종 점수 계산 (가중치 적용)
    let finalScore = 0;
    finalScore +=
      (indicatorScores["rsiOverbought"] *
        (weights.rsiOverboughtSell || defaultWeights.rsiOverbought)) /
      100;
    finalScore +=
      (indicatorScores["emaDeadCross"] *
        (weights.emaDeadCrossSell || defaultWeights.emaDeadCross)) /
      100;
    finalScore +=
      (indicatorScores["bollingerBand"] *
        (weights.bollingerBreakout || defaultWeights.bollingerBand)) /
      100;
    finalScore +=
      (indicatorScores["macdCondition"] *
        (weights.sellMacdDeadCross || defaultWeights.macdCondition)) /
      100;
    finalScore +=
      (indicatorScores["profitTarget"] *
        (weights.profitTargetWeight || defaultWeights.profitTarget)) /
      100;
    finalScore +=
      (indicatorScores["synergyEffect"] *
        (weights.sellSynergyRsiEma || defaultWeights.synergyEffect)) /
      100;

    // 0-100 범위로 제한
    finalScore = Math.max(0, Math.min(100, finalScore));

    return {
      score: Math.round(finalScore),
      reasons,
      indicatorScores,
    };
  }
}
