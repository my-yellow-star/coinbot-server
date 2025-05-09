import { UpbitAPI } from "../api/upbit-api";
import { Market, Ticker, Account, CandleData, OrderHistory } from "../types"; // OrderHistory 추가

/**
 * @class DataManager
 * @description Upbit API로부터 데이터를 가져오고 관리합니다.
 * 캔들 데이터, 호가 정보, 계좌 정보 등을 요청하고 캐싱하거나 필요한 형태로 가공하여
 * 다른 모듈에 제공하는 역할을 할 수 있습니다.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const DEFAULT_CACHE_TTL_MS = 5000; // 5초 캐시
// Market 정보는 자주 변하지 않으므로 TTL을 길게 설정 가능
const MARKET_CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

export class DataManager {
  private upbitAPI: UpbitAPI;
  private candleCache: Map<string, CacheEntry<CandleData[]>> = new Map();
  private tickerCache: Map<string, CacheEntry<Ticker[]>> = new Map();
  private marketCache: CacheEntry<Market[]> | null = null; // 마켓 전체 정보는 하나로 캐싱

  constructor(upbitAPI: UpbitAPI) {
    this.upbitAPI = upbitAPI;
  }

  private getFromCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    ttl: number = DEFAULT_CACHE_TTL_MS
  ): T | null {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.timestamp < ttl) {
      return entry.data;
    }
    cache.delete(key); // 오래된 캐시 삭제
    return null;
  }

  private setToCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    data: T
  ): void {
    cache.set(key, { data, timestamp: Date.now() });
  }

  async getCandles(
    market: string,
    unit: number = 5,
    count: number = 200,
    forceRefresh: boolean = false
  ): Promise<CandleData[]> {
    const cacheKey = `candles-${market}-${unit}-${count}`;
    if (!forceRefresh) {
      const cachedData = this.getFromCache(this.candleCache, cacheKey);
      if (cachedData) {
        // console.log(`[DataManager] Using cached candles for ${market}`);
        return cachedData;
      }
    }
    try {
      const candles = await this.upbitAPI.getMinuteCandles(market, unit, count);
      this.setToCache(this.candleCache, cacheKey, candles);
      return candles;
    } catch (error) {
      console.error(`[DataManager] ${market} 캔들 데이터 조회 실패:`, error);
      throw error; // 에러를 다시 던져 상위에서 처리하도록 함
    }
  }

  async getTicker(
    market: string,
    forceRefresh: boolean = false
  ): Promise<Ticker[]> {
    const cacheKey = `ticker-${market}`;
    if (!forceRefresh) {
      const cachedData = this.getFromCache(this.tickerCache, cacheKey);
      if (cachedData) {
        // console.log(`[DataManager] Using cached ticker for ${market}`);
        return cachedData;
      }
    }
    try {
      const tickers = await this.upbitAPI.getTicker(market);
      this.setToCache(this.tickerCache, cacheKey, tickers);
      return tickers;
    } catch (error) {
      console.error(`[DataManager] ${market} 티커 정보 조회 실패:`, error);
      throw error;
    }
  }

  async getAccounts(forceRefresh: boolean = false): Promise<Account[]> {
    // 계좌 정보는 자주 변동되므로 캐시 TTL을 매우 짧게 하거나 캐시하지 않을 수 있음.
    // 여기서는 캐시하지 않음.
    // 필요시 forceRefresh와 무관하게 항상 API 호출 또는 짧은 TTL 캐시 구현.
    try {
      return await this.upbitAPI.getAccounts();
    } catch (error) {
      console.error(`[DataManager] 계좌 정보 조회 실패:`, error);
      throw error;
    }
  }

  async getMarkets(forceRefresh: boolean = false): Promise<Market[]> {
    if (
      !forceRefresh &&
      this.marketCache &&
      Date.now() - this.marketCache.timestamp < MARKET_CACHE_TTL_MS
    ) {
      // console.log("[DataManager] Using cached market data");
      return this.marketCache.data;
    }
    try {
      const markets = await this.upbitAPI.getMarkets();
      this.marketCache = { data: markets, timestamp: Date.now() };
      return markets;
    } catch (error) {
      console.error("[DataManager] 마켓 정보 조회 실패:", error);
      throw error;
    }
  }

  // 주문 내역 관련 메서드는 캐시하지 않음 (상태가 자주 변경될 수 있음)
  async getOpenOrders(
    params: Parameters<UpbitAPI["getOpenOrders"]>[0]
  ): Promise<OrderHistory[]> {
    try {
      return await this.upbitAPI.getOpenOrders(params);
    } catch (error) {
      console.error("[DataManager] 대기 주문 조회 실패:", error);
      throw error; // 또는 [] 반환 등 에러 처리 정책에 따름
    }
  }

  async getClosedOrders(
    params: Parameters<UpbitAPI["getClosedOrders"]>[0]
  ): Promise<OrderHistory[]> {
    try {
      return await this.upbitAPI.getClosedOrders(params);
    } catch (error) {
      console.error("[DataManager] 종료 주문 조회 실패:", error);
      throw error;
    }
  }

  // 필요에 따라 추가적인 데이터 요청 메서드 구현
  // 예: 특정 코인의 호가 정보, 체결 내역 등
}
