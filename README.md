# Upbit Cryptocurrency Trading Bot

An automated cryptocurrency trading bot using the Upbit API. Built with TypeScript and Node.js.

## Features

- Account information retrieval via Upbit API
- Real-time market price and candle data monitoring
- Trading signal generation based on various strategies
- Automated order execution system
- Web server for monitoring trading activities
- Backtesting system for strategy evaluation
- Mock API for development and testing

## System Architecture

The system consists of three main components:
- **Trading Bot**: Core engine that handles market data analysis and trade execution
- **Web Server**: Monitoring interface that provides real-time updates on trading activities
- **Backtesting Engine**: Simulation environment for testing trading strategies with historical data

## Technology Stack

- **Backend**: Node.js, TypeScript, Express
- **API Integration**: Upbit API for cryptocurrency trading
- **Real-time Communication**: WebSockets
- **Authentication**: JWT for API security
- **Data Processing**: Custom trading algorithms and strategies

## Installation

1. Clone the repository

```bash
git clone <repository-url>
cd coinbot-server
```

2. Install dependencies

```bash
npm install
```

3. Configure environment variables
   Create a `.env` file in the project root directory with the following values:

```
UPBIT_ACCESS_KEY=YOUR_ACCESS_KEY
UPBIT_SECRET_KEY=YOUR_SECRET_KEY
TRADE_AMOUNT=10000  # Base purchase amount (KRW)
TRADE_INTERVAL=60000      # Market check interval (milliseconds)
PROFIT_RATE=1.03    # Target profit rate (3%)
STOP_LOSS_RATE=0.95 # Stop loss rate (5%)
```

## Usage

1. Development mode

```bash
npm run dev
```

2. Build and run

```bash
npm run build
npm start
```

3. Watch mode for development

```bash
npm run watch
```

## Project Structure

```
src/
├── api/           # API integration modules
├── controllers/   # Request handlers
├── core/          # Core trading logic
├── routes/        # API endpoints
├── services/      # Business logic services
├── test/          # Test and backtesting modules
├── config.ts      # Configuration and environment variables
├── index.ts       # Main application entry point
├── trading-bot.ts # Trading bot implementation
├── strategy.ts    # Trading strategies
├── types.ts       # TypeScript interfaces and types
└── web-server.ts  # Web monitoring server
```

## Backtesting System

The bot includes a comprehensive backtesting system that allows you to evaluate trading strategies using historical data without risking real funds.

### Backtesting Features

- Historical data simulation with customizable time ranges
- Strategy performance evaluation with detailed metrics
- Risk management simulation
- Portfolio performance tracking
- Trade visualization and reporting

### How to Run a Backtest

To run a backtest on your strategy:

```bash
# Run backtest with default parameters
npm run backtest

# Run backtest with custom parameters
npm run backtest -- --strategy=macd --period=30 --initialFunds=1000000
```

## Mock API System

For development and testing purposes, the system includes a Mock API that simulates the Upbit exchange API without making actual trades.

### Mock API Features

- Simulated account balances and order execution
- Realistic price fluctuations based on historical patterns
- Configurable market behavior and volatility
- Seamless switch between mock and real API environments

### Using the Mock API

The Mock API is enabled by default in development mode. To use it:

```javascript
// Set the USE_MOCK_API environment variable to true in your .env file
USE_MOCK_API=true

// Or configure it programmatically
import { config } from './src/config';
config.useMockApi = true;
```

## Warning

- This program trades with real money. Test thoroughly before use.
- Cryptocurrency investment involves high risk. The developer is not responsible for any losses incurred while using this program.

## License

ISC
