import { UpbitAPI } from "./upbit-api";
import { StrategyResult } from "./types";
import { config } from "./config";

export class TradingStrategy {
  private upbitAPI: UpbitAPI;
  private positions: Map<string, { entryPrice: number; volume: number }> =
    new Map();
  private readonly FEE_RATE = 0.0005; // 업비트 수수료 0.05%
  private readonly SLIPPAGE_RATE = 0.0001; // 슬리피지 0.01%
  private readonly RISK_PERCENTAGE = 0.05; // 계좌 잔액의 5% 사용

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
    try {
      // 5분봉 데이터 200개 가져오기
      const candles = await this.upbitAPI.getMinuteCandles(market, 5, 200);

      if (candles.length < 20) {
        return {
          action: "hold",
          market,
          price: 0,
          volume: 0,
          reason: "충분한 캔들 데이터가 없습니다.",
        };
      }

      // 종가 배열 생성
      const closePrices = candles.map((candle) => candle.trade_price);
      const volumes = candles.map((candle) => candle.candle_acc_trade_volume);

      // 현재 캔들에 대한 기술적 지표 계산
      const currentPrice = closePrices[0];

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

      // EMA 계산 (5일, 13일) - 역순 처리하여 과거→현재 방향으로 계산
      const reversedPrices = [...closePrices].reverse();
      const ema5 = this.calculateEMA(reversedPrices, 5);
      const ema13 = this.calculateEMA(reversedPrices, 13);

      // 거래량 계산 (현재 거래량과 20개 캔들 평균 거래량 비교)
      const currentVolume = volumes[0];
      const avgVolume =
        volumes.slice(1, 21).reduce((sum, vol) => sum + vol, 0) / 20;
      const volumeRatio = currentVolume / avgVolume;

      // 상단 돌파 또는 하단 돌파 확인
      const upperBreakout = currentPrice > upper;
      const lowerBreakout = currentPrice < lower;

      // 밴드폭 축소 확인 (15% 이상으로 완화)
      const bandwidthContractionThreshold = 0.15; // 기존 20%에서 15%로 완화
      const isBandwidthContracted =
        bandwidthContraction >= bandwidthContractionThreshold;

      // EMA 방향성 확인
      const emaUptrend = ema5 > ema13;
      const emaDowntrend = ema5 < ema13;

      // 거래량 증가 확인 (1.3배 이상으로 완화)
      const volumeIncreaseThreshold = 1.3; // 기존 1.5에서 1.3으로 완화
      const isVolumeIncreased = volumeRatio >= volumeIncreaseThreshold;

      // 조건 로그 출력 (디버깅용)
      if (config.trading.printStrategy) {
        console.log(`[${market}] 전략 조건 확인:`);
        console.log(
          `  ↑ 볼린저 상단 돌파: ${
            upperBreakout ? "✅" : "❌"
          } (현재가: ${currentPrice}, 밴드 상단: ${upper.toFixed(2)})`
        );
        console.log(
          `  ↓ 밴드폭 축소(${bandwidthContractionThreshold * 100}%+): ${
            isBandwidthContracted ? "✅" : "❌"
          } (${(bandwidthContraction * 100).toFixed(2)}%)`
        );
        console.log(
          `  ↑ EMA 상승추세: ${emaUptrend ? "✅" : "❌"} (EMA5: ${ema5.toFixed(
            2
          )}, EMA13: ${ema13.toFixed(2)})`
        );
        console.log(
          `  ↑ 거래량 증가(${volumeIncreaseThreshold}배+): ${
            isVolumeIncreased ? "✅" : "❌"
          } (${volumeRatio.toFixed(2)}배)`
        );
      }

      // 매수 신호: 조건 완화 - 여러 시나리오 추가 (OR 조건)
      // 시나리오 1: 볼린저 상단 돌파 + EMA 상승추세 + 거래량 증가
      // 시나리오 2: 볼린저 상단 돌파 + 밴드폭 축소 + EMA 상승추세
      // 시나리오 3: 볼린저 상단 근처(95% 이상) + 모든 조건 충족
      const nearUpperBand = currentPrice > upper * 0.95;

      const buyScore = this.calculateBuyScore(
        currentPrice,
        upper,
        bandwidthContraction,
        ema5,
        ema13,
        currentVolume,
        avgVolume
      );

      console.log(`[${market}] 매수 점수: ${buyScore.toFixed(2)}`);

      if (
        (upperBreakout && emaUptrend && isVolumeIncreased) ||
        (upperBreakout && isBandwidthContracted && emaUptrend) ||
        (nearUpperBand &&
          isBandwidthContracted &&
          emaUptrend &&
          isVolumeIncreased)
      ) {
        // 계좌 잔액의 일부를 사용 (리스크 관리)
        const riskPercentage = this.RISK_PERCENTAGE;

        // 슬리피지 고려 (마진)
        const slippageAdjustedPrice = currentPrice * (1 + this.SLIPPAGE_RATE);

        // 매수 수량을 예측하기 위한 값만 계산
        const buyVolume = Number(
          (
            (config.trading.tradeAmount * riskPercentage) /
            slippageAdjustedPrice
          ).toFixed(8)
        );

        let buyReason = "";
        if (upperBreakout && emaUptrend && isVolumeIncreased) {
          buyReason =
            "시나리오 1: 볼린저 상단 돌파 + EMA 상승추세 + 거래량 증가";
        } else if (upperBreakout && isBandwidthContracted && emaUptrend) {
          buyReason =
            "시나리오 2: 볼린저 상단 돌파 + 밴드폭 축소 + EMA 상승추세";
        } else {
          buyReason = "시나리오 3: 볼린저 상단 근처 + 모든 조건 충족";
        }

        // 이 부분에서는 실제 주문을 생성하지 않고, 매수 포지션만 미리 추가
        // (최종 주문은 server.ts에서 실행)
        this.addPosition(market, slippageAdjustedPrice, buyVolume);

        return {
          action: "buy",
          market,
          price: slippageAdjustedPrice,
          volume: buyVolume,
          reason: buyReason,
        };
      }

      // 추가: 볼린저 밴드 하단 지지 매수 전략 (추가 시나리오)
      if (lowerBreakout && emaUptrend && isVolumeIncreased) {
        // 하단 지지 매수 신호
        const slippageAdjustedPrice = currentPrice * (1 + this.SLIPPAGE_RATE);
        const buyVolume = 1.0; // 예시 수량

        this.addPosition(market, slippageAdjustedPrice, buyVolume);

        return {
          action: "buy",
          market,
          price: slippageAdjustedPrice,
          volume: buyVolume,
          reason:
            "시나리오 4: 볼린저 하단 돌파 + EMA 상승추세 + 거래량 증가 (지지선 매수)",
        };
      }

      // 매도 조건 확인 (포지션이 있는 경우)
      const position = this.getPosition(market);
      if (position) {
        const { entryPrice, volume } = position;
        const profitRate = (currentPrice - entryPrice) / entryPrice;

        // 익절 조건: +1.0% 이상 (수수료 고려)
        if (profitRate >= 0.01 + this.FEE_RATE * 2) {
          this.removePosition(market);
          return {
            action: "sell",
            market,
            price: currentPrice,
            volume,
            reason: `익절 조건 충족: +${(profitRate * 100).toFixed(
              2
            )}% (매수가: ${entryPrice}, 현재가: ${currentPrice}, 수수료 고려)`,
          };
        }

        // 손절 조건: -0.5% 이하 (수수료 고려)
        if (profitRate <= -0.005 - this.FEE_RATE) {
          this.removePosition(market);
          return {
            action: "sell",
            market,
            price: currentPrice,
            volume,
            reason: `손절 조건 충족: ${(profitRate * 100).toFixed(
              2
            )}% (매수가: ${entryPrice}, 현재가: ${currentPrice}, 수수료 고려)`,
          };
        }

        // 아직 매도 조건이 충족되지 않은 경우
        return {
          action: "hold",
          market,
          price: 0,
          volume: 0,
          reason: `보유 중: 수익률 ${(profitRate * 100).toFixed(
            2
          )}% (매수가: ${entryPrice}, 현재가: ${currentPrice})`,
        };
      }

      // 기본값: 관망(hold)
      return {
        action: "hold",
        market,
        price: 0,
        volume: 0,
        reason: "매매 신호가 발생하지 않았습니다.",
      };
    } catch (error) {
      console.error("전략 실행 중 오류 발생:", error);
      return {
        action: "hold",
        market,
        price: 0,
        volume: 0,
        reason: `전략 실행 오류: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
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

  // EMA 계산 함수 - 개선된 버전 (과거→현재 방향으로 계산)
  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) {
      return prices[0];
    }

    // 가중치 계산
    const multiplier = 2 / (period + 1);

    // 초기 SMA 계산 (과거 데이터로부터)
    let ema =
      prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;

    // EMA 계산 (과거→현재 방향으로 진행)
    // 이미 배열이 reversed 되어서 들어오므로, 여기서는 앞에서부터 계산
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  // 계정 잔액 조회
  async getAccountBalance(currency: string = "KRW"): Promise<number> {
    try {
      const accounts = await this.upbitAPI.getAccounts();
      const account = accounts.find((acc) => acc.currency === currency);
      return account ? parseFloat(account.balance) : 0;
    } catch (error) {
      console.error("계정 잔액 조회 실패:", error);
      return 0;
    }
  }

  // 보유 자산의 현재 수익률 계산
  async getCurrentProfitRate(market: string): Promise<number | null> {
    const position = this.getPosition(market);
    if (!position) return null;

    try {
      const ticker = await this.upbitAPI.getTicker(market);
      if (!ticker || ticker.length === 0) return null;

      const currentPrice = ticker[0].trade_price;
      const { entryPrice } = position;

      // 수수료 반영한 수익률 계산
      return currentPrice / entryPrice - 1 - this.FEE_RATE * 2;
    } catch (error) {
      console.error("현재 수익률 계산 실패:", error);
      return null;
    }
  }

  calculateBuyScore(
    currentPrice: number,
    upper: number,
    bandwidthContraction: number,
    ema5: number,
    ema13: number,
    currentVolume: number,
    avgVolume: number
  ): number {
    const upperDiff = currentPrice - upper;
    const upperBreakoutRatio = Math.max(0, upperDiff / upper);
    const upperScore = Math.min(30, upperBreakoutRatio * 100);

    const bandwidthContractionPercent = Math.max(0, bandwidthContraction * 100);
    const bandwidthScore = Math.min(
      20,
      (bandwidthContractionPercent / 20) * 20
    );

    const emaDiff = ema5 - ema13;
    const emaDiffRatio = Math.max(0, emaDiff / ema13);
    const emaScore = Math.min(30, emaDiffRatio * 100);

    const volumeRatio = currentVolume / avgVolume;
    const volumeScore = Math.min(20, Math.max(0, (volumeRatio - 1) * 20));

    const totalScore = upperScore + bandwidthScore + emaScore + volumeScore;
    return Math.min(100, totalScore);
  }
}
