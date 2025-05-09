import dotenv from "dotenv";
import { join } from "path";

// .env 파일 로드
dotenv.config({ path: join(__dirname, "../.env") });

export const config = {
  upbit: {
    accessKey: process.env.UPBIT_ACCESS_KEY || "",
    secretKey: process.env.UPBIT_SECRET_KEY || "",
    baseUrl: "https://api.upbit.com/v1",
    feeRate: 0.0005, // 업비트 거래 수수료 (기본 0.05%)
    minOrderAmountKRW: 5000, // 최소 주문 금액 (KRW)
    // 대부분의 KRW 마켓 코인은 소수점 8자리까지 지원하나, 마켓별로 다를 수 있음. 필요시 마켓별 설정.
    volumePrecision: 8, // 주문 수량 소수점 자릿수
  },
  trading: {
    // 기존 설정 유지 또는 새로운 퍼센트 기반으로 변경
    tradeAmount: 5200, // 1회 기본 거래 금액 (KRW), 최소 주문 금액 이상이어야 함.
    useBalancePercentage: false, // KRW 잔액의 %를 투자할지 여부
    balancePercentageToInvest: 10, // 투자할 잔액 비율 (%)

    interval: parseInt(process.env.TRADING_INTERVAL || "300000"), // 봇 실행 간격 (밀리초) - 기본값 5분
    delayBetweenMarkets: 150, // 개별 마켓 처리 사이 지연 (ms)

    targetMarkets: [
      "KRW-BTC",
      "KRW-ETH",
      "KRW-SOL",
      "KRW-XRP",
      "KRW-ADA",
      // TEST
      "KRW-DOGE",
      "KRW-BCH",
      "KRW-PENGU",
      "KRW-SUI",
      "KRW-ONDO",
      "KRW-PEPE",
      "KRW-EGLD",
      "KRW-PYTH",
    ], // 거래 대상 마켓 리스트

    // 익절/손절 기준 (순수 퍼센트 값, 예: 3% 익절이면 3.0)
    profitTargetPercent: 2.0, // 목표 수익률 (%)
    stopLossPercent: 1.0, // 손절률 (%)

    printStrategy: process.env.PRINT_STRATEGY === "true", // 전략 출력 여부

    // 기본 전략 파라미터 (개별 전략 실행 시 오버라이드 가능)
    defaultStrategyConfig: {
      candleUnit: parseInt(process.env.CANDLE_UNIT || "5"), // 몇분 봉 캔들 사용할지 - 기본값 5분
      candleCount: 200, // 몇개의 캔들 사용할지
      bollingerPeriod: 20, // 볼린저 밴드 기간
      bollingerStdDev: 2, // 볼린저 밴드 표준편차
      emaShortPeriod: 5, // 단기 EMA 기간
      emaMidPeriod: 10, // 중기 EMA 기간 (추가)
      emaLongPeriod: 20, // 장기 EMA 기간 (기존 13에서 변경 또는 유지)
      rsiPeriod: 14, // RSI 기간
      rsiOverboughtThreshold: 70, // RSI 과매수 임계치
      rsiOversoldThreshold: 30, // RSI 과매도 임계치
      volumeSpikeMultiplier: 2.0, // 거래량 스파이크 배수 (기존 1.5에서 상향 조정 가능)
      buyScoreThreshold: 70, // 일반 매수 결정 최소 점수
      // 단기 고위험 전략용 파라미터 (추가)
      stopLossPercentShortTerm: 1.5, // 예: 1.5%
      profitTargetPercentShortTerm: 3.0, // 예: 3.0%
      buyScoreThresholdShortTerm: 80, // 단기 매매는 더 높은 점수 요구 가능
      sellScoreThresholdShortTerm: 65, // RSI 기반 매도 점수

      // 점수 계산 가중치
      weights: {
        // 매수 관련
        emaGoldenCross: 30,
        bollingerBreakout: 30,
        volumeSpike: 25,
        rsiOversold: 20,
        rsiNeutral: 10, // RSI가 과매도도 과매수도 아닌 적정 범위일 때
        buySynergy: 15, // 주요 매수 조건 동시 충족 (예: EMA골든크로스 + BB상단돌파 + 거래량급증)

        // 매도 관련 (지표 기반)
        rsiOverboughtSell: 60, // RSI 과매수 시 기본 매도 고려 점수
        emaDeadCrossSell: 50, // EMA 데드크로스 시 기본 매도 고려 점수
        sellSynergyRsiEma: 85, // RSI 과매수 + EMA 데드크로스 시너지 시 강력 매도 점수
        sellSynergyEmaBbMiddle: 80, // EMA 데드크로스 + BB중단선 하회 시 강력 매도 점수
      },
    },
  },
  // 추가적인 시스템 설정 (로깅 레벨, 알림 설정 등)
  system: {
    logLevel: process.env.LOG_LEVEL || "info",
  },
};
