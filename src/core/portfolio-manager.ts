import { Account, Position, Ticker, OrderHistory } from "../types"; // Position 등 타입 정의 필요
import { DataManager } from "./data-manager";
import { UpbitAPI } from "../api/upbit-api";
import { config } from "../config";

/**
 * @class PortfolioManager
 * @description 현재 보유 중인 모든 자산(KRW, 코인)의 현황, 개별 포지션의 진입 가격, 수량,
 *              현재 수익률, 전체 포트폴리오의 수익률 등을 종합적으로 관리하고 분석합니다.
 *              RiskManager에서 포지션 관련 로직을 가져올 수 있습니다.
 */
export class PortfolioManager {
  private dataManager: DataManager; // 현재 가격 조회 등에 사용
  private upbitAPI: UpbitAPI; // 계좌 정보 직접 조회용
  private positions: Map<string, Position>; // 마켓별 포지션 관리 <market, Position>
  private krwBalance: number; // 현재 보유 KRW
  private initialized: boolean = false;

  constructor(dataManager: DataManager, upbitAPI: UpbitAPI) {
    this.dataManager = dataManager;
    this.upbitAPI = upbitAPI;
    this.positions = new Map();
    this.krwBalance = 0;
  }

  /**
   * 포트폴리오 매니저를 초기화하고 계좌 정보를 로드합니다.
   * 서버 시작 시 한 번 호출되어야 합니다.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log("PortfolioManager가 이미 초기화되었습니다.");
      return;
    }
    console.log("PortfolioManager 초기화 시작...");
    await this.loadInitialPortfolio();
    this.initialized = true;
    console.log("PortfolioManager 초기화 완료.");
  }

  private async loadInitialPortfolio(): Promise<void> {
    try {
      const accounts = await this.upbitAPI.getAccounts();
      this.positions.clear(); // 기존 포지션 정보 초기화
      accounts.forEach((acc) => {
        if (acc.currency === "KRW") {
          this.krwBalance = parseFloat(acc.balance);
        } else {
          const marketId = `KRW-${acc.currency}`;
          // API에서 제공하는 avg_buy_price가 0이거나, 실제 매수내역과 다를 수 있으므로 주의.
          // 실제 운영 시에는 거래내역을 통해 포지션을 구성하거나, 외부에서 주입받는 것이 더 정확함.
          if (
            parseFloat(acc.balance) > 0 &&
            parseFloat(acc.avg_buy_price) > 0
          ) {
            this.positions.set(marketId, {
              market: marketId,
              entryPrice: parseFloat(acc.avg_buy_price),
              volume: parseFloat(acc.balance),
              timestamp: new Date().toISOString(), // 로드 시점 기록
            });
          } else if (parseFloat(acc.balance) > 0) {
            console.warn(
              `[${marketId}] 포지션 로드 경고: 평균 매입가(avg_buy_price)가 0이거나 유효하지 않아, 해당 코인 포지션을 초기화하지 못했습니다. 잔고: ${acc.balance}`
            );
            // 필요시, 이런 경우 ticker에서 현재가를 가져와 임시 entryPrice로 설정하는 등의 fallback 고려 가능
          }
        }
      });
      console.log("초기 포트폴리오 로드 완료:", {
        krw: this.krwBalance,
        positions: Object.fromEntries(this.positions),
      });
    } catch (error) {
      console.error("초기 포트폴리오 로드 실패:", error);
    }
  }

  // 매수 주문 체결 후 포지션 업데이트
  // tradeAmountKRW: 실제 매수에 사용된 KRW 금액 (수수료 포함된 금액일수도, 아닐수도 있음 - Upbit API 확인 필요)
  // entryPrice: 실제 체결 가격
  updatePositionAfterBuy(
    market: string,
    체결가격: number,
    체결수량: number,
    사용된KRW: number
  ): void {
    const existingPosition = this.positions.get(market);
    if (existingPosition) {
      // 기존 포지션에 추가 매수 (평단가, 수량 업데이트)
      const totalVolume = existingPosition.volume + 체결수량;
      const newEntryPrice =
        (existingPosition.entryPrice * existingPosition.volume +
          체결가격 * 체결수량) /
        totalVolume;
      existingPosition.entryPrice = newEntryPrice;
      existingPosition.volume = totalVolume;
      existingPosition.timestamp = new Date().toISOString();
    } else {
      this.positions.set(market, {
        market,
        entryPrice: 체결가격,
        volume: 체결수량,
        timestamp: new Date().toISOString(),
      });
    }
    this.krwBalance -= 사용된KRW;
    console.log(
      `[${market}] 매수 체결 업데이트: 가격 ${체결가격}, 수량 ${체결수량}. KRW 잔고: ${this.krwBalance.toFixed(
        0
      )}`
    );
    console.log(`  ㄴ 새로운 포지션: `, this.positions.get(market));
  }

  // 매도 주문 체결 후 포지션 업데이트
  // saleProceedsKRW: 실제 매도로 얻은 KRW 금액 (수수료 제외된 금액이어야 함)
  updatePositionAfterSell(
    market: string,
    체결수량: number,
    얻은KRW: number
  ): void {
    const position = this.positions.get(market);
    if (position) {
      if (position.volume > 체결수량) {
        // 부분 매도
        position.volume -= 체결수량;
        position.timestamp = new Date().toISOString(); // 마지막 거래 시간 업데이트
      } else {
        // 전체 매도
        this.positions.delete(market);
      }
      this.krwBalance += 얻은KRW;
      console.log(
        `[${market}] 매도 체결 업데이트: 수량 ${체결수량}, 얻은 KRW ${얻은KRW.toFixed(
          0
        )}. KRW 잔고: ${this.krwBalance.toFixed(0)}`
      );
      if (this.positions.has(market)) {
        console.log(`  ㄴ 남은 포지션: `, this.positions.get(market));
      } else {
        console.log(`  ㄴ ${market} 포지션 전체 매도 완료.`);
      }
    } else {
      console.warn(
        `[${market}] 매도 체결 업데이트 경고: 해당 마켓의 포지션 정보가 없습니다.`
      );
      // 이 경우에도 KRW 잔고는 업데이트 해줘야 할 수 있음 (API 직접 조회와 동기화 필요)
      this.krwBalance += 얻은KRW;
    }
  }

  getPosition(market: string): Position | null {
    return this.positions.get(market) || null;
  }

  getAllPositions(): Map<string, Position> {
    return this.positions;
  }

  getKrwBalance(): number {
    return this.krwBalance;
  }

  async syncKrwBalanceFromAPI(): Promise<void> {
    try {
      const accounts = await this.upbitAPI.getAccounts();
      const krwAccount = accounts.find((acc) => acc.currency === "KRW");
      if (krwAccount) {
        const apiBalance = parseFloat(krwAccount.balance);
        if (this.krwBalance !== apiBalance) {
          console.log(
            `KRW 잔고 동기화: 내부 ${this.krwBalance.toFixed(
              0
            )} -> API ${apiBalance.toFixed(0)}`
          );
          this.krwBalance = apiBalance;
        }
      }
    } catch (error) {
      console.error("KRW 잔고 API 동기화 실패:", error);
    }
  }

  /**
   * 특정 마켓의 현재 수익률을 계산합니다.
   * @param market 마켓 코드
   * @returns 수익률 (예: 0.05는 5%) 또는 null (포지션 없거나 가격 조회 실패시)
   */
  async getCurrentProfitRate(market: string): Promise<number | null> {
    const position = this.getPosition(market);
    if (!position || position.entryPrice <= 0) return null; // entryPrice가 0이하인 경우 수익률 계산 불가

    try {
      const tickerArray = await this.dataManager.getTicker(market);
      if (!tickerArray || tickerArray.length === 0) return null;

      const currentPrice = tickerArray[0].trade_price;
      const { entryPrice } = position;
      const feeRate = config.upbit.feeRate; // config에서 feeRate 가져오기

      return currentPrice / entryPrice - 1 - feeRate * 2; // (매수가격 대비 변동률) - 양방향 수수료
    } catch (error) {
      console.error(`[${market}] 현재 수익률 계산 실패:`, error);
      return null;
    }
  }

  /**
   * 전체 포트폴리오의 현재 가치를 KRW로 계산합니다.
   * (미실현 손익 포함)
   */
  async getTotalPortfolioValueKRW(): Promise<number> {
    let totalValue = this.krwBalance;
    for (const market of this.positions.keys()) {
      const position = this.positions.get(market);
      if (position && position.volume > 0) {
        try {
          const tickerArray = await this.dataManager.getTicker(market);
          if (tickerArray && tickerArray.length > 0) {
            const currentPrice = tickerArray[0].trade_price;
            totalValue += currentPrice * position.volume;
          }
        } catch (error) {
          console.warn(
            `[${market}] 현재가 조회 실패로 포트폴리오 가치 계산에서 제외:`,
            error
          );
        }
      }
    }
    return totalValue;
  }

  // TODO: 전체 포트폴리오 가치, 총 수익률 계산 등 추가 메서드
}
