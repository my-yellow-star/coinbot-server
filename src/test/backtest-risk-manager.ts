import {
  BacktestStrategySignal,
  BacktestPosition,
  BacktestStrategyConfig,
} from "./types";
import { BacktestPortfolioManager } from "./backtest-portfolio-manager";

/**
 * @class BacktestRiskManager
 * @description 백테스트 환경에서 투자 금액 결정, 매수/매도 수량 계산, 리스크 관리 등을 담당
 */
export class BacktestRiskManager {
  private portfolioManager: BacktestPortfolioManager;

  constructor(portfolioManager: BacktestPortfolioManager) {
    this.portfolioManager = portfolioManager;
  }

  /**
   * 매수 신호에 따라 투자 금액을 계산하고, 이를 기반으로 매수할 수량을 결정합니다.
   * 신호 점수(0~100)에 따라 투자 금액이 선형적으로 증가합니다.
   * @param market 마켓 코드
   * @param signal 매수 신호 정보
   * @param currentPrice 현재 가격
   * @param config 백테스트 전략 설정
   * @returns 매수할 수량 또는 0 (매수 불가 시)
   */
  calculateBuyVolume(
    market: string,
    signal: BacktestStrategySignal,
    currentPrice: number,
    config: BacktestStrategyConfig
  ): number {
    const availableBalance = this.portfolioManager.getCurrentBalance();
    const feeRate = config.feeRate || 0.0005;
    const maxSpendable = availableBalance / (1 + feeRate);

    // 최소 주문 금액 및 최대 주문 비율 설정
    const minTradeValueKRW = 5000; // 최소 주문 금액
    const minTradeVolumeAsset = config.minTradeVolume || 0.0001; // 최소 주문 수량

    // 최대 투자 비율 (기본 25%)
    const maxTradeRatio = config.maxTradeRatio || 0.25;

    // 투자 가능한 최대 금액
    const maxInvestmentAmount = maxSpendable * maxTradeRatio;

    if (maxSpendable < minTradeValueKRW) {
      console.log(
        `[${market}] 최소 주문 금액(${minTradeValueKRW} KRW)보다 가용 잔고가 적습니다.`
      );
      return 0;
    }

    // 기본 투자 금액 계산
    let baseInvestmentAmount = 0;

    // 분할매수 여부 확인
    const isPyramiding = signal.reason?.includes("[분할매수]") || false;

    if (isPyramiding) {
      // 분할 매수 로직
      const currentPosition = this.portfolioManager.getPosition(market);
      if (currentPosition && currentPosition.volume > 0) {
        // 분할매수 기본 금액 계산 (기존 포지션 가치의 50% 기본값)
        const pyramidingRatio = config.pyramidingOrderSizeRatio || 0.5;

        // 스코어를 기반으로 분할매수 비율 조정 (50%~100% 범위)
        const score = signal.score || 50; // 기본값 50
        const scoreAdjustmentRatio = 0.5 + score / 200; // 50%~100% 비율
        const adjustedRatio = pyramidingRatio * scoreAdjustmentRatio;

        // 현재 포지션 가치 기준으로 투자 금액 계산
        const currentPositionValue =
          currentPosition.averageEntryPrice * currentPosition.volume;
        baseInvestmentAmount = currentPositionValue * adjustedRatio;

        console.log(
          `[${market}] 분할매수 투자금액 계산: 기준금액 ${currentPositionValue.toFixed(
            0
          )} KRW의 ${(adjustedRatio * 100).toFixed(
            1
          )}% = ${baseInvestmentAmount.toFixed(0)} KRW (점수: ${score})`
        );
      } else {
        console.log(
          `[${market}] 분할매수 신호이나, 현재 포지션이 없어 신규 매수로 처리합니다.`
        );
        baseInvestmentAmount = this.calculateNewPositionInvestment(
          signal.score,
          maxInvestmentAmount,
          minTradeValueKRW
        );
      }
    } else {
      // 신규 매수 로직 - 점수(0~100)에 따라 최소~최대 금액 선형 증가
      baseInvestmentAmount = this.calculateNewPositionInvestment(
        signal.score,
        maxInvestmentAmount,
        minTradeValueKRW
      );
    }

    // 투자 금액이 최대 한도를 넘지 않도록 조정
    let finalInvestmentAmount = Math.min(
      baseInvestmentAmount,
      maxInvestmentAmount
    );

    // 보유 KRW보다 크면 조정
    if (finalInvestmentAmount > maxSpendable) {
      console.log(
        `[${market}] 투자 예정 금액(${finalInvestmentAmount.toFixed(
          0
        )} KRW)이 가용 KRW(${maxSpendable.toFixed(
          0
        )} KRW)보다 많습니다. 조정합니다.`
      );
      finalInvestmentAmount = maxSpendable;
    }

    // 최소 주문 금액 확인
    if (finalInvestmentAmount < minTradeValueKRW) {
      finalInvestmentAmount = minTradeValueKRW;
    }

    // 주문 수량 계산
    let volume = finalInvestmentAmount / currentPrice;

    // 최소 수량 확인
    if (volume < minTradeVolumeAsset) {
      const costForMinAssetVolume = minTradeVolumeAsset * currentPrice;
      if (
        costForMinAssetVolume >= minTradeValueKRW &&
        costForMinAssetVolume * (1 + feeRate) <= maxSpendable
      ) {
        console.log(
          `[${market}] 계산된 수량이 최소 수량보다 작아 최소 수량(${minTradeVolumeAsset})으로 조정합니다.`
        );
        volume = minTradeVolumeAsset;
      } else {
        console.log(`[${market}] 최소 수량을 구매할 수 없습니다.`);
        return 0;
      }
    }

    console.log(
      `[${market}] 최종 매수 수량 계산: ${volume.toFixed(
        8
      )} (투자금액: ${finalInvestmentAmount.toFixed(
        0
      )} KRW, 가격: ${currentPrice.toFixed(0)} KRW)`
    );

    return volume;
  }

