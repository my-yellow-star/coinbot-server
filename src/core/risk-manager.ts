import { Position, StrategyResult } from "../types"; // Position, StrategyResult 등 타입 정의 필요
import { config } from "../config";
import { PortfolioManager } from "./portfolio-manager";

/**
 * @class RiskManager
 * @description 투자 금액 결정, 손절매/익절매 조건 적용, 최대 손실 한도 관리 등
 *              전반적인 리스크 관리 정책을 수행합니다.
 */
export class RiskManager {
  private portfolioManager: PortfolioManager;

  constructor(portfolioManager: PortfolioManager) {
    this.portfolioManager = portfolioManager;
  }

  /**
   * 매수 신호에 따라 실제 투자할 금액 또는 수량을 결정합니다.
   * 신호 점수(0~100)에 따라 투자 금액이 선형적으로 증가합니다.
   * @param market 마켓 코드
   * @param signal 매수 신호 정보 (SignalGenerator로부터 받음)
   * @param krwBalance 현재 보유 KRW 잔액
   * @param currentEntryPrice 분할매수 시 현재 포지션의 평균단가
   * @param currentVolume 분할매수 시 현재 포지션의 보유량
   * @returns 주문에 사용할 투자 금액 또는 null (주문 불가 시)
   */
  determineInvestmentAmountForBuy(
    market: string,
    signal: StrategyResult // signal.price 에 매수 희망 가격(현재가) 포함 가정
  ): number | null {
    const krwBalance = this.portfolioManager.getKrwBalance();
    const currentEntryPrice =
      this.portfolioManager.getPosition(market)?.entryPrice;
    const currentVolume = this.portfolioManager.getPosition(market)?.volume;

    // 보유 KRW의 최대 25%까지만 투자 가능
    const MAX_INVESTMENT_PERCENTAGE =
      config.trading.maxTradeBalancePercentage || 25;
    const minInvestmentAmount = config.upbit.minOrderAmountKRW || 5000;
    const maxInvestmentAmount = Math.max(
      minInvestmentAmount,
      krwBalance * (MAX_INVESTMENT_PERCENTAGE / 100)
    );

    // 분할매수 여부 확인
    const isPyramiding = signal.reason.includes("[분할매수]");

    // 기본 투자 금액 계산
    let baseInvestmentAmount = 0;

    if (isPyramiding) {
      // 분할 매수 로직
      if (currentEntryPrice && currentVolume && currentVolume > 0) {
        // 분할매수 기본 금액 계산
        const pyramidingRatio =
          config.trading.defaultStrategyConfig.pyramidingOrderSizeRatio || 0.5;

        // 스코어를 기반으로 분할매수 비율 조정 (50%~100% 범위)
        const scoreAdjustmentRatio = 0.5 + signal.score / 200; // 50%~100% 비율
        const adjustedRatio = pyramidingRatio * scoreAdjustmentRatio;

        // 현재 포지션 가치 기준으로 투자 금액 계산
        const currentPositionValue = currentEntryPrice * currentVolume;
        baseInvestmentAmount = currentPositionValue * adjustedRatio;

        console.log(
          `[${market}] 분할매수 투자금액 계산: 기준금액 ${currentPositionValue.toFixed(
            0
          )} KRW의 ${(adjustedRatio * 100).toFixed(
            1
          )}% = ${baseInvestmentAmount.toFixed(0)} KRW (점수: ${signal.score})`
        );
      } else {
        console.warn(
          `[${market}] 분할매수 신호이나, 현재 포지션 정보(평균단가/수량) 부족으로 투자금액 계산 불가. 신규 매수 로직으로 fallback.`
        );
        baseInvestmentAmount = config.trading.tradeAmount; // 고정 금액 투자 (신규 매수와 동일하게 처리)
      }
    } else {
      // 신규 매수 로직 - 점수(0~100)에 따라 최소~최대 금액 선형 증가
      if (signal.score <= 0) {
        baseInvestmentAmount = minInvestmentAmount;
      } else if (signal.score >= 100) {
        baseInvestmentAmount = maxInvestmentAmount;
      } else {
        // 점수에 따라 투자 금액 선형 증가 (0점 -> 최소금액, 100점 -> 최대금액)
        baseInvestmentAmount =
          minInvestmentAmount +
          (maxInvestmentAmount - minInvestmentAmount) * (signal.score / 100);
      }

      console.log(
        `[${market}] 신규매수 투자금액 계산: ${baseInvestmentAmount.toFixed(
          0
        )} KRW (점수: ${
          signal.score
        }, 범위: ${minInvestmentAmount}~${maxInvestmentAmount})`
      );
    }

    // 투자 금액이 최대 한도를 넘지 않도록 조정
    let finalInvestmentAmount = Math.min(
      baseInvestmentAmount,
      maxInvestmentAmount
    );

    // 보유 KRW보다 크면 조정
    if (finalInvestmentAmount > krwBalance) {
      console.warn(
        `[${market}] 투자 예정 금액(${finalInvestmentAmount.toFixed(
          0
        )} KRW)이 보유 KRW(${krwBalance.toFixed(
          0
        )} KRW)보다 많습니다. 보유 KRW로 조정합니다.`
      );
      finalInvestmentAmount = krwBalance;
    }

    // 최소 주문 금액 확인
    if (finalInvestmentAmount < minInvestmentAmount) {
      console.warn(
        `[${market}] 최종 투자 예정 금액(${finalInvestmentAmount.toFixed(
          0
        )} KRW)이 최소 주문 금액(${minInvestmentAmount} KRW)보다 작습니다.`
      );
      return null;
    }

    return finalInvestmentAmount;
  }

