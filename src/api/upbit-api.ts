import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto-js";
import { config } from "../config";
import { Account, Market, Order, OrderHistory, Ticker } from "../types";
import jwt from "jsonwebtoken";

export class UpbitAPI {
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;

  constructor(accessKey?: string, secretKey?: string) {
    this.accessKey = accessKey || config.upbit.accessKey;
    this.secretKey = secretKey || config.upbit.secretKey;
    this.baseUrl = config.upbit.baseUrl;
  }

  // 인증 헤더 생성 (최신 방식 - query_hash, query_hash_alg 사용)
  private getAuthorizationToken(queryParams?: Record<string, any>): string {
    const payload: any = {
      access_key: this.accessKey,
      nonce: uuidv4(),
    };

    // queryParams가 있으면 query_hash 생성
    if (queryParams && Object.keys(queryParams).length > 0) {
      // 쿼리 문자열 생성 (인코딩 되지 않은 쿼리 문자열 형식)
      const queryString = Object.entries(queryParams)
        .map(([key, value]) => {
          // 배열 처리
          if (Array.isArray(value)) {
            return value.map((v) => `${key}[]=${v}`).join("&");
          }
          return `${key}=${value}`;
        })
        .join("&");

      // SHA512 해시 생성
      const hash = crypto.SHA512(queryString);
      payload.query_hash = hash.toString(crypto.enc.Hex);
      payload.query_hash_alg = "SHA512";
    }

    const jwtToken = jwt.sign(payload, this.secretKey);

    // Bearer 토큰 형식으로 리턴
    return `Bearer ${jwtToken}`;
  }

  // 전체 계좌 조회
  async getAccounts(): Promise<Account[]> {
    const url = `${this.baseUrl}/accounts`;
    const headers = { Authorization: this.getAuthorizationToken() };

    try {
      const response = await axios.get(url, { headers });
      return response.data;
    } catch (error) {
      console.error("계좌 조회 실패:", error);
      throw error;
    }
  }

  // 마켓 코드 조회
  async getMarkets(): Promise<Market[]> {
    const url = `${this.baseUrl}/market/all`;

    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error("마켓 코드 조회 실패:", error);
      throw error;
    }
  }

  // 현재가 조회
  async getTicker(markets: string): Promise<Ticker[]> {
    const url = `${this.baseUrl}/ticker`;
    const params = { markets };

    try {
      const response = await axios.get(url, { params });
      return response.data;
    } catch (error) {
      console.error("현재가 조회 실패:", error);
      throw error;
    }
  }

  // 분(Minute) 캔들 조회
  async getMinuteCandles(
    market: string,
    unit: number = 1,
    count: number = 200
  ): Promise<any[]> {
    const url = `${this.baseUrl}/candles/minutes/${unit}`;
    const params = { market, count };

    try {
      const response = await axios.get(url, { params });
      return response.data;
    } catch (error) {
      console.error("분 캔들 조회 실패:", error);
      throw error;
    }
  }

  // 주문하기
  async createOrder(order: Order): Promise<any> {
    const url = `${this.baseUrl}/orders`;

    // 인증을 위한 queryParams 객체 생성
    const queryParams = { ...order };

    const headers = {
      Authorization: this.getAuthorizationToken(queryParams),
      "Content-Type": "application/json",
    };

    try {
      const response = await axios.post(url, order, { headers });
      return response.data;
    } catch (error) {
      console.error("주문 실패:", error);
      throw error;
    }
  }

  // 주문 취소
  async cancelOrder(uuid: string): Promise<any> {
    const url = `${this.baseUrl}/order`;
    const queryParams = { uuid };
    const headers = { Authorization: this.getAuthorizationToken(queryParams) };

    try {
      const response = await axios.delete(url, {
        headers,
        params: queryParams,
      });
      return response.data;
    } catch (error) {
      console.error("주문 취소 실패:", error);
      throw error;
    }
  }

  // 대기 주문 조회 (Open Order)
  async getOpenOrders(
    params: {
      market?: string;
      state?: string;
      states?: string[];
      page?: number;
      limit?: number;
      order_by?: string;
    } = {}
  ): Promise<OrderHistory[]> {
    const url = `${this.baseUrl}/orders/open`;

    // 기본값 설정 및 state/states 충돌 처리
    let queryParams: Record<string, any> = {
      page: 1,
      limit: 100,
      order_by: "desc",
    };

    // market 파라미터 추가
    if (params.market) {
      queryParams.market = params.market;
    }

    // 페이징 파라미터 추가
    if (params.page) queryParams.page = params.page;
    if (params.limit) queryParams.limit = params.limit;
    if (params.order_by) queryParams.order_by = params.order_by;

    // states가 있으면 states 사용, 없으면 state 사용 (기본값: wait)
    if (params.states && params.states.length > 0) {
      queryParams.states = params.states;
    } else {
      queryParams.state = params.state || "wait";
    }

    const headers = { Authorization: this.getAuthorizationToken(queryParams) };

    try {
      const response = await axios.get(url, { headers, params: queryParams });
      return response.data;
    } catch (error) {
      console.error("대기 주문 조회 실패:", error);
      return [];
    }
  }

  // 종료된 주문 조회 (Closed Order)
  async getClosedOrders(
    params: {
      market?: string;
      state?: string;
      states?: string[];
      uuids?: string[];
      identifiers?: string[];
      page?: number;
      limit?: number;
      order_by?: string;
    } = {}
  ): Promise<OrderHistory[]> {
    const url = `${this.baseUrl}/orders/closed`;

    // 기본값 설정 및 state/states 충돌 처리
    let queryParams: Record<string, any> = {
      page: 1,
      limit: 100,
      order_by: "desc",
    };

    // market 파라미터 추가
    if (params.market) {
      queryParams.market = params.market;
    }

    // ID 파라미터 추가
    if (params.uuids && params.uuids.length > 0) {
      queryParams.uuids = params.uuids;
    }
    if (params.identifiers && params.identifiers.length > 0) {
      queryParams.identifiers = params.identifiers;
    }

    // 페이징 파라미터 추가
    if (params.page) queryParams.page = params.page;
    if (params.limit) queryParams.limit = params.limit;
    if (params.order_by) queryParams.order_by = params.order_by;

    // states가 있으면 states 사용, 없으면 state 사용 (기본값: done,cancel)
    if (params.state) {
      queryParams.state = params.state;
    } else {
      queryParams.states = params.states || ["done", "cancel"];
    }

    const headers = { Authorization: this.getAuthorizationToken(queryParams) };

    try {
      const response = await axios.get(url, { headers, params: queryParams });
      return response.data;
    } catch (error) {
      console.error("종료된 주문 조회 실패:", error);
      return [];
    }
  }
  // 수익률 계산 (기본 구현은 null 반환, 자식 클래스에서 오버라이드 예정)
  async getProfitRate(market: string): Promise<number | null> {
    // 이 기본 클래스에서는 실제 수익률 계산 로직을 구현하기 어려움
    // (계좌 정보, 현재가 정보 등을 모두 가져와야 함)
    // MockUpbitAPI나 실제 API를 사용하는 서비스 레이어에서 구현하는 것이 적합
    console.warn(
      "UpbitAPI.getProfitRate는 기본 구현에서 null을 반환합니다. MockUpbitAPI 또는 서비스 로직에서 구체적으로 구현해야 합니다."
    );
    return null;
  }
}
