import { UpbitAPI } from "../api/upbit-api";
import { Order, Position } from "../types"; // StrategyResult는 직접 사용 안하므로 제거
import { config } from "../config";

/**
 * @class OrderExecutor
 * @description SignalGenerator로부터 신호를 받고, RiskManager가 결정한 주문 내용을 바탕으로
 *              Upbit API를 호출하여 실제 주문을 실행하고 그 결과를 관리합니다.
 */
export class OrderExecutor {
  private upbitAPI: UpbitAPI;

  constructor(upbitAPI: UpbitAPI) {
    this.upbitAPI = upbitAPI;
  }

  /**
   * 매수 주문을 실행합니다.
   * @param market 마켓 코드
   * @param investmentAmount RiskManager가 결정한 총 투자 금액
   * @param executionPrice 주문 가격 (지정가일 경우, 시장가면 null 또는 undefined)
   * @returns 주문 결과 Promise
   */
  async executeBuyOrder(
    market: string,
    investmentAmount: number,
    executionPrice?: number // 파라미터명 변경 price -> executionPrice
  ): Promise<any> {
    let orderData: Order;

    if (executionPrice) {
      const volume = Number(
        (investmentAmount / executionPrice).toFixed(
          config.upbit.volumePrecision
        )
      );
      if (volume * executionPrice < config.upbit.minOrderAmountKRW) {
        console.warn(
          `[${market}] 계산된 지정가 매수 총액(${
            volume * executionPrice
          } KRW)이 최소 주문 금액(${
            config.upbit.minOrderAmountKRW
          } KRW)보다 작습니다.`
        );
        // 이 경우 주문을 넣지 않거나, investmentAmount를 minOrderAmountKRW로 조정하여 재계산하는 등의 처리 가능
        // 여기서는 에러를 발생시키거나 null을 반환하여 상위에서 처리하도록 유도
        throw new Error(`[${market}] 지정가 매수 주문 총액이 너무 작습니다.`);
      }
      if (volume <= 0) {
        throw new Error(
          `[${market}] 계산된 매수 수량(${volume})이 0보다 작거나 같습니다.`
        );
      }
      orderData = {
        market,
        side: "bid",
        volume: volume.toString(),
        price: executionPrice.toString(),
        ord_type: "limit",
      };
      console.log(
        `[${market}] 지정가 매수 주문 생성 중... (수량: ${volume}, 가격: ${executionPrice} KRW, 총액 약 ${(
          volume * executionPrice
        ).toFixed(0)} KRW)`
      );
    } else {
      // 시장가 매수 (금액 기준)
      if (investmentAmount < config.upbit.minOrderAmountKRW) {
        throw new Error(
          `[${market}] 시장가 매수 주문 총액(${investmentAmount} KRW)이 최소 주문 금액(${config.upbit.minOrderAmountKRW} KRW)보다 작습니다.`
        );
      }
      orderData = {
        market,
        side: "bid",
        price: investmentAmount.toString(),
        ord_type: "price",
      };
      console.log(
        `[${market}] 시장가 매수 주문 생성 중... (${investmentAmount} KRW)`
      );
    }

    try {
      const result = await this.upbitAPI.createOrder(orderData);
      console.log(`[${market}] 매수 주문 생성 완료: ${result.uuid}`, result);
      return result;
    } catch (error) {
      console.error(`[${market}] 매수 주문 실패:`, error);
      throw error;
    }
  }

  /**
   * 매도 주문을 실행합니다.
   * @param market 마켓 코드
   * @param volume 매도할 수량 (RiskManager가 결정)
   * @param executionPrice 주문 가격 (지정가일 경우, 시장가면 null 또는 undefined)
   * @returns 주문 결과 Promise
   */
  async executeSellOrder(
    market: string,
    volume: number,
    executionPrice?: number // 파라미터명 변경 price -> executionPrice
  ): Promise<any> {
    if (volume <= 0) {
      throw new Error(
        `[${market}] 매도 수량(${volume})이 0보다 작거나 같습니다.`
      );
    }
    // 지정가 매도 시에도 최소 주문금액 체크 필요 (volume * executionPrice)
    if (
      executionPrice &&
      volume * executionPrice < config.upbit.minOrderAmountKRW
    ) {
      throw new Error(
        `[${market}] 지정가 매도 주문 총액(${
          volume * executionPrice
        } KRW)이 최소 주문 금액(${
          config.upbit.minOrderAmountKRW
        } KRW)보다 작습니다.`
      );
    }
    // 시장가 매도 시에는 수량만으로 판단하기 어려우나, 보통 코인 자체의 최소 거래 수량이 있을 수 있음 (여기서는 금액 기준으로만 체크)

    let orderData: Order;

    if (executionPrice) {
      orderData = {
        market,
        side: "ask",
        volume: volume.toString(),
        price: executionPrice.toString(),
        ord_type: "limit",
      };
      console.log(
        `[${market}] 지정가 매도 주문 생성 중... (수량: ${volume}, 가격: ${executionPrice} KRW, 총액 약 ${(
          volume * executionPrice
        ).toFixed(0)} KRW)`
      );
    } else {
      orderData = {
        market,
        side: "ask",
        volume: volume.toString(),
        ord_type: "market",
      };
      console.log(`[${market}] 시장가 매도 주문 생성 중... (수량: ${volume})`);
    }

    try {
      const result = await this.upbitAPI.createOrder(orderData);
      console.log(`[${market}] 매도 주문 생성 완료: ${result.uuid}`, result);
      return result;
    } catch (error) {
      console.error(`[${market}] 매도 주문 실패:`, error);
      throw error;
    }
  }

  async cancelOrder(uuid: string): Promise<any> {
    try {
      const result = await this.upbitAPI.cancelOrder(uuid);
      console.log(`주문 취소 완료: ${uuid}`, result);
      return result;
    } catch (error) {
      console.error(`주문 취소 실패: ${uuid}`, error);
      throw error;
    }
  }
}
