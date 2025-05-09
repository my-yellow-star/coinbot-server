import fs from "fs/promises";
import path from "path";
import { SignalLog } from "../types";

const LOG_DIR = path.join(__dirname, "..", "..", "data", "signal_logs");
const MAX_LOGS_PER_FILE = 500; // 파일당 최대 로그 수 (추후 점수 추이 50개 요구사항에 맞춰 조정 가능)

/**
 * 로그 디렉토리가 없으면 생성합니다.
 */
async function ensureLogDirExists(): Promise<void> {
  try {
    await fs.access(LOG_DIR);
  } catch (error) {
    await fs.mkdir(LOG_DIR, { recursive: true });
  }
}

/**
 * 특정 마켓의 로그 파일 경로를 반환합니다.
 * @param market 마켓 코드 (예: "KRW-BTC")
 * @returns 로그 파일 경로
 */
function getLogFilePath(market: string): string {
  return path.join(LOG_DIR, `${market}.json`);
}

/**
 * 새로운 신호 분석 로그를 파일에 추가합니다.
 * @param log 저장할 SignalLog 객체
 */
export async function addSignalLog(log: SignalLog): Promise<void> {
  await ensureLogDirExists();
  const filePath = getLogFilePath(log.market);
  let logs: SignalLog[] = [];

  try {
    const data = await fs.readFile(filePath, "utf-8");
    logs = JSON.parse(data);
  } catch (error) {
    // 파일이 없거나 읽기 오류 시 새로운 로그 배열로 시작
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Error reading log file ${filePath}:`, error);
      // 오류 발생 시에도 일단 진행 (새 파일 생성 시도)
    }
  }

  logs.unshift(log); // 새 로그를 배열 맨 앞에 추가
  if (logs.length > MAX_LOGS_PER_FILE) {
    logs = logs.slice(0, MAX_LOGS_PER_FILE); // 최대 로그 수 유지
  }

  try {
    await fs.writeFile(filePath, JSON.stringify(logs, null, 2), "utf-8");
  } catch (error) {
    console.error(`Error writing log file ${filePath}:`, error);
  }
}

/**
 * 특정 마켓의 최근 신호 분석 로그를 가져옵니다.
 * @param market 마켓 코드
 * @returns 가장 최근 SignalLog 객체 또는 null
 */
export async function getLatestSignalLog(
  market: string
): Promise<SignalLog | null> {
  await ensureLogDirExists();
  const filePath = getLogFilePath(market);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const logs: SignalLog[] = JSON.parse(data);
    return logs.length > 0 ? logs[0] : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(
        `Error reading log file for latest log ${filePath}:`,
        error
      );
    }
    return null;
  }
}

/**
 * 특정 마켓의 신호 분석 로그 목록을 가져옵니다.
 * @param market 마켓 코드
 * @param limit 가져올 로그 개수 (기본값 50)
 * @returns SignalLog 객체 배열
 */
export async function getSignalLogs(
  market: string,
  limit: number = 50
): Promise<SignalLog[]> {
  await ensureLogDirExists();
  const filePath = getLogFilePath(market);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const logs: SignalLog[] = JSON.parse(data);
    return logs.slice(0, limit);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Error reading log file for logs list ${filePath}:`, error);
    }
    return [];
  }
}

/**
 * 모든 마켓의 가장 최근 신호 분석 로그를 가져옵니다.
 * @returns 마켓 코드를 키로, 최신 SignalLog를 값으로 가지는 객체
 */
export async function getAllLatestSignalLogs(): Promise<
  Record<string, SignalLog | null>
> {
  await ensureLogDirExists();
  const result: Record<string, SignalLog | null> = {};
  try {
    const files = await fs.readdir(LOG_DIR);
    for (const file of files) {
      if (path.extname(file) === ".json") {
        const market = path.basename(file, ".json");
        const latestLog = await getLatestSignalLog(market);
        result[market] = latestLog;
      }
    }
  } catch (error) {
    console.error("Error reading log directory for all latest logs:", error);
  }
  return result;
}
