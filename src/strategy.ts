import { UpbitAPI } from "./upbit-api";
import { StrategyResult } from "./types";
import { config } from "./config";

export class TradingStrategy {
  private upbitAPI: UpbitAPI;
  private positions: Map<string, { entryPrice: number; volume: number }> =
    new Map();

  constructor(upbitAPI: UpbitAPI) {
    this.upbitAPI = upbitAPI;
  }

  // 포지션 추가 메서드
  addPosition(market: string, price: number, volume: number): void {
    this.positions.set(market, { entryPrice: price, volume });
  }

  // 포지션 제거 메서드
  removePosition(market: string): void {
    this.positions.delete(market);
  }

  // 포지션 존재 여부 확인 메서드
  hasPosition(market: string): boolean {
    return this.positions.has(market);
  }

  // 포지션 정보 조회 메서드
  getPosition(market: string): { entryPrice: number; volume: number } | null {
    return this.positions.get(market) || null;
  }

  async execute(market: string): Promise<StrategyResult> {
    // 5분봉 데이터 200개 가져오기
    const candles = await this.upbitAPI.getMinuteCandles(market, 5, 200);

    if (candles.length < 20) {
      return {
        action: "hold",
        market,
        reason: "충분한 캔들 데이터가 없습니다.",
      };
    }

    // 종가 배열 생성
    const closePrices = candles.map((candle) => candle.trade_price);
    const volumes = candles.map((candle) => candle.candle_acc_trade_volume);

    // 현재 캔들에 대한 기술적 지표 계산
    const currentPrice = closePrices[0];

    // 매도 조건 확인 (포지션이 있는 경우)
    const position = this.getPosition(market);
    if (position) {
      const { entryPrice, volume } = position;
      const profitRate = (currentPrice - entryPrice) / entryPrice;

      // 익절 조건: +1.0% 이상
      if (profitRate >= 0.01) {
        this.removePosition(market);
        return {
          action: "sell",
          market,
          price: currentPrice,
          volume,
          reason: `익절 조건 충족: +${(profitRate * 100).toFixed(
            2
          )}% (매수가: ${entryPrice}, 현재가: ${currentPrice})`,
        };
      }

      // 손절 조건: -0.5% 이하
      if (profitRate <= -0.005) {
        this.removePosition(market);
        return {
          action: "sell",
          market,
          price: currentPrice,
          volume,
          reason: `손절 조건 충족: ${(profitRate * 100).toFixed(
            2
          )}% (매수가: ${entryPrice}, 현재가: ${currentPrice})`,
        };
      }

      // 아직 매도 조건이 충족되지 않은 경우
      return {
        action: "hold",
        market,
        reason: `보유 중: 수익률 ${(profitRate * 100).toFixed(
          2
        )}% (매수가: ${entryPrice}, 현재가: ${currentPrice})`,
      };
    }

    // 볼린저 밴드 계산 (기간: 20, 표준편차 배수: 2)
    const bollingerPeriod = 20;
    const bollingerStdDev = 2;
    const { upper, middle, lower, bandwidth } = this.calculateBollingerBands(
      closePrices.slice(0, bollingerPeriod),
      bollingerStdDev
    );

    // 최근 5개 캔들의 평균 밴드폭 계산 (과거 비교용)
    const recentBandwidths = [];
    for (let i = 1; i < 6; i++) {
      if (i + bollingerPeriod <= closePrices.length) {
        const { bandwidth: pastBandwidth } = this.calculateBollingerBands(
          closePrices.slice(i, i + bollingerPeriod),
          bollingerStdDev
        );
        recentBandwidths.push(pastBandwidth);
      }
    }

    const avgRecentBandwidth =
      recentBandwidths.reduce((sum, bw) => sum + bw, 0) /
      recentBandwidths.length;
    const bandwidthContraction =
      (avgRecentBandwidth - bandwidth) / avgRecentBandwidth;

    // EMA 계산 (5일, 13일)
    const ema5 = this.calculateEMA(closePrices, 5);
    const ema13 = this.calculateEMA(closePrices, 13);

    // 거래량 계산 (현재 거래량과 20개 캔들 평균 거래량 비교)
    const currentVolume = volumes[0];
    const avgVolume =
      volumes.slice(1, 21).reduce((sum, vol) => sum + vol, 0) / 20;
    const volumeRatio = currentVolume / avgVolume;

    // 상단 돌파 또는 하단 돌파 확인
    const upperBreakout = currentPrice > upper;
    const lowerBreakout = currentPrice < lower;

    // 밴드폭 축소 확인 (20% 이상)
    const bandwidthContractionThreshold = 0.2; // 20%
    const isBandwidthContracted =
      bandwidthContraction >= bandwidthContractionThreshold;

    // EMA 방향성 확인
    const emaUptrend = ema5 > ema13;
    const emaDowntrend = ema5 < ema13;

    // 거래량 증가 확인 (1.5배 이상)
    const volumeIncreaseThreshold = 1.5;
    const isVolumeIncreased = volumeRatio >= volumeIncreaseThreshold;

    // 매수 신호: 볼린저 밴드 상단 돌파 + 밴드폭 축소 + EMA 상승추세 + 거래량 증가
    if (
      upperBreakout &&
      isBandwidthContracted &&
      emaUptrend &&
      isVolumeIncreased
    ) {
      // 여기서는 임의의 수량을 설정했으나 실제로는 자금 관리 로직에 따라 계산되어야 함
      const buyVolume = 1.0; // 예시 수량

      // 매수 포지션 추가 (실제 매매 실행 시 실행 결과에 따라 처리해야 함)
      this.addPosition(market, currentPrice, buyVolume);

      return {
        action: "buy",
        market,
        price: currentPrice,
        volume: buyVolume,
        reason:
          "볼린저 밴드 상단 돌파, 밴드폭 축소(20%+), EMA 상승추세, 거래량 증가(1.5배+)",
      };
    }

    // 기본값: 관망(hold)
    return {
      action: "hold",
      market,
      reason: "매매 신호가 발생하지 않았습니다.",
    };
  }

  // 볼린저 밴드 계산 함수
  private calculateBollingerBands(prices: number[], stdDevMultiplier: number) {
    const n = prices.length;

    // 단순 이동 평균 (SMA) 계산
    const sma = prices.reduce((sum, price) => sum + price, 0) / n;

    // 표준 편차 계산
    const variance =
      prices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    // 상단 및 하단 밴드 계산
    const upper = sma + stdDev * stdDevMultiplier;
    const lower = sma - stdDev * stdDevMultiplier;

    // 밴드폭 계산 ((상단 - 하단) / 중간)
    const bandwidth = (upper - lower) / sma;

    return {
      upper,
      middle: sma,
      lower,
      bandwidth,
    };
  }

  // EMA 계산 함수
  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) {
      return prices[0];
    }

    // 가중치 계산
    const multiplier = 2 / (period + 1);

    // 초기 SMA 계산
    let ema =
      prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;

    // EMA 계산
    for (let i = period - 1; i >= 0; i--) {
      ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
  }
}
