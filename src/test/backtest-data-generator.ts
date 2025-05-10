import { UpbitAPI } from "../api/upbit-api";
import * as fs from "fs";
import * as path from "path";
import { config } from "../config";
import { CandleData } from "../types";

class BacktestDataGenerator {
  private upbitAPI: UpbitAPI;
  private readonly market = "KRW-BTC";
  private readonly units = [1, 3, 5]; // 1분봉, 3분봉, 5분봉
  private readonly maxCandlesPerRequest = 200;

  constructor() {
    this.upbitAPI = new UpbitAPI(
      config.upbit.accessKey,
      config.upbit.secretKey
    );
  }

  private async fetchCandles(unit: number, to?: string): Promise<CandleData[]> {
    try {
      return await this.upbitAPI.getMinuteCandles(
        this.market,
        unit,
        this.maxCandlesPerRequest,
        to
      );
    } catch (error) {
      console.error(`캔들 데이터 조회 실패 (${unit}분봉):`, error);
      return [];
    }
  }

  private async fetchAllCandles(unit: number): Promise<CandleData[]> {
    let allCandles: CandleData[] = [];
    let to: string | undefined;
    let idx = 0;

    while (true) {
      if (idx > 500) break;
      console.log(`${unit}분봉 ${idx}번째 캔들 데이터 조회 중...`);
      const candles = await this.fetchCandles(unit, to);
      if (candles.length === 0) break;

      allCandles = [...allCandles, ...candles];

      // 마지막 캔들의 시간을 다음 요청의 기준 시간으로 설정
      const lastCandle = candles[candles.length - 1];
      to = lastCandle.candle_date_time_utc;
      idx++;

      // 잠시 대기 (API 호출 제한 고려)
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    return allCandles;
  }

  private saveToCSV(candles: CandleData[], unit: number): void {
    const headers = [
      "market",
      "candle_date_time_utc",
      "candle_date_time_kst",
      "opening_price",
      "high_price",
      "low_price",
      "trade_price",
      "timestamp",
      "candle_acc_trade_price",
      "candle_acc_trade_volume",
      "unit",
    ].join(",");

    const rows = candles.map((candle) =>
      [
        candle.market,
        candle.candle_date_time_utc,
        candle.candle_date_time_kst,
        candle.opening_price,
        candle.high_price,
        candle.low_price,
        candle.trade_price,
        candle.timestamp,
        candle.candle_acc_trade_price,
        candle.candle_acc_trade_volume,
        candle.unit,
      ].join(",")
    );

    const csvContent = [headers, ...rows].join("\n");
    const fileName = `data/BTC_${unit}min_candles.csv`;
    const filePath = path.join(__dirname, fileName);

    fs.writeFileSync(filePath, csvContent);
    console.log(
      `${fileName} 파일이 생성되었습니다. (${candles.length}개의 캔들)`
    );
  }

  public async generateBacktestData(): Promise<void> {
    for (const unit of this.units) {
      console.log(`${unit}분봉 데이터 수집 시작...`);
      const candles = await this.fetchAllCandles(unit);
      this.saveToCSV(candles, unit);
    }
  }
}

// 실행
const generator = new BacktestDataGenerator();
generator.generateBacktestData().catch(console.error);
