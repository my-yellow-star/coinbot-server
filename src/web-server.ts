import cors from "cors";
import express, { RequestHandler } from "express";
import * as http from "http";
import axios from "axios";

import { TradingBot } from "./trading-bot";
import { UpbitAPI } from "./api/upbit-api";
import { DataManager } from "./core/data-manager";
import { PortfolioManager } from "./core/portfolio-manager";
import { OrderHistory } from "./types";

export class WebServer {
  private app: express.Application;
  private server: http.Server;
  private port: number;
  private tradingBot: TradingBot;
  private dataManager: DataManager;
  private portfolioManager: PortfolioManager;
  private upbitAPIForDirectOrder: UpbitAPI;

  constructor(traidingBot: TradingBot, port: number = 8080) {
    this.port = port;
    this.tradingBot = traidingBot;
    this.dataManager = this.tradingBot.getDataManager();
    this.portfolioManager = this.tradingBot.getPortfolioManager();
    this.upbitAPIForDirectOrder = this.tradingBot.getUpbitAPI();

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
    this.app.get("/api/accounts", (async (req, res) => {
      try {
        const accounts = await this.dataManager.getAccounts();
        res.json(accounts);
      } catch (error) {
        res.status(500).json({ error: "계좌 정보 조회 실패" });
      }
    }) as RequestHandler);

    // API 엔드포인트: 마켓 정보 조회
    this.app.get("/api/markets", (async (req, res) => {
      try {
        const markets = await this.dataManager.getMarkets();
        res.json(markets);
      } catch (error) {
        res.status(500).json({ error: "마켓 정보 조회 실패" });
      }
    }) as RequestHandler);

    // API 엔드포인트: 대기 주문 조회
    this.app.get("/api/orders/open", (async (req, res) => {
      try {
        const params: Parameters<UpbitAPI["getOpenOrders"]>[0] = {
          market: req.query.market as string | undefined,
          page: req.query.page ? parseInt(req.query.page as string) : undefined,
          limit: req.query.limit
            ? parseInt(req.query.limit as string)
            : undefined,
          order_by: req.query.order_by as string | undefined,
        };
        if (req.query.state) {
          params.state = req.query.state as string;
        }
        if (req.query.states) {
          params.states = (req.query.states as string).split(",");
        }

        const orders = await this.dataManager.getOpenOrders(params);
        res.json(orders);
      } catch (error) {
        res.status(500).json({ error: "대기 주문 조회 실패" });
      }
    }) as RequestHandler);

    // API 엔드포인트: 종료된 주문 조회
    this.app.get("/api/orders/closed", (async (req, res) => {
      try {
        const params: Parameters<UpbitAPI["getClosedOrders"]>[0] = {
          market: req.query.market as string | undefined,
          uuids: req.query.uuids
            ? (req.query.uuids as string).split(",")
            : undefined,
          page: req.query.page ? parseInt(req.query.page as string) : undefined,
          limit: req.query.limit
            ? parseInt(req.query.limit as string)
            : undefined,
          order_by: req.query.order_by as string | undefined,
        };
        if (req.query.state) {
          const validStates: OrderHistory["state"][] = ["done", "cancel"];
          if (validStates.includes(req.query.state as OrderHistory["state"])) {
            params.state = req.query.state as OrderHistory["state"];
          } else if (req.query.state) {
            console.warn(
              `Invalid state value for closed orders: ${req.query.state}`
            );
          }
        }
        if (req.query.states) {
          params.states = (req.query.states as string).split(
            ","
          ) as OrderHistory["state"][];
        }

        const orders = await this.dataManager.getClosedOrders(params);
        res.json(orders);
      } catch (error) {
        res.status(500).json({ error: "종료된 주문 조회 실패" });
      }
    }) as RequestHandler);

    // API 엔드포인트: 수익률 조회
    this.app.get("/api/profit/:market", (async (req, res) => {
      try {
        const market = req.params.market;
        const profitRate = await this.portfolioManager.getCurrentProfitRate(
          market
        );
        res.json({ market, profitRate });
      } catch (error) {
        res.status(500).json({ error: "수익률 조회 실패" });
      }
    }) as RequestHandler);

    // API 엔드포인트: 대시보드 데이터 조회
    this.app.get("/api/dashboard", (async (req, res) => {
      try {
        const accounts = await this.dataManager.getAccounts();
        const allMarkets = await this.dataManager.getMarkets();
        const krwMarkets = allMarkets.filter((market) =>
          market.market.startsWith("KRW-")
        );
        const marketCodes = krwMarkets.map((m) => m.market).join(",");

        let tickers: any[] = [];
        if (marketCodes) {
          tickers = await this.dataManager.getTicker(marketCodes);
        }

        const closedOrders = await this.dataManager.getClosedOrders({});

        const data = {
          timestamp: new Date().toISOString(),
          accounts,
          markets: krwMarkets,
          tickers,
          orders: closedOrders,
        };

        res.json(data);
      } catch (error) {
        res.status(500).json({ error: "대시보드 데이터 조회 실패" });
      }
    }) as RequestHandler);

    this.app.get("/api/market", (async (req, res) => {
      try {
        const query = req.query.market as string;
        const markets = await this.dataManager.getMarkets();
        const market = markets.find((m) => m.market === query);
        res.json(market);
      } catch (error) {
        res.status(500).json({ error: "마켓 정보 조회 실패" });
      }
    }) as RequestHandler);

    // API 엔드포인트: 현재가 조회
    this.app.get("/api/ticker", (async (req, res) => {
      try {
        const market = req.query.market as string;
        if (!market) {
          return res
            .status(400)
            .json({ error: "market 파라미터가 필요합니다." });
        }
        const ticker = await this.dataManager.getTicker(market);
        res.json(ticker[0]);
      } catch (error) {
        res.status(500).json({ error: "현재가 조회 실패" });
      }
    }) as RequestHandler);

    // API 엔드포인트: 분 캔들 데이터 조회
    this.app.get("/api/candles/minutes/:unit", (async (req, res) => {
      try {
        const unit = parseInt(req.params.unit as string);
        const market = req.query.market as string;
        const count = req.query.count
          ? parseInt(req.query.count as string)
          : 200;

        if (!market) {
          return res
            .status(400)
            .json({ error: "market 파라미터가 필요합니다" });
        }

        const candles = await this.dataManager.getCandles(market, unit, count);
        res.json(candles);
      } catch (error) {
        res.status(500).json({ error: "캔들 데이터 조회 실패" });
      }
    }) as RequestHandler);

    // API 엔드포인트: 주문하기
    this.app.post("/api/orders", (async (req, res) => {
      try {
        const { market, side, volume, price, ord_type } = req.body;

        if (!market || !side || !ord_type) {
          return res.status(400).json({
            error: "필수 파라미터가 누락되었습니다. (market, side, ord_type)",
          });
        }
        if (ord_type === "limit" && (!price || !volume)) {
          return res
            .status(400)
            .json({ error: "지정가 주문에는 price와 volume이 필요합니다" });
        }
        if (ord_type === "price" && !price) {
          return res
            .status(400)
            .json({ error: "시장가 매수 주문에는 price(총액)가 필요합니다" });
        }
        if (ord_type === "market" && !volume) {
          return res
            .status(400)
            .json({ error: "시장가 매도 주문에는 volume이 필요합니다" });
        }

        const order = {
          market,
          side,
          volume,
          price,
          ord_type,
          time_in_force: req.body.time_in_force,
        };

        const result = await this.upbitAPIForDirectOrder.createOrder(order);
        res.status(201).json(result);
      } catch (error) {
        console.error("주문 처리 실패:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "주문 처리 중 오류가 발생했습니다";
        if (
          axios.isAxiosError(error) &&
          error.response &&
          error.response.data &&
          error.response.data.error
        ) {
          return res
            .status(error.response.status || 500)
            .json(error.response.data);
        }
        res.status(500).json({ error: errorMessage });
      }
    }) as RequestHandler);
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
