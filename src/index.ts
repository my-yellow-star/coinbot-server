import { TradingServer } from "./server";
import { MockUpbitAPI } from "./mock-api";
import { WebServer } from "./web-server";
import { UpbitAPI } from "./upbit-api";
async function main() {
  try {
    // UpbitAPI 인스턴스 생성
    // const upbitAPI = new UpbitAPI();
    const upbitAPI = new MockUpbitAPI();

    // 트레이딩 서버 생성 및 시작
    const tradingServer = new TradingServer(upbitAPI);
    await tradingServer.start();
    console.log("트레이딩 서버가 시작되었습니다.");

    // 웹 모니터링 서버 생성 및 시작
    const webServer = new WebServer(tradingServer, 3000);
    await webServer.start();
    console.log("웹 모니터링 대시보드: http://localhost:3000");

    // 프로세스 종료 시 서버 정리
    process.on("SIGINT", async () => {
      console.log("프로그램을 종료합니다...");
      tradingServer.stop();
      webServer.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("프로그램을 종료합니다...");
      tradingServer.stop();
      webServer.stop();
      process.exit(0);
    });

    console.log("자동 트레이딩이 실행 중입니다. 종료하려면 Ctrl+C를 누르세요.");
  } catch (error) {
    console.error("프로그램 실행 중 오류가 발생했습니다:", error);
    process.exit(1);
  }
}

main();
