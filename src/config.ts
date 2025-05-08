import dotenv from "dotenv";
import { join } from "path";

// .env 파일 로드
dotenv.config({ path: join(__dirname, "../.env") });

export const config = {
  upbit: {
    accessKey: process.env.UPBIT_ACCESS_KEY || "",
    secretKey: process.env.UPBIT_SECRET_KEY || "",
    baseUrl: "https://api.upbit.com/v1",
  },
  trading: {
    tradeAmount: parseInt(process.env.TRADE_AMOUNT || "10000"), // 기본 거래 금액 (원)
    interval: parseInt(process.env.INTERVAL || "60000"), // 봇 실행 간격 (밀리초)
    profitRate: parseFloat(process.env.PROFIT_RATE || "1.03"), // 목표 수익률
    stopLossRate: parseFloat(process.env.STOP_LOSS_RATE || "0.95"), // 손절 비율
  },
};
