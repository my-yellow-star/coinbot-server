import { Account, Order, Position, StrategyResult } from "../types"; // Position, StrategyResult 등 타입 정의 필요
import { DataManager } from "./data-manager";
import { config } from "../config";

/**
 * @class RiskManager
 * @description 투자 금액 결정, 손절매/익절매 조건 적용, 최대 손실 한도 관리 등
 *              전반적인 리스크 관리 정책을 수행합니다.
 */
export class RiskManager {
  private dataManager: DataManager;
  // private portfolioManager: PortfolioManager; // 포트폴리오 전체 상황 고려 시 필요

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  /**
   * 매수 신호에 따라 실제 투자할 금액 또는 수량을 결정합니다.
   * @param market 마켓 코드
   * @param signal 매수 신호 정보 (SignalGenerator로부터 받음)
   * @param currentPrice 현재 가격 (SignalGenerator의 signal.price 사용 가능)
   * @param krwBalance 현재 보유 KRW 잔액
   * @returns 주문에 사용할 투자 금액 또는 null (주문 불가 시)
   */
  determineInvestmentAmountForBuy(
    market: string,
    signal: StrategyResult, // signal.price 에 매수 희망 가격(현재가) 포함 가정
    krwBalance: number
  ): number | null {
    let investmentAmount = config.trading.tradeAmount; // 고정 금액 투자

    if (config.trading.useBalancePercentage) {
      const calculatedAmount =
        krwBalance * (config.trading.balancePercentageToInvest / 100);
      // 잔액 비율로 계산된 금액이 설정된 tradeAmount보다 작으면 tradeAmount 사용 (최소 투자금액 역할)
      // 또는 tradeAmount를 무시하고 비율 기반 금액만 사용하도록 정책 결정 가능
      investmentAmount = Math.max(calculatedAmount, config.trading.tradeAmount);
      // 혹은 investmentAmount = calculatedAmount; 로 하고, 아래 minOrderAmountKRW 에서만 체크
    }

    if (investmentAmount > krwBalance) {
      console.warn(
        `[${market}] 투자 예정 금액(${investmentAmount} KRW)이 보유 KRW(${krwBalance} KRW)보다 많습니다. 보유 KRW로 조정합니다.`
      );
      investmentAmount = krwBalance;
    }

    if (investmentAmount < config.upbit.minOrderAmountKRW) {
      console.warn(
        `[${market}] 최종 투자 예정 금액(${investmentAmount} KRW)이 최소 주문 금액(${config.upbit.minOrderAmountKRW} KRW)보다 작습니다.`
      );
      return null;
    }

    // OrderExecutor가 이 금액으로 시장가 매수(금액)를 하거나,
    // 이 금액과 signal.price를 바탕으로 지정가 매수(수량)를 계산하여 실행
    return investmentAmount;
  }

  /**
   * 매도 신호 또는 손절/익절 조건에 따라 매도할 수량을 결정합니다.
   * @param market 마켓 코드
   * @param signal 매도 신호 정보 (signal.volume에 전체 매도 수량 포함 가정)
   * @param currentPosition 현재 보유 포지션
   * @returns 매도할 수량 또는 null (매도 불가 시)
   */
  determineOrderVolumeForSell(
    market: string,
    signal: StrategyResult, // signal.volume에 매도 희망 수량(보통 전체) 포함 가정
    currentPosition: Position | null
  ): number | null {
    if (!currentPosition || currentPosition.volume <= 0) {
      console.warn(`[${market}] 매도할 포지션이 없습니다.`);
      return null;
    }

    // SignalGenerator에서 이미 매도 수량을 결정해서 signal.volume에 넣어주는 것을 가정
    // (예: currentPosition.volume)
    if (signal.action === "sell" && signal.volume && signal.volume > 0) {
      // 보유 수량 초과 매도 방지
      return Math.min(signal.volume, currentPosition.volume);
    }

    // 기본적으로 보유 수량 전체 매도 (SignalGenerator가 volume 안줬을때 fallback)
    // console.warn(`[${market}] SignalGenerator가 매도 수량을 제공하지 않아 전체 수량 매도 시도.`);
    // return currentPosition.volume;
    // 또는 오류 처리
    console.error(`[${market}] 매도 신호에 매도 수량(volume) 정보가 없습니다.`);
    return null;
  }

  // 포지션 추가/제거/조회 로직 (PortfolioManager로 이동 고려)
  // private positions: Map<string, Position> = new Map();
  // addPosition(market: string, price: number, volume: number): void {
  //   this.positions.set(market, { entryPrice: price, volume });
  // }
  // removePosition(market: string): void {
  //   this.positions.delete(market);
  // }
  // getPosition(market: string): Position | null {
  //   return this.positions.get(market) || null;
  // }
}
