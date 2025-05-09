import { Router } from "express";
import {
  getAllLatestSignalLogsController,
  getMarketSignalHistoryController,
} from "../controllers/signal.controller";

const router = Router();

// 코인 별 현재 (가장 최신) 매수/매도 점수, reason 목록
// GET /api/signals/latest
router.get("/latest", getAllLatestSignalLogsController);

// 특정 코인 별 점수 추이 (최근 N번)
// GET /api/signals/:market/history?limit=50
router.get("/:market/history", getMarketSignalHistoryController);

export default router;