  /**
   * 신규 포지션을 위한 투자 금액을 계산합니다.
   * @param score 신호 점수 (0~100)
   * @param maxAmount 최대 투자 가능 금액
   * @param minAmount 최소 투자 금액
   * @returns 계산된 투자 금액
   */
  private calculateNewPositionInvestment(
    score: number | undefined,
    maxAmount: number,
    minAmount: number
  ): number {
    const safeScore = score || 50; // 점수가 없으면 50으로 가정

    if (safeScore <= 0) {
      return minAmount;
    } else if (safeScore >= 100) {
      return maxAmount;
    } else {
      // 점수에 따라 투자 금액 선형 증가 (0점 -> 최소금액, 100점 -> 최대금액)
      return minAmount + (maxAmount - minAmount) * (safeScore / 100);
    }
  }

  /**
   * 매도 신호에 따라 매도할 수량을 결정합니다.
   * 신호 점수(0~100)에 따라 매도 수량이 결정됩니다.
   * @param market 마켓 코드
   * @param signal 매도 신호 정보
   * @param currentPrice 현재 가격
   * @param config 백테스트 전략 설정
   * @returns 매도할 수량 또는 0 (매도 불가 시)
   */
  calculateSellVolume(
    market: string,
    signal: BacktestStrategySignal,
    currentPrice: number,
    config: BacktestStrategyConfig
  ): number {
    const currentPosition = this.portfolioManager.getPosition(market);
    if (!currentPosition || currentPosition.volume <= 0) {
      console.log(`[${market}] 매도할 포지션이 없습니다.`);
      return 0;
    }

    const minTradeVolumeAsset = config.minTradeVolume || 0.0001;
    const minTradeValueKRW = 5000;

    // 손절 신호인 경우 전량 매도
    if (signal.reason?.includes("[단기 손절]")) {
      console.log(
        `[${market}] 손절 신호로 전량 매도 실행 (${currentPosition.volume})`
      );
      return currentPosition.volume;
    }

    // 익절 신호인 경우 전량 또는 일부 매도 (점수에 따라)
    if (signal.reason?.includes("[단기 익절]")) {
      const score = signal.score || 50;
      // 높은 점수(80 이상)는 전량 매도, 낮은 점수는 일부 매도
      const sellRatio = Math.max(0.5, score / 100); // 최소 50%는 매도
      const sellVolume = currentPosition.volume * sellRatio;

      console.log(
        `[${market}] 익절 신호로 ${(sellRatio * 100).toFixed(
          0
        )}% 매도 실행 (${sellVolume.toFixed(8)} / ${
          currentPosition.volume
        }) (점수: ${score})`
      );

      // 최소 거래 조건 확인
      if (
        sellVolume < minTradeVolumeAsset ||
        sellVolume * currentPrice < minTradeValueKRW
      ) {
        console.log(
          `[${market}] 계산된 매도 수량이 최소 조건을 만족하지 않아 전량 매도로 전환합니다.`
        );
        return currentPosition.volume;
      }

      return sellVolume;
    }

    // 일반 매도 신호의 경우 점수에 따라 매도 비율 결정
    const score = signal.score || 30; // 기본값 30
    let sellRatio = 0.3; // 기본 30% 매도

    if (score >= 60) {
      // 60~100점 사이에서 매도 비율을 60%~100%로 선형 증가
      sellRatio = 0.6 + (score - 60) / 100; // 60%~100% 범위
    }

    const sellVolume = currentPosition.volume * sellRatio;

    console.log(
      `[${market}] 매도 신호 강도에 따라 ${(sellRatio * 100).toFixed(
        0
      )}% 매도 (${sellVolume.toFixed(8)} / ${
        currentPosition.volume
      }) (점수: ${score})`
    );

    // 최소 거래 조건 확인
    if (
      sellVolume < minTradeVolumeAsset ||
      sellVolume * currentPrice < minTradeValueKRW
    ) {
      if (
        currentPosition.volume >= minTradeVolumeAsset &&
        currentPosition.volume * currentPrice >= minTradeValueKRW
      ) {
        console.log(
          `[${market}] 계산된 매도 수량이 최소 조건을 만족하지 않아 전량 매도로 전환합니다.`
        );
        return currentPosition.volume;
      } else {
        console.log(
          `[${market}] 최소 매도 조건을 만족하지 않아 매도를 실행하지 않습니다.`
        );
        return 0;
      }
    }

    return sellVolume;
  }
}
