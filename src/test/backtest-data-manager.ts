import * as fs from "fs";
import * as path from "path";
import { BacktestCandleData } from "./types"; // 백테스팅용 타입 사용
import { parse } from "csv-parse/sync";

export class BacktestDataManager {
  private allCandles: Record<string, BacktestCandleData[]> = {}; // market_unit -> CandleData[]

  constructor() {}

  public async loadCandlesFromCSV(
    market: string,
    unit: number, // unit은 CSV 파일명이나 키 생성에 사용될 수 있음
    csvFilePath: string // 전체 경로를 받도록 변경
  ): Promise<void> {
    // const fullPath = path.resolve(filePath); // filePath가 이미 절대경로이거나, 호출하는 쪽에서 resolve 가정
    console.log(`[BacktestDataManager] Loading candles from: ${csvFilePath}`);
    try {
      const csvContent = fs.readFileSync(csvFilePath, "utf-8");

      const records: any[] = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: (value, context) => {
          if (context.header) return value; // 헤더는 그대로 반환
          // 숫자형으로 변환해야 할 컬럼들
          if (
            [
              "opening_price",
              "high_price",
              "low_price",
              "trade_price",
              "candle_acc_trade_price",
              "candle_acc_trade_volume",
            ].includes(context.column as string)
          ) {
            return parseFloat(value);
          }
          if (["timestamp", "unit"].includes(context.column as string)) {
            return parseInt(value, 10);
          }
          return value;
        },
      });

      // unit 정보가 CSV에 없다면, 파라미터로 받은 unit을 사용하거나, market_unit 키에서 추출
      const candles: BacktestCandleData[] = records
        .map((row: any) => ({
          market: row.market,
          candle_date_time_utc: row.candle_date_time_utc,
          candle_date_time_kst: row.candle_date_time_kst,
          opening_price: row.opening_price,
          high_price: row.high_price,
          low_price: row.low_price,
          trade_price: row.trade_price,
          timestamp: row.timestamp,
          candle_acc_trade_price: row.candle_acc_trade_price,
          candle_acc_trade_volume: row.candle_acc_trade_volume,
          unit: row.unit || unit, // CSV에 unit이 없으면 파라미터 unit 사용
        }))
        .sort(
          (a, b) => a.timestamp - b.timestamp // timestamp 기준으로 정렬
        );

      const key = `${market}_${unit}`; // 또는 CSV 파일명에서 유닛을 파싱하여 사용
      this.allCandles[key] = candles;
      console.log(
        `[BacktestDataManager] Loaded ${candles.length} candles for ${key} from ${csvFilePath}`
      );
    } catch (error) {
      console.error(
        `[BacktestDataManager] Error loading candles from ${csvFilePath}:`,
        error
      );
      throw error;
    }
  }

  /**
   * 백테스팅 시뮬레이션의 특정 시점(endIndex)까지의 캔들 데이터를 반환합니다.
   * API 응답처럼 최신 데이터가 배열의 0번째 인덱스에 오도록 역정렬합니다.
   * @param market 마켓 코드 (e.g., "KRW-BTC")
   * @param unit 캔들 단위 (e.g., 1, 5, 15)
   * @param count 가져올 캔들 개수
   * @param endIndex 현재 시뮬레이션 중인 캔들의 인덱스 (이 인덱스를 포함한 과거 데이터 반환)
   */
  public getCandles(
    market: string,
    unit: number,
    count: number,
    endIndex: number
  ): BacktestCandleData[] {
    const key = `${market}_${unit}`;
    const candlesForKey = this.allCandles[key];

    if (!candlesForKey || candlesForKey.length === 0 || endIndex < 0) {
      return [];
    }

    const actualEndIndex = Math.min(endIndex, candlesForKey.length - 1);
    const startIndex = Math.max(0, actualEndIndex - count + 1);
    const result = candlesForKey.slice(startIndex, actualEndIndex + 1);

    return [...result].reverse(); // 원본 배열 변경 방지를 위해 복사 후 역정렬
  }

  /**
   * 특정 마켓과 유닛에 대해 로드된 모든 캔들 데이터를 시간순으로 반환합니다.
   * 백테스팅 루프에서 전체 데이터를 순회할 때 사용합니다.
   */
  public getAllLoadedCandles(
    market: string,
    unit: number
  ): BacktestCandleData[] {
    const key = `${market}_${unit}`;
    return this.allCandles[key] || [];
  }
}
