/**
 * 차트 관련 기능을 담당하는 모듈
 */
class ChartService {
  constructor() {
    this.balanceChart = null;
    this.ordersChart = null;
    this.profitChart = null;
    this.priceChart = null;
    this.chartColors = [
      "rgba(54, 162, 235, 0.8)",
      "rgba(255, 99, 132, 0.8)",
      "rgba(75, 192, 192, 0.8)",
      "rgba(255, 159, 64, 0.8)",
      "rgba(153, 102, 255, 0.8)",
      "rgba(255, 205, 86, 0.8)",
      "rgba(201, 203, 207, 0.8)",
    ];
  }

  /**
   * 자산 분포 차트를 초기화하거나 업데이트합니다.
   * @param {Array} accounts - 계좌 정보 배열
   */
  updateBalanceChart(accounts) {
    const ctx = document.getElementById("balanceChart");
    if (!ctx) return;

    // 자산 종류별 합계 계산
    const assetData = {};
    const nonZeroAccounts = accounts.filter(
      (acc) => parseFloat(acc.balance) > 0
    );

    nonZeroAccounts.forEach((acc) => {
      if (acc.currency === "KRW") {
        assetData["KRW"] = parseFloat(acc.balance);
      } else {
        assetData[acc.currency] =
          parseFloat(acc.balance) * parseFloat(acc.avg_buy_price);
      }
    });

    const labels = Object.keys(assetData);
    const data = Object.values(assetData);

    if (this.balanceChart) {
      this.balanceChart.data.labels = labels;
      this.balanceChart.data.datasets[0].data = data;
      this.balanceChart.update();
    } else {
      this.balanceChart = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: labels,
          datasets: [
            {
              data: data,
              backgroundColor: this.chartColors,
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "right",
              labels: {
                color: "#333",
              },
            },
            title: {
              display: true,
              text: "자산 분포",
              color: "#333",
              font: {
                size: 16,
              },
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const label = context.label || "";
                  const value = context.raw;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = Math.round((value / total) * 100);
                  return `${label}: ${formatKRW(value)} (${percentage}%)`;
                },
              },
            },
          },
        },
      });
    }
  }

  /**
   * 주문 내역 차트를 초기화하거나 업데이트합니다.
   * @param {Array} orders - 주문 내역 배열
   */
  updateOrdersChart(orders) {
    const ctx = document.getElementById("ordersChart");
    if (!ctx || !orders || orders.length === 0) return;

    // 일자별 매수/매도 금액 계산
    const ordersByDate = {};

    orders.forEach((order) => {
      const date = new Date(order.created_at).toLocaleDateString();

      if (!ordersByDate[date]) {
        ordersByDate[date] = { buy: 0, sell: 0 };
      }

      const amount = order.price * order.executed_volume;

      if (order.side === "bid") {
        ordersByDate[date].buy += amount;
      } else {
        ordersByDate[date].sell += amount;
      }
    });

    const labels = Object.keys(ordersByDate);
    const buyData = labels.map((date) => ordersByDate[date].buy);
    const sellData = labels.map((date) => ordersByDate[date].sell);

    if (this.ordersChart) {
      this.ordersChart.data.labels = labels;
      this.ordersChart.data.datasets[0].data = buyData;
      this.ordersChart.data.datasets[1].data = sellData;
      this.ordersChart.update();
    } else {
      this.ordersChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "매수",
              data: buyData,
              backgroundColor: "rgba(33, 191, 115, 0.7)",
              borderColor: "rgba(33, 191, 115, 1)",
              borderWidth: 1,
            },
            {
              label: "매도",
              data: sellData,
              backgroundColor: "rgba(253, 94, 83, 0.7)",
              borderColor: "rgba(253, 94, 83, 1)",
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function (value) {
                  return formatKRW(value);
                },
              },
            },
          },
          plugins: {
            title: {
              display: true,
              text: "일별 거래 내역",
              font: {
                size: 16,
              },
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  const label = context.dataset.label || "";
                  const value = context.raw;
                  return `${label}: ${formatKRW(value)}`;
                },
              },
            },
          },
        },
      });
    }
  }

  /**
   * 수익률 차트를 초기화하거나 업데이트합니다.
   * @param {Array} accounts - 계좌 정보 배열
   * @param {Array} tickers - 현재가 정보 배열
   */
  updateProfitChart(accounts, tickers) {
    const ctx = document.getElementById("profitChart");
    if (!ctx) return;

    const nonKrwAccounts = accounts.filter(
      (acc) => acc.currency !== "KRW" && parseFloat(acc.balance) > 0
    );

    if (nonKrwAccounts.length === 0) return;

    const labels = [];
    const profitData = [];
    const backgroundColors = [];

    nonKrwAccounts.forEach((acc) => {
      const ticker = tickers.find((t) => t.market === `KRW-${acc.currency}`);
      if (!ticker) return;

      const currentPrice = ticker.trade_price;
      const avgPrice = parseFloat(acc.avg_buy_price);
      const profitRate = (currentPrice / avgPrice - 1) * 100;

      labels.push(acc.currency);
      profitData.push(profitRate);

      // 수익률에 따라 색상 설정
      if (profitRate >= 0) {
        backgroundColors.push("rgba(33, 191, 115, 0.7)");
      } else {
        backgroundColors.push("rgba(253, 94, 83, 0.7)");
      }
    });

    if (this.profitChart) {
      this.profitChart.data.labels = labels;
      this.profitChart.data.datasets[0].data = profitData;
      this.profitChart.data.datasets[0].backgroundColor = backgroundColors;
      this.profitChart.update();
    } else {
      this.profitChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "수익률 (%)",
              data: profitData,
              backgroundColor: backgroundColors,
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: false,
              grid: {
                color: "rgba(0, 0, 0, 0.05)",
              },
            },
          },
          plugins: {
            title: {
              display: true,
              text: "코인별 수익률",
              font: {
                size: 16,
              },
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  const value = context.raw;
                  return `수익률: ${value.toFixed(2)}%`;
                },
              },
            },
          },
        },
      });
    }
  }

  /**
   * 가격 변동 차트를 초기화하거나 업데이트합니다.
   * @param {Array} priceSeries - 가격 시계열 데이터
   * @param {string} market - 마켓 코드
   */
  updatePriceChart(priceSeries, market) {
    const ctx = document.getElementById("priceChart");
    if (!ctx || !priceSeries || priceSeries.length === 0) return;

    const labels = priceSeries.map((p) =>
      new Date(p.timestamp).toLocaleTimeString()
    );
    const prices = priceSeries.map((p) => p.price);

    if (this.priceChart) {
      this.priceChart.data.labels = labels;
      this.priceChart.data.datasets[0].data = prices;
      this.priceChart.options.plugins.title.text = `${market} 가격 변동`;
      this.priceChart.update();
    } else {
      this.priceChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: "가격",
              data: prices,
              borderColor: "rgba(46, 139, 192, 1)",
              backgroundColor: "rgba(46, 139, 192, 0.1)",
              borderWidth: 2,
              tension: 0.1,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              ticks: {
                callback: function (value) {
                  return formatKRW(value);
                },
              },
            },
          },
          plugins: {
            title: {
              display: true,
              text: `${market} 가격 변동`,
              font: {
                size: 16,
              },
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  return `가격: ${formatKRW(context.raw)}`;
                },
              },
            },
          },
        },
      });
    }
  }
}

// 차트 서비스 인스턴스 생성
const chartService = new ChartService();
