/**
 * @interface BollingerBands
 * @description 볼린저 밴드 계산 결과 타입
 */
export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
}

/**
 * @class IndicatorCalculator
 * @description 다양한 기술적 지표(볼린저 밴드, EMA, RSI, MACD 등)를 계산합니다.
 * 이 모듈은 순수 계산 함수들로 구성됩니다.
 */
export class IndicatorCalculator {
  constructor() {
    // 초기화 로직 (필요시)
  }

  /**
   * 볼린저 밴드를 계산합니다.
   * @param prices 종가 배열 (최신 가격이 배열의 맨 앞)
   * @param period 기간 (예: 20)
   * @param stdDevMultiplier 표준편차 배수 (예: 2)
   * @returns BollingerBands 객체
   */
  calculateBollingerBands(
    prices: number[],
    period: number = 20,
    stdDevMultiplier: number = 2
  ): BollingerBands {
    if (prices.length < period) {
      // 데이터 부족 시 기본값 또는 예외 처리
      return { upper: 0, middle: 0, lower: 0, bandwidth: 0 }; // 예시 기본값
    }

    const currentPrices = prices.slice(0, period);
    const n = currentPrices.length;
    const sma = currentPrices.reduce((sum, price) => sum + price, 0) / n;
    const variance =
      currentPrices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) /
      n;
    const stdDev = Math.sqrt(variance);

    const upper = sma + stdDev * stdDevMultiplier;
    const lower = sma - stdDev * stdDevMultiplier;
    const bandwidth = sma === 0 ? 0 : (upper - lower) / sma; // sma가 0인 경우 방지

    return {
      upper,
      middle: sma,
      lower,
      bandwidth,
    };
  }

  /**
   * EMA(지수이동평균)를 계산합니다.
   * @param prices 종가 배열 (계산 방향에 따라 정렬된 상태, 예: 과거->현재 순)
   * @param period 기간 (예: 5, 13)
   * @returns EMA 값
   */
  calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) {
      return prices.length > 0 ? prices[prices.length - 1] : 0; // 최근 가격 또는 0 반환
    }

    const multiplier = 2 / (period + 1);
    let ema =
      prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period; // 초기 SMA

    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  /**
   * RSI(상대강도지수)를 계산합니다.
   * @param prices 종가 배열 (최신 가격이 배열의 맨 앞)
   * @param period 기간 (예: 14)
   * @returns RSI 값 (0-100 사이)
   */
  calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) {
      return 50; // 중립값 또는 예외 처리
    }

    // 가격 변동분 계산 (최신 데이터부터 과거로)
    const changes = [];
    for (let i = 0; i < prices.length - 1; i++) {
      changes.push(prices[i] - prices[i + 1]);
    }

    const gains = [];
    const losses = [];

    // 최근 period 기간 동안의 이익과 손실 분리
    for (let i = 0; i < period; i++) {
      const change = changes[i];
      if (change > 0) {
        gains.push(change);
        losses.push(0);
      } else {
        gains.push(0);
        losses.push(Math.abs(change));
      }
    }

    let avgGain = gains.reduce((sum, val) => sum + val, 0) / period;
    let avgLoss = losses.reduce((sum, val) => sum + val, 0) / period;

    if (avgLoss === 0) {
      return 100; // 손실이 전혀 없으면 RSI는 100
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    return rsi;
  }

  /**
   * @interface MACDResult
   * @description MACD 계산 결과 타입
   */
  calculateMACD(
    prices: number[], // 종가 배열 (최신 가격이 맨 앞)
    shortPeriod: number = 12,
    longPeriod: number = 26,
    signalPeriod: number = 9
  ): { macdLine: number; signalLine: number; histogram: number } | null {
    if (prices.length < longPeriod + signalPeriod - 1) {
      // MACD 계산에 필요한 최소 데이터 길이는 대략 (longPeriod + signalPeriod - 1)
      // EMA 계산 시 period 만큼의 데이터가 초기에 소모되고,
      // 이후 MACD 라인으로 다시 signalPeriod 만큼 EMA를 계산하기 때문
      console.warn(
        `MACD 계산을 위한 데이터가 부족합니다. 필요: ${
          longPeriod + signalPeriod - 1
        }, 현재: ${prices.length}`
      );
      return null;
    }

    // EMA 계산을 위해 가격 배열을 시간 순서대로 (과거 -> 현재)
    const reversedPrices = [...prices].reverse();

    // 1. 단기 EMA와 장기 EMA 계산
    // calculateEMA 함수는 전체 기간에 대한 EMA를 반환하므로, 마지막 값만 필요
    const emaShortValues: number[] = [];
    const emaLongValues: number[] = [];

    // EMA를 전체 기간에 대해 계산하여 배열로 만듭니다.
    // calculateEMA를 수정하여 전체 EMA 배열을 반환하거나, 여기서 루프를 돌며 계산합니다.
    // 여기서는 간단하게 전체 EMA를 계산하는 내부 함수를 가정하거나, calculateEMA가 마지막 값만 반환한다면 아래와 같이 모든 시점에 대해 호출해야 합니다.
    // 더 효율적인 방법은 calculateEMA가 전체 EMA 배열을 반환하도록 수정하는 것입니다.
    // 임시로, calculateEMA가 마지막 값만 반환한다는 가정 하에, 필요한 만큼의 EMA 값들을 생성합니다.

    // 장기 EMA 기간만큼은 MACD 값을 계산할 수 없으므로, 그 이후부터 MACD 라인 계산
    const macdLines: number[] = [];
    for (let i = 0; i < reversedPrices.length; i++) {
      // 현재 시점까지의 가격 데이터로 EMA 계산
      const currentPriceSubset = reversedPrices.slice(0, i + 1);
      const emaShort = this.calculateEMA(currentPriceSubset, shortPeriod);
      const emaLong = this.calculateEMA(currentPriceSubset, longPeriod);

      // 충분한 데이터가 쌓였을 때만 MACD 라인 값 저장
      if (currentPriceSubset.length >= longPeriod) {
        macdLines.push(emaShort - emaLong);
      }
    }

    if (macdLines.length < signalPeriod) {
      console.warn(
        `MACD Signal Line 계산을 위한 MACD Line 데이터가 부족합니다. 필요: ${signalPeriod}, 현재: ${macdLines.length}`
      );
      return null;
    }

    // 2. MACD Line의 EMA (Signal Line) 계산
    // macdLines 배열은 이미 (과거 -> 현재) 순서
    const signalLine = this.calculateEMA(macdLines, signalPeriod);

    // 3. 최신 MACD Line 값
    const lastMacdLine = macdLines[macdLines.length - 1];

    // 4. MACD Oscillator (Histogram) 계산
    const histogram = lastMacdLine - signalLine;

    return {
      macdLine: lastMacdLine,
      signalLine,
      histogram,
    };
  }
}
