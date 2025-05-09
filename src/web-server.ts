import cors from "cors";
import express from "express";
import * as http from "http";

import { TradingServer } from "./server";
import { UpbitAPI } from "./upbit-api";

export class WebServer {
  private app: express.Application;
  private server: http.Server;
  private port: number;
  private tradingServer: TradingServer;
  private upbitAPI: UpbitAPI;

  constructor(
    tradingServer: TradingServer,
    port: number = 8080,
    upbitAPI?: UpbitAPI
  ) {
    this.port = port;
    this.tradingServer = tradingServer;
    // tradingServer의 API를 사용하거나 별도로 제공된 upbitAPI를 사용
    this.upbitAPI = upbitAPI || this.tradingServer.getAPI();

    // Express 앱 생성
    this.app = express();
    this.server = http.createServer(this.app);

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // API 엔드포인트: 계좌 정보 조회
    this.app.get("/api/accounts", async (req, res) => {
      try {
        const accounts = await this.upbitAPI.getAccounts();
        res.json(accounts);
      } catch (error) {
        res.status(500).json({ error: "계좌 정보 조회 실패" });
      }
    });

    // API 엔드포인트: 마켓 정보 조회
    this.app.get("/api/markets", async (req, res) => {
      try {
        const markets = await this.upbitAPI.getMarkets();
        res.json(markets);
      } catch (error) {
        res.status(500).json({ error: "마켓 정보 조회 실패" });
      }
    });

    // API 엔드포인트: 대기 주문 조회
    this.app.get("/api/orders/open", async (req, res) => {
      try {
        const params = {
          market: req.query.market as string | undefined,
          state: req.query.state as string | undefined,
          states: req.query.states
            ? (req.query.states as string).split(",")
            : undefined,
          page: req.query.page ? parseInt(req.query.page as string) : undefined,
          limit: req.query.limit
            ? parseInt(req.query.limit as string)
            : undefined,
          order_by: req.query.order_by as string | undefined,
        };

        const orders = await this.upbitAPI.getOpenOrders(params);
        res.json(orders);
      } catch (error) {
        res.status(500).json({ error: "대기 주문 조회 실패" });
      }
    });

    // API 엔드포인트: 종료된 주문 조회
    this.app.get("/api/orders/closed", async (req, res) => {
      try {
        const params = {
          market: req.query.market as string | undefined,
          state: req.query.state as string | undefined,
          states: req.query.states
            ? (req.query.states as string).split(",")
            : undefined,
          uuids: req.query.uuids
            ? (req.query.uuids as string).split(",")
            : undefined,
          identifiers: req.query.identifiers
            ? (req.query.identifiers as string).split(",")
            : undefined,
          page: req.query.page ? parseInt(req.query.page as string) : undefined,
          limit: req.query.limit
            ? parseInt(req.query.limit as string)
            : undefined,
          order_by: req.query.order_by as string | undefined,
        };

        const orders = await this.upbitAPI.getClosedOrders(params);
        res.json(orders);
      } catch (error) {
        res.status(500).json({ error: "종료된 주문 조회 실패" });
      }
    });

    // API 엔드포인트: 수익률 조회
    this.app.get("/api/profit/:market", (req, res) => {
      try {
        const market = req.params.market;
        const profitRate = this.upbitAPI.getProfitRate(market);
        res.json({ market, profitRate });
      } catch (error) {
        res.status(500).json({ error: "수익률 조회 실패" });
      }
    });

    // API 엔드포인트: 대시보드 데이터 조회 (이전 웹소켓으로 전송하던 데이터)
    this.app.get("/api/dashboard", async (req, res) => {
      try {
        // 계좌 정보
        const accounts = await this.upbitAPI.getAccounts();

        // 마켓 정보 (KRW 마켓만)
        const markets = (await this.upbitAPI.getMarkets())
          .filter((market) => market.market.startsWith("KRW-"))
          .slice(0, 50);

        // 현재가 정보
        const marketCodes = markets.map((m) => m.market).join(",");
        const tickers = await this.upbitAPI.getTicker(marketCodes);

        // 주문 내역
        const orders = await this.upbitAPI.getClosedOrders();

        // 대시보드 데이터 전송
        const data = {
          timestamp: new Date().toISOString(),
          accounts,
          markets,
          tickers,
          orders,
        };

        res.json(data);
      } catch (error) {
        res.status(500).json({ error: "대시보드 데이터 조회 실패" });
      }
    });
  }

  // 서버 시작
  async start(): Promise<void> {
    // 서버 시작
    this.server.listen(this.port, () => {
      console.log(
        `웹 서버가 http://localhost:${this.port} 에서 실행 중입니다.`
      );
    });
  }

  // 서버 중지
  stop(): void {
    if (this.server) {
      this.server.close();
      console.log("웹 서버가 중지되었습니다.");
    }
  }
}
