import { IndicatorCalculator } from "./indicator-calculator";
import { StrategyResult, Position, StrategyConfig } from "../types";
import { config } from "../config";

// 개별 전략에 필요한 파라미터 타입 (예시) - types.ts의 GlobalStrategyConfig 사용
// export interface StrategyConfig { ... } // 기존 정의 제거 또는 GlobalStrategyConfig 사용 명시

/**
 * @class SignalGenerator
 * @description 계산된 기술적 지표와 정의된 매매 전략에 따라 매수/매도/보류 신호를 생성합니다.
 * 다양한 전략을 내부에 포함하거나, 외부에서 전략 객체를 주입받아 사용할 수 있습니다.
 */
export class SignalGenerator {
  private indicatorCalc: IndicatorCalculator;
  // private activePositions: Map<string, Position>; // 현재 보유 포지션 정보 (RiskManager 또는 PortfolioManager와 연동)

  constructor(indicatorCalc: IndicatorCalculator) {
    this.indicatorCalc = indicatorCalc;
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
    // config.trading.defaultStrategyConfig와 입력된 strategyCfgInput을 병합
    const strategyCfg: StrategyConfig = {
      ...config.trading.defaultStrategyConfig,
      ...strategyCfgInput,
    };

    // strategyCfg에서 필요한 값들 추출 (기본값 fallback 포함)
    const bollingerPeriod = strategyCfg.bollingerPeriod || 20;
    const bollingerStdDev = strategyCfg.bollingerStdDev || 2;
    const emaShortPeriod = strategyCfg.emaShortPeriod || 5;
    const emaMidPeriod = strategyCfg.emaMidPeriod || 10; // 중기 EMA
    const emaLongPeriod = strategyCfg.emaLongPeriod || 20;
    const rsiPeriod = strategyCfg.rsiPeriod || 14;
    const rsiOversoldThreshold = strategyCfg.rsiOversoldThreshold || 30;
    const rsiOverboughtThreshold = strategyCfg.rsiOverboughtThreshold || 70;
    const volumeSpikeMultiplier = strategyCfg.volumeSpikeMultiplier || 2.0;
    const buyScoreThresholdShortTerm =
      strategyCfg.buyScoreThresholdShortTerm || 80;
    const stopLossPercentShortTerm =
      strategyCfg.stopLossPercentShortTerm || 1.5;
    const profitTargetPercentShortTerm =
      strategyCfg.profitTargetPercentShortTerm || 3.0;
    // const sellScoreThresholdShortTerm = strategyCfg.sellScoreThresholdShortTerm || 65; // 필요시 사용

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
    let score = 0;

    // --- 단기 고위험-고수익 전략 로직 ---

    // 매수 조건 평가
    let buyScore = 0;
    const buyReasons: string[] = [];

    const isEmaGoldenCross: boolean = emaShort > emaMid && emaMid > emaLong;
    if (isEmaGoldenCross) {
      buyScore += 30;
      buyReasons.push(
        `EMA 정배열(S:${emaShort.toFixed(0)}>M:${emaMid.toFixed(
          0
        )}>L:${emaLong.toFixed(0)})`
      );
    }

    const isBollingerUpperBreakout = currentPrice > bollingerBands.upper;
    if (isBollingerUpperBreakout) {
      buyScore += 30;
      buyReasons.push(
        `볼린저 상단 돌파(${currentPrice.toFixed(
          0
        )} > ${bollingerBands.upper.toFixed(0)})`
      );
    }

    const isVolumeSpike = currentVolume > avgVolume * volumeSpikeMultiplier;
    if (isVolumeSpike) {
      buyScore += 25;
      buyReasons.push(
        `거래량 급증(${(currentVolume / avgVolume).toFixed(1)}배)`
      );
    }

    const isRsiNotTooHigh = rsi < rsiOverboughtThreshold + 5; // 과매수 바로 직전 또는 약간 넘어선 정도까지 허용
    if (rsi < rsiOversoldThreshold) {
      // 과매도 조건은 더 높은 가점
      buyScore += 20;
      buyReasons.push(
        `RSI 과매도(${rsi.toFixed(1)} < ${rsiOversoldThreshold})`
      );
    } else if (isRsiNotTooHigh) {
      buyScore += 10;
      buyReasons.push(`RSI 적정(${rsi.toFixed(1)})`);
    }

    // 매수 결정
    if (
      buyScore >= buyScoreThresholdShortTerm &&
      isEmaGoldenCross &&
      isBollingerUpperBreakout &&
      isVolumeSpike && // 핵심 조건은 AND로 결합
      (!currentPosition || currentPosition.volume === 0) // 현재 포지션이 없을 때만 신규 매수
    ) {
      reason = `[단기 매수] ${buyReasons.join(", ")}`;
      score = buyScore;
      return { action: "buy", market, reason, price: currentPrice, score };
    }

    // 매도 (청산) 조건 평가 (현재 포지션 보유 시)
    if (currentPosition && currentPosition.volume > 0) {
      const entryPrice = currentPosition.entryPrice;
      const currentProfitRate = (currentPrice / entryPrice - 1) * 100;

      // 1. 손절 조건
      const stopLossPrice = entryPrice * (1 - stopLossPercentShortTerm / 100);
      if (currentPrice <= stopLossPrice) {
        reason = `[단기 손절] ${stopLossPercentShortTerm}% 하락 (현재가: ${currentPrice.toFixed(
          0
        )}, 손절가: ${stopLossPrice.toFixed(0)})`;
        score = 100; // 손절은 최우선
        return {
          action: "sell",
          market,
          reason,
          price: currentPrice,
          volume: currentPosition.volume,
          score,
        };
      }

      // 2. 익절 조건 (1차 목표)
      const profitTargetPrice =
        entryPrice * (1 + profitTargetPercentShortTerm / 100);
      if (currentPrice >= profitTargetPrice) {
        reason = `[단기 익절] ${profitTargetPercentShortTerm}% 상승 (현재가: ${currentPrice.toFixed(
          0
        )}, 목표가: ${profitTargetPrice.toFixed(0)})`;
        score = 90; // 익절
        return {
          action: "sell",
          market,
          reason,
          price: currentPrice,
          volume: currentPosition.volume,
          score,
        };
      }

      // 3. 추세 이탈 기반 익절 (단기 EMA 하향 돌파)
      if (currentPrice < emaShort) {
        // 단, 수익 중일 때만 추세 이탈 익절을 고려하거나, 손절 라인보다는 위에 있을 때
        if (currentProfitRate > 0.1) {
          // 최소한의 수익이라도 있을 때
          reason = `[단기 추세 익절] 현재가(${currentPrice.toFixed(
            0
          )}) < 단기EMA(${emaShort.toFixed(
            0
          )}), 수익률: ${currentProfitRate.toFixed(1)}%`;
          score = 80;
          return {
            action: "sell",
            market,
            reason,
            price: currentPrice,
            volume: currentPosition.volume,
            score,
          };
        }
      }

      // 4. RSI 과매수 구간에서의 매도 고려 + EMA 데드크로스
      const isEmaDeadCross = emaShort < emaMid;
      if (rsi > rsiOverboughtThreshold && isEmaDeadCross) {
        reason = `[단기 매도 고려] RSI 과매수(${rsi.toFixed(
          1
        )}) + EMA 데드크로스, 수익률: ${currentProfitRate.toFixed(1)}%`;
        score = 75;
        return {
          action: "sell",
          market,
          reason,
          price: currentPrice,
          volume: currentPosition.volume,
          score,
        };
      } else if (rsi > rsiOverboughtThreshold) {
        reason = `보유 중 (RSI 과매수: ${rsi.toFixed(
          1
        )}, 수익률 ${currentProfitRate.toFixed(1)}%)`;
        score = 50; // 과매수 상태이지만, 다른 조건 미충족시 아직 홀드
      }

      // EMA 데드크로스 (단기 < 중기) + 볼린저밴드 중단 하회 시 강력 매도 (위의 RSI 과매수+데드크로스와는 별개 또는 통합 가능)
      if (
        isEmaDeadCross &&
        currentPrice < bollingerBands.middle &&
        !(rsi > rsiOverboughtThreshold && isEmaDeadCross)
      ) {
        // 중복 조건 회피
        reason = `[단기 강력 매도] EMA 데드크로스(S<M), BB중단 하회. 수익률: ${currentProfitRate.toFixed(
          1
        )}%`;
        score = 95;
        return {
          action: "sell",
          market,
          reason,
          price: currentPrice,
          volume: currentPosition.volume,
          score,
        };
      }

      // 기본 보유 메시지 (위의 조건들에 해당하지 않을 시 최종 reason 및 score 설정)
      if (reason === "기본 관망" || (score !== 50 && score < 75)) {
        // score 50은 RSI 과매수 홀드, 75 이상은 매도 시그널
        reason = `보유 중 (수익률 ${currentProfitRate.toFixed(1)}%), 관망 중`;
        score = Math.max(0, Math.min(buyScore, 30)); // 기본 홀드 점수, 매수 근거가 있었으면 조금 더 높게
      }
    } else {
      // 포지션 미보유 시
      if (buyScore > 0 && buyScore < buyScoreThresholdShortTerm) {
        reason = `매수 대기 (신호 강도: ${buyScore}, 조건: ${buyReasons.join(
          ", "
        )})`;
        score = buyScore;
      } else if (buyScore === 0) {
        // 조건 부합하여 score가 0으로 유지되는 경우
        reason = "매수 조건 미충족, 관망";
        score = 0;
      }
      // 이미 reason, score가 설정된 경우는 그대로 사용 (예: 매수 대기)
    }

    return { action: "hold", market, reason, score };
  }

  // 여기에 다양한 전략 메서드를 추가하거나, 전략 패턴을 사용하여 확장 가능
  // private bollingerBreakoutStrategy(...) : StrategyResult { ... }
  // private rsiDivergenceStrategy(...) : StrategyResult { ... }
}
