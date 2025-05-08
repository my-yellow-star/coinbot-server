# 업비트 코인 자동 매매 프로그램

업비트 API를 이용한 암호화폐 자동 매매 프로그램입니다. TypeScript와 Node.js를 기반으로 개발되었습니다.

## 기능

- 업비트 API를 이용한 계좌 정보 조회
- 실시간 시세 정보 및 캔들 데이터 조회
- 다양한 전략 기반의 매매 신호 생성
- 자동 주문 실행 시스템

## 설치 방법

1. 저장소 클론

```bash
git clone https://github.com/yourusername/coin-bot.git
cd coin-bot
```

2. 의존성 설치

```bash
npm install
```

3. 환경 변수 설정
   `.env` 파일을 프로젝트 루트 디렉토리에 생성하고 다음 값들을 설정합니다:

```
UPBIT_ACCESS_KEY=YOUR_ACCESS_KEY
UPBIT_SECRET_KEY=YOUR_SECRET_KEY
TRADE_AMOUNT=10000  # 기본 매수 금액 (원)
INTERVAL=60000      # 시세 체크 주기 (밀리초)
PROFIT_RATE=1.03    # 목표 수익률 (3%)
STOP_LOSS_RATE=0.95 # 손절 비율 (5%)
```

## 실행 방법

1. 개발 모드 실행

```bash
npm run dev
```

2. 빌드 후 실행

```bash
npm run build
npm start
```

3. 변경 사항 감지 모드 실행 (개발용)

```bash
npm run watch
```

## 프로젝트 구조

- `src/`
  - `config.ts` - 설정 및 환경 변수 관리
  - `types.ts` - 타입스크립트 인터페이스 정의
  - `upbit-api.ts` - 업비트 API 호출 클래스
  - `strategy.ts` - 거래 전략 구현
  - `server.ts` - 자동 거래 서버 구현
  - `index.ts` - 메인 프로그램 진입점

## 주의 사항

- 실제 돈을 거래하는 프로그램이므로 테스트를 충분히 한 후 사용하세요.
- 가상 화폐 투자는 높은 위험을 수반하며, 이 프로그램을 사용해 발생하는 어떠한 손실에도 개발자는 책임을 지지 않습니다.

## 라이센스

ISC
