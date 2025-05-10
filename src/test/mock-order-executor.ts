import {
  BacktestOrder,
  BacktestTrade,
  BacktestCandleData,
  OrderState,
} from "./types"; // 백테스팅용 타입 사용
import { BacktestPortfolioManager } from "./backtest-portfolio-manager";
import { v4 as uuidv4 } from "uuid";

// OrderExecutor 클래스를 상속하지 않고 독립적인 MockExecutor로 만듭니다.
// 실제 OrderExecutor의 모든 메서드를 구현할 필요는 없으며, 백테스팅에 필요한 부분만 만듭니다.
export class MockOrderExecutor {
  private portfolioManager: BacktestPortfolioManager;
  public executedOrdersLog: BacktestOrder[] = []; // 생성 시도된 주문 기록 (성공 여부와 관계없이)
  public executedTradesLog: BacktestTrade[] = []; // 실제로 체결된 거래 기록 (PortfolioManager로부터 받음)

  constructor(portfolioManager: BacktestPortfolioManager) {
    this.portfolioManager = portfolioManager;
  }

  /**
   * 가상 주문을 생성하고 PortfolioManager에 거래 기록을 요청합니다.
   * @param order 생성할 주문 정보
   * @param currentCandle 현재 시점의 캔들 데이터 (시장가 체결 및 타임스탬프용)
   * @returns 체결된 거래 정보 (BacktestTrade) 또는 null (주문/거래 실패 시)
   */
  async createOrder(
    order: BacktestOrder,
    currentCandle: BacktestCandleData
  ): Promise<BacktestTrade | null> {
    const orderWithDefaults: BacktestOrder = {
      ...order,
      uuid: order.uuid || uuidv4(),
      createdAt:
        order.createdAt || new Date(currentCandle.timestamp).toISOString(),
    };
    this.executedOrdersLog.push(orderWithDefaults);

    console.log(
      `[MockOrderExecutor] Attempting order: ${orderWithDefaults.side} ${
        orderWithDefaults.volume
      } ${orderWithDefaults.market} @ ${
        orderWithDefaults.price ?? "market"
      } (Time: ${currentCandle.candle_date_time_kst})`
    );

    // PortfolioManager에 거래 처리 요청
    const tradeResult = this.portfolioManager.recordTrade(
      orderWithDefaults,
      currentCandle
    );

    if (tradeResult) {
      this.executedTradesLog.push(tradeResult);
      console.log(
        `[MockOrderExecutor] Order Executed as Trade: ${tradeResult.uuid}, Side: ${tradeResult.side}, ` +
          `Vol: ${tradeResult.volume}, Price: ${tradeResult.price.toFixed(
            2
          )}, Fee: ${tradeResult.fee.toFixed(4)}, ` +
          `Profit: ${
            tradeResult.profit !== undefined
              ? tradeResult.profit.toFixed(2)
              : "N/A"
          }`
      );
      return tradeResult;
    } else {
      // console.log(`[MockOrderExecutor] Order Failed or Not Executed for ${orderWithDefaults.market}`);
      return null;
    }
  }

  // 백테스팅에서는 주문 취소, 개별 주문 조회, 미체결 주문 조회 등의 기능은 단순화하거나 생략할 수 있습니다.
  // 필요하다면 아래와 같이 기본적인 형태만 구현합니다.

  async cancelOrder(
    uuid: string
  ): Promise<{ success: boolean; message?: string }> {
    // 백테스팅에서는 즉시 체결을 가정하므로, 취소할 주문이 거의 없습니다.
    // 만약 주문 상태(OrderState.WAIT)를 관리한다면 해당 주문을 찾아 상태를 OrderState.CANCEL로 변경합니다.
    console.log(
      `[MockOrderExecutor] Attempt to cancel order: ${uuid} (not actively managed in this simple version)`
    );
    return {
      success: false,
      message: "Cancellation not implemented in this mock.",
    };
  }

  async getOrder(uuid: string): Promise<BacktestOrder | undefined> {
    return this.executedOrdersLog.find((o) => o.uuid === uuid);
  }

  // 미체결 주문은 백테스팅에서 관리하지 않는다고 가정 (즉시 체결)
  async getOpenOrders(market?: string): Promise<BacktestOrder[]> {
    return [];
  }
}
