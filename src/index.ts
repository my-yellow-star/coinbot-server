import { TradingBot } from "./trading-bot";
import { WebServer } from "./web-server";
async function main() {
  try {
    // 트레이딩 서버 생성 및 시작
    const tradingBot = new TradingBot(true, true);
    // await tradingBot.start();

    // 웹 모니터링 서버 생성 및 시작
    const webServer = new WebServer(tradingBot, 8080);
    await webServer.start();

    // 프로세스 종료 시 서버 정리
    process.on("SIGINT", async () => {
      console.log("프로그램을 종료합니다...");
      tradingBot.stop();
      webServer.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("프로그램을 종료합니다...");
      tradingBot.stop();
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
