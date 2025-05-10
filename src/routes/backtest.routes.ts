import { RequestHandler, Router } from "express";
import { Backtester } from "../test/backtester";
import { BacktestStrategyConfig } from "../test/types";

const router = Router();

router.post("/run", (async (req, res) => {
  try {
    const { market, unit, csvRelativePath, strategyConfig } = req.body as {
      market: string;
      unit: number;
      csvRelativePath: string;
      strategyConfig?: Partial<BacktestStrategyConfig>;
    };

    if (!market || unit === undefined || !csvRelativePath) {
      return res.status(400).json({
        error:
          "필수 파라미터가 누락되었습니다. (market, unit, csvRelativePath)",
      });
    }

    // csvRelativePath는 server/src/test/ 디렉토리 기준이어야 합니다.
    // 예: "data/BTC_1min_candles.csv"
    // Backtester 내부에서 path.join(__dirname, csvRelativePath)을 사용하므로
    // __dirname은 backtester.ts의 위치인 server/src/test/가 됩니다.
    // 따라서 클라이언트에서 "data/BTC_1min_candles.csv" 형태로 보내면 됩니다.

    const backtester = new Backtester(strategyConfig); // Pass full or partial config
    const result = await backtester.run(
      market,
      unit,
      csvRelativePath,
      strategyConfig // run 메서드에도 전달하여 기본값 오버라이드 가능
    );
    res.json(result);
  } catch (error: any) {
    console.error("[Backtest API Error]", error);
    res.status(500).json({ error: `백테스팅 실행 실패: ${error.message}` });
  }
}) as RequestHandler);

export default router;