  /**
   * 매도 신호 또는 손절/익절 조건에 따라 매도할 수량을 결정합니다.
   * 신호 점수(0~100)에 따라 매도 수량이 결정됩니다.
   * @param market 마켓 코드
   * @param signal 매도 신호 정보
   * @param currentPosition 현재 보유 포지션
   * @returns 매도할 수량 또는 null (매도 불가 시)
   */
  determineOrderVolumeForSell(
    market: string,
    signal: StrategyResult,
    currentPosition: Position | null
  ): number | null {
    if (!currentPosition || currentPosition.volume <= 0) {
      console.warn(`[${market}] 매도할 포지션이 없습니다.`);
      return null;
    }

    // 손절 신호인 경우 전량 매도
    if (signal.reason.includes("[단기 손절]")) {
      console.log(
        `[${market}] 손절 신호로 전량 매도 실행 (${currentPosition.volume})`
      );
      return currentPosition.volume;
    }

    // 익절 신호인 경우 전량 또는 일부 매도 (점수에 따라)
    if (signal.reason.includes("[단기 익절]")) {
      // 높은 점수(80 이상)는 전량 매도, 낮은 점수는 일부 매도
      const sellRatio = Math.max(0.5, signal.score / 100); // 최소 50%는 매도
      const sellVolume = currentPosition.volume * sellRatio;

      console.log(
        `[${market}] 익절 신호로 ${(sellRatio * 100).toFixed(
          0
        )}% 매도 실행 (${sellVolume.toFixed(8)} / ${
          currentPosition.volume
        }) (점수: ${signal.score})`
      );
      return sellVolume;
    }

    // 일반 매도 신호의 경우 점수에 따라 매도 비율 결정 (60~100: 비율 계산, <60: 최소 매도)
    if (signal.score >= 60) {
      // 60~100점 사이에서 매도 비율을 60%~100%로 선형 증가
      const sellRatio = 0.6 + (signal.score - 60) / 100; // 60%~100% 범위
      const sellVolume = currentPosition.volume * sellRatio;

      console.log(
        `[${market}] 매도 신호 강도에 따라 ${(sellRatio * 100).toFixed(
          0
        )}% 매도 (${sellVolume.toFixed(8)} / ${
          currentPosition.volume
        }) (점수: ${signal.score})`
      );
      return sellVolume;
    } else {
      // 낮은 점수의 매도 신호는 30% 정도만 매도
      const sellVolume = currentPosition.volume * 0.3;

      console.log(
        `[${market}] 약한 매도 신호로 30% 부분 매도 (${sellVolume.toFixed(
          8
        )} / ${currentPosition.volume}) (점수: ${signal.score})`
      );
      return sellVolume;
    }
  }
}
