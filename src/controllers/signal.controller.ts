import { Request, Response } from "express";
import {
  getAllLatestSignalLogs,
  getSignalLogs,
} from "../services/signalLog.service";

export async function getAllLatestSignalLogsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const latestLogs = await getAllLatestSignalLogs();
    res.status(200).json(latestLogs);
  } catch (error) {
    console.error("Error in getAllLatestSignalLogsController:", error);
    res.status(500).json({ message: "Failed to retrieve latest signal logs" });
  }
}

export async function getMarketSignalHistoryController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const market = req.params.market;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 50;

    if (!market) {
      res.status(400).json({ message: "Market parameter is required" });
      return;
    }

    if (isNaN(limit) || limit <= 0) {
      res
        .status(400)
        .json({ message: "Limit parameter must be a positive number" });
      return;
    }

    const historyLogs = await getSignalLogs(market, limit);
    res.status(200).json(historyLogs);
  } catch (error) {
    console.error("Error in getMarketSignalHistoryController:", error);
    res.status(500).json({ message: "Failed to retrieve signal history" });
  }
}
