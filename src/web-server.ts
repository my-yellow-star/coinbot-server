import express, { Request } from "express";
import cors from "cors";
import * as http from "http";
import * as path from "path";
import expressWs from "express-ws";
import { TradingServer } from "./server";
import fs from "fs";
import WebSocket from "ws";
import { UpbitAPI } from "./upbit-api";

export class WebServer {
  private app: express.Application & { ws?: any };
  private server: http.Server;
  private port: number;
  private tradingServer: TradingServer;
  private clients: Set<WebSocket> = new Set();
  private updateInterval: NodeJS.Timeout | null = null;
  private wss: WebSocket.Server;
  private upbitAPI: UpbitAPI;

  constructor(
    tradingServer: TradingServer,
    port: number = 3000,
    upbitAPI?: UpbitAPI
  ) {
    this.port = port;
    this.tradingServer = tradingServer;
    // tradingServer의 API를 사용하거나 별도로 제공된 upbitAPI를 사용
    this.upbitAPI = upbitAPI || this.tradingServer.getAPI();

    // Express 앱 생성
    this.app = express();
    this.server = http.createServer(this.app);

    // WebSocket 설정
    const wsInstance = expressWs(this.app, this.server);
    this.app = wsInstance.app;
    this.wss = wsInstance.getWss();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebsocket();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, "../public")));
  }

  private setupRoutes(): void {
    // 정적 파일 제공
    this.app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/index.html"));
    });

    // API 엔드포인트: 계좌 정보 조회
    this.app.get("/api/accounts", async (req, res) => {
      try {
        const accounts = await this.tradingServer.getAPI().getAccounts();
        res.json(accounts);
      } catch (error) {
        res.status(500).json({ error: "계좌 정보 조회 실패" });
      }
    });

    // API 엔드포인트: 마켓 정보 조회
    this.app.get("/api/markets", async (req, res) => {
      try {
        const markets = await this.tradingServer.getAPI().getMarkets();
        res.json(markets);
      } catch (error) {
        res.status(500).json({ error: "마켓 정보 조회 실패" });
      }
    });

    // API 엔드포인트: 주문 내역 조회
    this.app.get("/api/orders", async (req, res) => {
      try {
        const market = req.query.market as string | undefined;
        const orders = await this.tradingServer.getAPI().getOrders(market);
        res.json(orders);
      } catch (error) {
        res.status(500).json({ error: "주문 내역 조회 실패" });
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

        const orders = await this.tradingServer.getAPI().getOpenOrders(params);
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

        const orders = await this.tradingServer
          .getAPI()
          .getClosedOrders(params);
        res.json(orders);
      } catch (error) {
        res.status(500).json({ error: "종료된 주문 조회 실패" });
      }
    });

    // API 엔드포인트: 수익률 조회
    this.app.get("/api/profit/:market", (req, res) => {
      try {
        const market = req.params.market;
        const profitRate = this.tradingServer.getAPI().getProfitRate(market);
        res.json({ market, profitRate });
      } catch (error) {
        res.status(500).json({ error: "수익률 조회 실패" });
      }
    });
  }

  private setupWebsocket(): void {
    // WebSocket 연결 핸들러
    this.app.ws("/ws", (ws: WebSocket, req: Request) => {
      // 새 클라이언트 추가
      this.clients.add(ws);
      console.log("새 클라이언트 연결됨. 현재 연결 수:", this.clients.size);

      // 연결 즉시 초기 데이터 전송
      this.sendInitialData(ws);

      // 연결 종료 시 클라이언트 제거
      ws.on("close", () => {
        this.clients.delete(ws);
        console.log("클라이언트 연결 종료. 현재 연결 수:", this.clients.size);
      });
    });

    // 주기적으로 모든 클라이언트에게 업데이트 데이터 전송
    this.updateInterval = setInterval(async () => {
      if (this.clients.size === 0) return;

      try {
        await this.broadcastUpdates();
      } catch (error) {
        console.error("데이터 브로드캐스트 중 오류:", error);
      }
    }, 2000); // 2초마다 업데이트
  }

  // 초기 데이터 전송
  private async sendInitialData(ws: WebSocket): Promise<void> {
    try {
      // 계좌 정보
      const accounts = await this.tradingServer.getAPI().getAccounts();

      // 마켓 정보 (KRW 마켓만)
      const markets = (await this.tradingServer.getAPI().getMarkets()).filter(
        (market) => market.market.startsWith("KRW-")
      );

      // 현재가 정보
      const marketCodes = markets.map((m) => m.market).join(",");
      const tickers = await this.tradingServer.getAPI().getTicker(marketCodes);

      // 주문 내역
      const orders = await this.tradingServer.getAPI().getOrders();

      // 업데이트 데이터 전송
      const data = {
        timestamp: new Date().toISOString(),
        accounts,
        markets,
        tickers,
        orders,
      };

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    } catch (error) {
      console.error("초기 데이터 전송 중 오류:", error);
    }
  }

  // 모든 클라이언트에게 업데이트 전송
  private async broadcastUpdates(): Promise<void> {
    // 계좌 정보
    const accounts = await this.tradingServer.getAPI().getAccounts();

    // 마켓 정보 (KRW 마켓만)
    const markets = (await this.tradingServer.getAPI().getMarkets())
      .filter((market) => market.market.startsWith("KRW-"))
      .slice(0, 10); // 상위 10개만

    // 현재가 정보
    const marketCodes = markets.map((m) => m.market).join(",");
    const tickers = await this.tradingServer.getAPI().getTicker(marketCodes);

    // 주문 내역
    const orders = await this.tradingServer.getAPI().getOrders();

    // 모든 클라이언트에게 업데이트 데이터 전송
    const data = {
      timestamp: new Date().toISOString(),
      type: "update",
      accounts,
      markets,
      tickers,
      orders,
    };

    this.broadcastToAll(data);
  }

  private broadcastToAll(data: any): void {
    const message = JSON.stringify(data);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // 서버 시작
  async start(): Promise<void> {
    // HTML 파일 생성 제거

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

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}
