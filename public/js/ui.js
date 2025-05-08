/**
 * UI 관련 기능을 담당하는 모듈
 */
class UiService {
  constructor(apiService, chartService) {
    this.apiService = apiService;
    this.chartService = chartService;
    this.selectedMarket = null;
    this.activeTab = "dashboard";
    this.orderTabActive = "open";
    this.currentPage = { open: 1, closed: 1 };
    this.marketFilter = "";
    this.accounts = [];
    this.tickers = [];
    this.orders = [];
    this.balanceChart = null;
    this.orderChart = null;
    this.lastData = null;

    // Utils 객체가 없을 경우 formatCurrency 함수 추가
    if (typeof Utils === "undefined") {
      window.Utils = {
        formatCurrency: (amount) => {
          return new Intl.NumberFormat("ko-KR", {
            style: "currency",
            currency: "KRW",
          }).format(amount);
        },
        formatPercent: (percent) => {
          return `${(percent * 100).toFixed(2)}%`;
        },
      };
    }

    this.bindEvents();
  }

  /**
   * 이벤트 리스너를 바인딩합니다.
   */
  bindEvents() {
    // 마켓 선택 변경 시 이벤트
    const marketSelector = document.getElementById("marketSelector");
    if (marketSelector) {
      marketSelector.addEventListener("change", (e) => {
        this.selectedMarket = e.target.value;
        this.updateMarketInfo();
      });
    }

    // 화면 탭 전환 이벤트
    const tabButtons = document.querySelectorAll(".tab-button");
    tabButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        const tabId = e.target.dataset.tab;
        this.showTab(tabId);
      });
    });

    // 새로고침 버튼 이벤트
    const refreshButton = document.getElementById("refreshButton");
    if (refreshButton) {
      refreshButton.addEventListener("click", () => {
        this.refreshData();
      });
    }

    // 마켓 검색 필터
    document.getElementById("marketSearch").addEventListener("input", (e) => {
      this.marketFilter = e.target.value.toLowerCase();
      this.updateMarketList();
    });

    // 마켓 상세 검색 필터
    document
      .getElementById("marketDetailSearch")
      .addEventListener("input", (e) => {
        this.marketFilter = e.target.value.toLowerCase();
        this.updateMarketList();
      });

    // 페이지네이션 버튼
    document
      .getElementById("ordersPagination")
      .addEventListener("click", (e) => {
        if (e.target.classList.contains("pagination-button")) {
          const action = e.target.dataset.action;
          const type = this.orderTabActive;

          if (action === "prev" && this.currentPage[type] > 1) {
            this.currentPage[type]--;
          } else if (action === "next") {
            this.currentPage[type]++;
          }

          this.loadOrders(type);
        }
      });

    // 주문 탭 이벤트 바인딩
    document.querySelectorAll(".order-tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();

        // 현재 활성 탭 제거
        document.querySelectorAll(".order-tab").forEach((t) => {
          t.classList.remove("active");
        });

        // 클릭한 탭 활성화
        e.target.classList.add("active");

        // 주문 타입에 따라 주문 데이터 로드
        const orderType = e.target.dataset.type;
        this.loadOrders(orderType);
      });
    });
  }

  /**
   * 마켓 셀렉터 옵션을 업데이트합니다.
   * @param {Array} markets - 마켓 정보 배열
   */
  updateMarketSelector(markets) {
    const marketSelector = document.getElementById("marketSelector");
    if (!marketSelector) return;

    // 현재 선택된 마켓 저장
    const currentSelected = marketSelector.value || this.selectedMarket;

    // 기존 옵션 제거
    marketSelector.innerHTML = "";

    // KRW 마켓만 필터링 및 정렬
    this.marketOptions = markets
      .filter((market) => market.market.startsWith("KRW-"))
      .sort((a, b) => a.korean_name.localeCompare(b.korean_name, "ko"));

    // 옵션 추가
    this.marketOptions.forEach((market) => {
      const option = document.createElement("option");
      option.value = market.market;
      option.textContent = `${market.korean_name} (${market.market})`;
      marketSelector.appendChild(option);
    });

    // 이전에 선택된 값 복원
    if (this.marketOptions.some((m) => m.market === currentSelected)) {
      marketSelector.value = currentSelected;
      this.selectedMarket = currentSelected;
    } else if (this.marketOptions.length > 0) {
      this.selectedMarket = this.marketOptions[0].market;
      marketSelector.value = this.selectedMarket;
    }
  }

  /**
   * 계좌 정보를 업데이트합니다.
   * @param {Array} accounts - 계좌 정보 배열
   */
  updateAccountInfo(accounts) {
    this.accounts = accounts;

    // KRW 잔고 업데이트
    const krwAccount = accounts.find((acc) => acc.currency === "KRW");
    if (krwAccount) {
      updateElementText("krwBalance", krwAccount.balance, "price");
    }

    // 보유 코인 테이블 업데이트
    this.updateCoinHoldings();

    // 자산 분포 차트 업데이트
    chartService.updateBalanceChart(accounts);

    // 수익률 차트 업데이트
    if (this.tickers.length > 0) {
      chartService.updateProfitChart(accounts, this.tickers);
    }
  }

  /**
   * 보유 코인 테이블을 업데이트합니다.
   */
  updateCoinHoldings() {
    const holdingsTableBody = document.getElementById("holdingsTableBody");
    if (!holdingsTableBody) return;

    // 기존 내용 제거
    holdingsTableBody.innerHTML = "";

    // KRW가 아닌 계좌 정보 필터링
    const coinAccounts = this.accounts.filter(
      (acc) => acc.currency !== "KRW" && parseFloat(acc.balance) > 0
    );

    if (coinAccounts.length === 0) {
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML =
        '<td colspan="6" class="text-center">보유 코인이 없습니다.</td>';
      holdingsTableBody.appendChild(emptyRow);
      return;
    }

    // 코인별 행 추가
    coinAccounts.forEach((account) => {
      const ticker = this.tickers.find(
        (t) => t.market === `KRW-${account.currency}`
      );
      const currentPrice = ticker ? ticker.trade_price : 0;
      const avgPrice = parseFloat(account.avg_buy_price);
      const balance = parseFloat(account.balance);
      const totalValue = balance * currentPrice;
      const profitRate = (currentPrice / avgPrice - 1) * 100;

      const row = document.createElement("tr");

      // 코인 이름
      const nameCell = document.createElement("td");
      nameCell.textContent = account.currency;

      // 평균 매수가
      const avgPriceCell = document.createElement("td");
      avgPriceCell.textContent = formatKRW(avgPrice);

      // 현재가
      const currentPriceCell = document.createElement("td");
      currentPriceCell.textContent = formatKRW(currentPrice);

      // 수익률
      const profitRateCell = document.createElement("td");
      profitRateCell.textContent = `${profitRate.toFixed(2)}%`;
      profitRateCell.className = profitRate >= 0 ? "positive" : "negative";

      // 보유수량
      const balanceCell = document.createElement("td");
      balanceCell.textContent = formatAmount(balance);

      // 평가금액
      const valueCell = document.createElement("td");
      valueCell.textContent = formatKRW(totalValue);

      // 행에 셀 추가
      row.appendChild(nameCell);
      row.appendChild(avgPriceCell);
      row.appendChild(currentPriceCell);
      row.appendChild(profitRateCell);
      row.appendChild(balanceCell);
      row.appendChild(valueCell);

      // 테이블에 행 추가
      holdingsTableBody.appendChild(row);
    });
  }

  /**
   * 주문 내역을 업데이트합니다.
   * @param {Array} orders - 주문 내역 배열
   */
  updateOrderHistory(orders) {
    this.orders = orders;
    const ordersTableBody = document.getElementById("ordersTableBody");
    if (!ordersTableBody) return;

    // 기존 내용 제거
    ordersTableBody.innerHTML = "";

    if (orders.length === 0) {
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML =
        '<td colspan="7" class="text-center">주문 내역이 없습니다.</td>';
      ordersTableBody.appendChild(emptyRow);
      return;
    }

    // 주문별 행 추가
    orders.forEach((order) => {
      const row = document.createElement("tr");

      // 주문 시간
      const timeCell = document.createElement("td");
      timeCell.textContent = formatDate(order.created_at);

      // 마켓
      const marketCell = document.createElement("td");
      marketCell.textContent = order.market;

      // 주문 유형
      const sideCell = document.createElement("td");
      const isBid = order.side === "bid";
      sideCell.textContent = isBid ? "매수" : "매도";
      sideCell.className = isBid ? "positive" : "negative";

      // 주문 가격
      const priceCell = document.createElement("td");
      priceCell.textContent = formatKRW(order.price);

      // 주문 수량
      const volumeCell = document.createElement("td");
      volumeCell.textContent = formatAmount(order.volume);

      // 체결 수량
      const executedVolumeCell = document.createElement("td");
      executedVolumeCell.textContent = formatAmount(order.executed_volume);

      // 상태
      const statusCell = document.createElement("td");
      statusCell.textContent = this.getOrderStatusText(order.state);

      // 행에 셀 추가
      row.appendChild(timeCell);
      row.appendChild(marketCell);
      row.appendChild(sideCell);
      row.appendChild(priceCell);
      row.appendChild(volumeCell);
      row.appendChild(executedVolumeCell);
      row.appendChild(statusCell);

      // 테이블에 행 추가
      ordersTableBody.appendChild(row);
    });

    // 주문 내역 차트 업데이트
    chartService.updateOrdersChart(orders);
  }

  /**
   * 마켓 정보를 업데이트합니다.
   */
  updateMarketInfo() {
    const ticker = this.tickers.find((t) => t.market === this.selectedMarket);
    if (!ticker) return;

    const marketNameElement = document.getElementById("marketName");
    if (marketNameElement) {
      const marketInfo = this.marketOptions.find(
        (m) => m.market === this.selectedMarket
      );
      const koreanName = marketInfo ? marketInfo.korean_name : "";
      marketNameElement.textContent = `${koreanName} (${this.selectedMarket})`;
    }

    // 현재가 업데이트
    updateElementText("currentPrice", ticker.trade_price, "price");

    // 전일 대비 변화율 업데이트
    const changeRate = ticker.change_rate * 100;
    updateElementText("priceChangeRate", changeRate, "percent");

    // 고가/저가 업데이트
    updateElementText("highPrice", ticker.high_price, "price");
    updateElementText("lowPrice", ticker.low_price, "price");

    // 거래량 업데이트
    updateElementText("tradeVolume", ticker.acc_trade_volume_24h, "number");

    // 거래대금 업데이트
    updateElementText("tradeValue", ticker.acc_trade_price_24h, "price");

    // 가격 변동 차트 업데이트
    if (this.priceSeries[this.selectedMarket]) {
      chartService.updatePriceChart(
        this.priceSeries[this.selectedMarket],
        this.selectedMarket
      );
    }
  }

  /**
   * 현재가 정보를 업데이트합니다.
   * @param {Array} tickers - 현재가 정보 배열
   */
  updateTickers(tickers) {
    this.tickers = tickers;

    // 선택된 마켓 정보 업데이트
    this.updateMarketInfo();

    // 코인 보유 정보 업데이트 (가격 변동 반영)
    this.updateCoinHoldings();

    // 수익률 차트 업데이트
    chartService.updateProfitChart(this.accounts, tickers);

    // 가격 시계열 데이터 업데이트
    tickers.forEach((ticker) => {
      if (!this.priceSeries[ticker.market]) {
        this.priceSeries[ticker.market] = [];
      }

      this.priceSeries[ticker.market].push({
        timestamp: new Date(),
        price: ticker.trade_price,
      });

      // 최대 30개 데이터만 유지
      if (this.priceSeries[ticker.market].length > 30) {
        this.priceSeries[ticker.market].shift();
      }
    });

    // 선택된 마켓의 가격 차트 업데이트
    if (this.priceSeries[this.selectedMarket]) {
      chartService.updatePriceChart(
        this.priceSeries[this.selectedMarket],
        this.selectedMarket
      );
    }
  }

  /**
   * 오류 메시지를 화면에 표시합니다.
   * @param {string} message - 오류 메시지
   */
  showError(message) {
    showToast(message, "error");
  }

  /**
   * 성공 메시지를 화면에 표시합니다.
   * @param {string} message - 성공 메시지
   */
  showSuccess(message) {
    showToast(message, "success");
  }

  /**
   * 탭을 전환합니다.
   * @param {string} tabId - 표시할 탭 ID
   */
  showTab(tabId) {
    this.activeTab = tabId;

    // 모든 탭 내용을 숨김
    document.querySelectorAll(".tab-content").forEach((tab) => {
      tab.style.display = "none";
    });

    // 모든 탭 버튼의 활성 상태 제거
    document.querySelectorAll(".tab-button").forEach((button) => {
      button.classList.remove("active");
    });

    // 선택한 탭 표시
    const selectedTab = document.getElementById(tabId);
    if (selectedTab) {
      selectedTab.style.display = "block";
    }

    // 선택한 탭 버튼 활성화
    const selectedButton = document.querySelector(
      `.tab-button[data-tab="${tabId}"]`
    );
    if (selectedButton) {
      selectedButton.classList.add("active");
    }

    // 탭에 따른 특별 처리
    if (tabId === "markets" && this.lastData) {
      // 마켓 탭이 활성화되면 마켓 목록 업데이트
      this.updateMarketList();

      // 이미 선택된 마켓이 있다면 상세 정보 업데이트
      if (this.selectedMarket) {
        this.updateMarketDetail();
      }
    } else if (tabId === "orders") {
      // 주문 탭이 활성화되면 주문 내역 로드
      this.loadOrders(this.orderTabActive);
    }
  }

  /**
   * 데이터를 새로 고칩니다.
   */
  refreshData() {
    toggleLoadingSpinner(true);

    // 데이터 새로고침 이벤트 발생
    const event = new CustomEvent("refresh-data");
    document.dispatchEvent(event);

    setTimeout(() => {
      toggleLoadingSpinner(false);
      this.showSuccess("데이터가 갱신되었습니다.");
    }, 1000);
  }

  /**
   * 주문 상태 코드를 텍스트로 변환합니다.
   * @param {string} state - 주문 상태 코드
   * @returns {string} 주문 상태 텍스트
   */
  getOrderStatusText(state) {
    const statusMap = {
      wait: "대기",
      watch: "예약",
      done: "완료",
      cancel: "취소",
    };

    return statusMap[state] || state;
  }

  async loadOrders(type) {
    const ordersTableBody = document.getElementById("ordersTableBody");
    const loadingElement = document.getElementById("ordersLoading");

    try {
      loadingElement.style.display = "block";
      ordersTableBody.innerHTML = "";

      const params = {
        page: this.currentPage[type],
        limit: this.pageSize,
        order_by: "desc",
      };

      if (this.selectedMarket) {
        params.market = this.selectedMarket;
      }

      let orders;
      if (type === "open") {
        orders = await this.apiService.getOpenOrders(params);
      } else {
        orders = await this.apiService.getClosedOrders(params);
      }

      this.renderOrdersTable(orders, type);
      this.updatePagination(orders.length < this.pageSize, type);
    } catch (error) {
      console.error(`${type} 주문 불러오기 오류:`, error);
      ordersTableBody.innerHTML = `<tr><td colspan="7" class="text-center">주문 데이터를 불러오는 중 오류가 발생했습니다</td></tr>`;
    } finally {
      loadingElement.style.display = "none";
    }
  }

  renderOrdersTable(orders, type) {
    const ordersTableBody = document.getElementById("ordersTableBody");

    if (!orders || orders.length === 0) {
      ordersTableBody.innerHTML = `<tr><td colspan="7" class="text-center">주문 내역이 없습니다</td></tr>`;
      return;
    }

    let html = "";
    orders.forEach((order) => {
      const sideClass = order.side === "bid" ? "text-success" : "text-danger";
      const sideText = order.side === "bid" ? "매수" : "매도";
      const stateText = this.getOrderStateText(order.state);

      html += `
        <tr>
          <td>${order.market}</td>
          <td class="${sideClass}">${sideText}</td>
          <td>${Utils.formatCurrency(order.price)}</td>
          <td>${parseFloat(order.volume).toFixed(8)}</td>
          <td>${Utils.formatDate(new Date(order.created_at))}</td>
          <td>${stateText}</td>
          <td>${Utils.formatCurrency(order.locked || 0)}</td>
        </tr>
      `;
    });

    ordersTableBody.innerHTML = html;
  }

  updatePagination(isLastPage, type) {
    const prevButton = document.querySelector(
      '.pagination-button[data-action="prev"]'
    );
    const nextButton = document.querySelector(
      '.pagination-button[data-action="next"]'
    );
    const pageInfo = document.getElementById("currentPage");

    prevButton.disabled = this.currentPage[type] <= 1;
    nextButton.disabled = isLastPage;
    pageInfo.textContent = `페이지 ${this.currentPage[type]}`;
  }

  getOrderStateText(state) {
    const stateMap = {
      wait: "대기",
      watch: "예약",
      done: "완료",
      cancel: "취소",
    };
    return stateMap[state] || state;
  }

  handleWebsocketData(data) {
    // 로딩 표시 제거
    const loadingElement = document.getElementById("loading");
    if (loadingElement) {
      loadingElement.style.display = "none";
    }

    console.log("웹소켓 데이터 수신:", data);

    // 데이터 없는 경우 처리
    if (!data) {
      console.warn("수신된 데이터가 없습니다.");
      return;
    }

    // 데이터 저장
    this.lastData = data;

    // 데이터 세부 정보 로깅
    if (data.accounts) {
      console.log(`계정 데이터 수신: ${data.accounts.length}개 항목`);
    }

    if (data.markets) {
      console.log(`마켓 데이터 수신: ${data.markets.length}개 항목`);
    }

    if (data.tickers) {
      console.log(`티커 데이터 수신: ${data.tickers.length}개 항목`);
    }

    if (data.orders) {
      console.log(`주문 데이터 수신: ${data.orders.length}개 항목`);
    }

    // 활성 탭에 따른 업데이트
    console.log(`현재 활성 탭: ${this.activeTab}`);

    // 항상 데이터 업데이트하도록 수정
    if (data.accounts) {
      this.updateAccountSummary(data.accounts);
      if (data.tickers) {
        this.updateProfitInfo(data.accounts, data.tickers);
      }
    }

    if (data.tickers && data.markets) {
      this.updateTickerList(data.tickers, data.markets);
    }

    if (data.orders) {
      this.updateOrderList(data.orders);
    }

    if (data.accounts && data.orders) {
      this.updateCharts(data.accounts, data.orders);
    }

    // 추가적으로 탭별 업데이트
    if (this.activeTab === "dashboard") {
      this.updateDashboard(data);
    } else if (this.activeTab === "markets") {
      // 마켓 탭이 활성화된 경우 마켓 목록 업데이트
      this.updateMarketList();

      // 이미 선택된 마켓이 있다면 상세 정보 업데이트
      if (this.selectedMarket) {
        this.updateMarketDetail();
      }
    }
  }

  updateDashboard(data) {
    if (!data) return;

    // 계정 정보 업데이트
    this.updateAccountSummary(data.accounts);

    // 시장 정보 업데이트
    this.updateTickerList(data.tickers, data.markets);

    // 주문 내역 업데이트
    this.updateOrderList(data.orders);

    // 수익률 정보 업데이트
    this.updateProfitInfo(data.accounts, data.tickers);

    // 차트 업데이트
    this.updateCharts(data.accounts, data.orders);
  }

  updateAccountSummary(accounts) {
    if (!accounts) return;

    const krwAccount = accounts.find((acc) => acc.currency === "KRW");
    const nonKrwAccounts = accounts.filter(
      (acc) => acc.currency !== "KRW" && parseFloat(acc.balance) > 0
    );

    let html = `<div class="alert alert-info mb-3">
                  <h5>원화 잔고: ${formatKRW(
                    parseFloat(krwAccount?.balance || "0")
                  )}</h5>
                </div>`;

    if (nonKrwAccounts.length > 0) {
      html += '<div class="table-responsive"><table class="table table-sm">';
      html +=
        "<thead><tr><th>코인</th><th>보유량</th><th>평균 매수가</th></tr></thead><tbody>";

      nonKrwAccounts.forEach((acc) => {
        html += `<tr>
                    <td>${acc.currency}</td>
                    <td>${parseFloat(acc.balance).toFixed(8)}</td>
                    <td>${formatKRW(parseFloat(acc.avg_buy_price))}</td>
                  </tr>`;
      });

      html += "</tbody></table></div>";
    } else {
      html += '<p class="text-muted">보유 중인 코인이 없습니다.</p>';
    }

    document.getElementById("accountSummary").innerHTML = html;
  }

  updateTickerList(tickers, markets) {
    if (!tickers || !markets) return;

    // 중요한 마켓만 표시 (KRW 마켓)
    const krwTickers = tickers.filter((ticker) =>
      ticker.market.startsWith("KRW-")
    );

    // 마켓 코드 기준으로 정렬
    krwTickers.sort((a, b) => a.market.localeCompare(b.market));

    let html = "";

    krwTickers.forEach((ticker) => {
      const market = markets.find((m) => m.market === ticker.market);
      const changeRate = ticker.signed_change_rate * 100;
      const rowClass = changeRate >= 0 ? "ticker-up" : "ticker-down";
      const changeRateClass = changeRate >= 0 ? "text-success" : "text-danger";
      const changeRatePrefix = changeRate >= 0 ? "+" : "";

      html += `<tr class="${rowClass}" data-market="${ticker.market}">
                  <td>${market?.korean_name || ticker.market}</td>
                  <td>${formatKRW(ticker.trade_price)}</td>
                  <td class="${changeRateClass}">${changeRatePrefix}${changeRate.toFixed(
        2
      )}%</td>
                </tr>`;
    });

    document.getElementById("tickerList").innerHTML =
      html || '<tr><td colspan="3" class="text-center">데이터 없음</td></tr>';

    // 시세 행을 클릭하면 해당 마켓 선택
    document.querySelectorAll("#tickerList tr[data-market]").forEach((row) => {
      row.addEventListener("click", () => {
        const market = row.dataset.market;
        this.selectMarket(market);
      });
    });
  }

  updateOrderList(orders) {
    if (!orders || orders.length === 0) {
      document.getElementById("orderList").innerHTML =
        '<tr><td colspan="4" class="text-center">주문 내역이 없습니다.</td></tr>';
      return;
    }

    let html = "";

    // 최근 주문부터 표시 (최대 5개)
    const recentOrders = [...orders].reverse().slice(0, 5);

    recentOrders.forEach((order) => {
      const orderClass = order.side === "bid" ? "order-buy" : "order-sell";
      const orderType = order.side === "bid" ? "매수" : "매도";
      const orderTypeClass =
        order.side === "bid" ? "text-success" : "text-danger";
      const date = new Date(order.created_at);
      const formattedDate = `${date.getHours()}:${date.getMinutes()}`;

      html += `<tr class="${orderClass}">
                  <td>${formattedDate}</td>
                  <td>${order.market}</td>
                  <td class="${orderTypeClass}">${orderType}</td>
                  <td>${formatKRW(order.price)}</td>
                </tr>`;
    });

    document.getElementById("orderList").innerHTML = html;
  }

  updateProfitInfo(accounts, tickers) {
    const nonKrwAccounts = accounts.filter(
      (acc) => acc.currency !== "KRW" && parseFloat(acc.balance) > 0
    );

    if (nonKrwAccounts.length === 0) {
      document.getElementById("profitInfo").innerHTML =
        '<p class="text-muted">보유 중인 코인이 없습니다.</p>';
      return;
    }

    let html = '<div class="table-responsive"><table class="table table-sm">';
    html +=
      "<thead><tr><th>코인</th><th>현재가</th><th>수익률</th></tr></thead><tbody>";

    let totalValue = 0;
    let totalInvestment = 0;

    nonKrwAccounts.forEach((acc) => {
      const ticker = tickers.find((t) => t.market === `KRW-${acc.currency}`);
      if (!ticker) return;

      const currentPrice = ticker.trade_price;
      const avgPrice = parseFloat(acc.avg_buy_price);
      const balance = parseFloat(acc.balance);
      const profitRate = (currentPrice / avgPrice - 1) * 100;
      const profitClass = profitRate >= 0 ? "text-success" : "text-danger";
      const profitPrefix = profitRate >= 0 ? "+" : "";

      totalValue += currentPrice * balance;
      totalInvestment += avgPrice * balance;

      html += `<tr>
                  <td>${acc.currency}</td>
                  <td>${formatKRW(currentPrice)}</td>
                  <td class="${profitClass}">${profitPrefix}${profitRate.toFixed(
        2
      )}%</td>
                </tr>`;
    });

    const totalProfitRate = (totalValue / totalInvestment - 1) * 100;
    const totalProfitClass =
      totalProfitRate >= 0 ? "text-success" : "text-danger";
    const totalProfitPrefix = totalProfitRate >= 0 ? "+" : "";

    html += "</tbody></table></div>";

    html += `<div class="alert alert-info mt-3">
                <h5>총 평가액: ${formatKRW(totalValue)}</h5>
                <h5>총 수익률: <span class="${totalProfitClass}">${totalProfitPrefix}${totalProfitRate.toFixed(
      2
    )}%</span></h5>
              </div>`;

    document.getElementById("profitInfo").innerHTML = html;
  }

  updateCharts(accounts, orders) {
    this.updateBalanceChart(accounts);
    this.updateOrdersChart(orders);
  }

  updateBalanceChart(accounts) {
    const ctx = document.getElementById("balanceChart");

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

    // 차트 색상
    const backgroundColors = [
      "rgba(54, 162, 235, 0.8)",
      "rgba(255, 99, 132, 0.8)",
      "rgba(75, 192, 192, 0.8)",
      "rgba(255, 159, 64, 0.8)",
      "rgba(153, 102, 255, 0.8)",
      "rgba(255, 205, 86, 0.8)",
      "rgba(201, 203, 207, 0.8)",
    ];

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
              backgroundColor: backgroundColors,
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
                boxWidth: 12,
                font: {
                  size: 10,
                },
              },
            },
            title: {
              display: true,
              text: "자산 분포",
            },
          },
        },
      });
    }
  }

  updateOrdersChart(orders) {
    const ctx = document.getElementById("ordersChart");

    if (!orders || orders.length === 0) {
      return;
    }

    // 일자별 매수/매도 금액 계산
    const ordersByDate = {};

    orders.forEach((order) => {
      const date = new Date(order.created_at).toLocaleDateString();

      if (!ordersByDate[date]) {
        ordersByDate[date] = { buy: 0, sell: 0 };
      }

      const amount =
        parseFloat(order.price) * parseFloat(order.executed_volume);

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
              backgroundColor: "rgba(40, 167, 69, 0.7)",
              borderColor: "rgba(40, 167, 69, 1)",
              borderWidth: 1,
            },
            {
              label: "매도",
              data: sellData,
              backgroundColor: "rgba(220, 53, 69, 0.7)",
              borderColor: "rgba(220, 53, 69, 1)",
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
            },
          },
        },
      });
    }
  }

  updateMarketList() {
    console.log("마켓 목록 업데이트 시작", this.lastData);

    if (!this.lastData || !this.lastData.markets || !this.lastData.tickers) {
      console.log("마켓 데이터가 없습니다.");
      return;
    }

    const { markets, tickers } = this.lastData;
    const marketList = document.getElementById("marketList");

    if (!marketList) {
      console.log("마켓 목록 요소를 찾을 수 없습니다.");
      return;
    }

    let html = "";

    // KRW 마켓만 필터링
    const krwMarkets = markets.filter((market) =>
      market.market.startsWith("KRW-")
    );

    // 마켓 코드 기준으로 정렬
    krwMarkets.sort((a, b) => a.market.localeCompare(b.market));

    console.log(`필터링된 마켓 수: ${krwMarkets.length}`);

    krwMarkets.forEach((market) => {
      // 검색 필터 적용 (대소문자 구분 없이 검색)
      const marketFilter = this.marketFilter?.toLowerCase() || "";
      if (
        marketFilter &&
        !market.market.toLowerCase().includes(marketFilter) &&
        !market.korean_name.toLowerCase().includes(marketFilter)
      ) {
        return;
      }

      const ticker = tickers.find((t) => t.market === market.market);
      if (!ticker) return;

      const changeClass =
        ticker.change === "RISE"
          ? "text-success"
          : ticker.change === "FALL"
          ? "text-danger"
          : "";
      const changeIcon =
        ticker.change === "RISE" ? "▲" : ticker.change === "FALL" ? "▼" : "";
      const isSelected =
        market.market === this.selectedMarket ? "selected" : "";

      html += `
        <div class="market-item ${isSelected}" data-market="${market.market}">
          <div class="market-name">${market.korean_name}</div>
          <div class="market-price">${Utils.formatCurrency(
            ticker.trade_price
          )}</div>
          <div class="market-change ${changeClass}">
            ${changeIcon} ${Utils.formatPercent(ticker.change_rate)}
          </div>
        </div>
      `;
    });

    console.log("마켓 HTML 생성 완료");

    marketList.innerHTML =
      html || '<div class="no-data">일치하는 마켓이 없습니다</div>';

    // 마켓 아이템 클릭 이벤트 바인딩
    document.querySelectorAll(".market-item").forEach((item) => {
      item.addEventListener("click", () => {
        const market = item.dataset.market;
        this.selectMarket(market);
      });
    });

    console.log("마켓 목록 업데이트 완료");
  }

  updateMarketSummary(markets, tickers) {
    if (!markets || !tickers) return;

    // 상위 5개 상승/하락 마켓 추출
    const sortedTickers = [...tickers].sort(
      (a, b) => b.change_rate - a.change_rate
    );
    const topGainers = sortedTickers.slice(0, 5);
    const topLosers = sortedTickers.slice(-5).reverse();

    // 상승 마켓 목록 업데이트
    this.updateMarketSummaryTable("topGainersBody", topGainers, markets);

    // 하락 마켓 목록 업데이트
    this.updateMarketSummaryTable("topLosersBody", topLosers, markets);
  }

  updateMarketSummaryTable(tableId, tickers, markets) {
    const tableBody = document.getElementById(tableId);
    let html = "";

    tickers.forEach((ticker) => {
      const market = markets.find((m) => m.market === ticker.market);
      if (!market) return;

      const changeClass =
        ticker.change === "RISE"
          ? "text-success"
          : ticker.change === "FALL"
          ? "text-danger"
          : "";
      const changeIcon =
        ticker.change === "RISE" ? "▲" : ticker.change === "FALL" ? "▼" : "";

      html += `
        <tr data-market="${ticker.market}">
          <td>${market.korean_name}</td>
          <td>${Utils.formatCurrency(ticker.trade_price)}</td>
          <td class="${changeClass}">${changeIcon} ${Utils.formatPercent(
        ticker.change_rate
      )}</td>
          <td>${Utils.formatCurrency(
            ticker.acc_trade_price_24h / 1000000
          )}백만</td>
        </tr>
      `;
    });

    tableBody.innerHTML = html;
  }

  selectMarket(market) {
    this.selectedMarket = market;

    // 마켓 목록에서 선택 표시 업데이트
    document.querySelectorAll(".market-item").forEach((item) => {
      if (item.dataset.market === market) {
        item.classList.add("selected");
      } else {
        item.classList.remove("selected");
      }
    });

    // 마켓 상세 정보 업데이트
    this.updateMarketDetail();

    // 가격 차트 업데이트
    if (this.chartService) {
      this.chartService.updatePriceChart(market);
    }

    // 주문 탭이 활성화된 경우 주문 데이터 다시 로드
    if (this.activeTab === "orders") {
      this.loadOrders(this.orderTabActive);
    }
  }

  updateMarketDetail() {
    if (!this.selectedMarket || !this.lastData || !this.lastData.tickers)
      return;

    const market = this.lastData.markets.find(
      (m) => m.market === this.selectedMarket
    );
    const ticker = this.lastData.tickers.find(
      (t) => t.market === this.selectedMarket
    );

    if (!market || !ticker) return;

    const detailElement = document.getElementById("marketDetail");
    const changeClass =
      ticker.change === "RISE"
        ? "text-success"
        : ticker.change === "FALL"
        ? "text-danger"
        : "";
    const changeIcon =
      ticker.change === "RISE" ? "▲" : ticker.change === "FALL" ? "▼" : "";

    detailElement.innerHTML = `
      <h3>${market.korean_name} (${market.market})</h3>
      <div class="market-price-large">${Utils.formatCurrency(
        ticker.trade_price
      )}</div>
      <div class="market-change ${changeClass}">
        ${changeIcon} ${Utils.formatPercent(
      ticker.change_rate
    )} (${Utils.formatCurrency(ticker.change_price)})
      </div>
      <div class="market-stats">
        <div class="stat-item">
          <div class="stat-label">고가</div>
          <div class="stat-value">${Utils.formatCurrency(
            ticker.high_price
          )}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">저가</div>
          <div class="stat-value">${Utils.formatCurrency(
            ticker.low_price
          )}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">거래대금</div>
          <div class="stat-value">${Utils.formatCurrency(
            ticker.acc_trade_price_24h / 1000000
          )}백만</div>
        </div>
      </div>
    `;
  }
}

// UI 서비스 인스턴스 생성
const uiService = new UiService(apiService, chartService);
