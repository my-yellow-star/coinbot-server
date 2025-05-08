/**
 * 메인 애플리케이션 로직을 담당하는 모듈
 */
class App {
  constructor() {
    this.apiService = apiService;
    this.uiService = uiService;
    this.chartService = chartService;
    this.isInitialized = false;
    this.refreshInterval = null;
  }

  /**
   * 애플리케이션을 초기화합니다.
   */
  async init() {
    if (this.isInitialized) return;

    try {
      toggleLoadingSpinner(true);

      // 마켓 정보 로드
      const markets = await this.apiService.getMarkets();
      this.uiService.updateMarketSelector(markets);

      // 계좌 정보 로드
      const accounts = await this.apiService.getAccounts();
      this.uiService.updateAccountInfo(accounts);

      // 주문 내역 로드
      const orders = await this.apiService.getOrders();
      this.uiService.updateOrderHistory(orders);

      // 웹소켓 연결 초기화
      this.initWebSocket();

      // 주기적 데이터 갱신 설정
      this.setupRefreshInterval();

      // 데이터 새로고침 이벤트 리스너 등록
      document.addEventListener("refresh-data", this.refreshData.bind(this));

      // 초기 탭 설정 - 'dashboardTab'에서 'dashboard'로 수정
      this.uiService.showTab("dashboard");

      this.isInitialized = true;

      // 초기 로딩 성공 메시지
      console.log("애플리케이션 초기화 완료");
    } catch (error) {
      console.error("앱 초기화 중 오류 발생:", error);
      this.uiService.showError("앱 초기화 중 오류가 발생했습니다.");
    } finally {
      toggleLoadingSpinner(false);
    }
  }

  /**
   * 웹소켓 연결을 초기화합니다.
   */
  initWebSocket() {
    this.apiService.initWebSocket((data) => {
      // 웹소켓 메시지 처리
      if (data.type === "ticker") {
        // 현재가 업데이트
        this.uiService.updateTickers(data.tickers);
      } else if (data.type === "account") {
        // 계좌 정보 업데이트
        this.uiService.updateAccountInfo(data.accounts);
      } else if (data.type === "order") {
        // 주문 내역 업데이트
        this.uiService.updateOrderHistory(data.orders);
        this.uiService.showSuccess("새로운 주문이 발생했습니다.");
      } else {
        // 일반 메시지 처리 (ticker, account, order 외 다른 데이터)
        console.log("웹소켓 데이터 수신:", data);
        this.uiService.handleWebsocketData(data);
      }
    });
  }

  /**
   * 주기적인 데이터 갱신을 설정합니다.
   */
  setupRefreshInterval() {
    // 이미 설정된 인터벌이 있으면 제거
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    // 60초마다 데이터 갱신
    this.refreshInterval = setInterval(async () => {
      if (!this.apiService.isSocketConnected()) {
        // 소켓 연결이 끊어진 경우 수동으로 데이터 갱신
        await this.refreshData();

        // 소켓 재연결 시도
        this.initWebSocket();
      }
    }, 60000);
  }

  /**
   * 모든 데이터를 새로고침합니다.
   */
  async refreshData() {
    try {
      // 계좌 정보 갱신
      const accounts = await this.apiService.getAccounts();
      this.uiService.updateAccountInfo(accounts);

      // 주문 내역 갱신
      const orders = await this.apiService.getOrders();
      this.uiService.updateOrderHistory(orders);

      // 마켓별 현재가 조회 (선택된 마켓)
      const market = this.uiService.selectedMarket;
      if (market) {
        try {
          const profitRate = await this.apiService.getProfitRate(market);
          console.log("수익률 정보:", profitRate);
        } catch (error) {
          console.error("수익률 조회 중 오류 발생:", error);
        }
      }
    } catch (error) {
      console.error("데이터 갱신 중 오류 발생:", error);
      this.uiService.showError("데이터 갱신 중 오류가 발생했습니다.");
    }
  }

  /**
   * 애플리케이션 리소스를 정리합니다.
   */
  cleanup() {
    // 인터벌 정리
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // 웹소켓 연결 종료
    this.apiService.closeWebSocket();

    // 이벤트 리스너 제거
    document.removeEventListener("refresh-data", this.refreshData.bind(this));
  }
}

// DOMContentLoaded 이벤트 리스너
document.addEventListener("DOMContentLoaded", () => {
  // UI 서비스와 차트 서비스 초기화
  const uiService = new UiService(apiService, chartService);
  window.uiService = uiService;

  // 앱 인스턴스 생성 및 초기화
  const app = new App();
  app.init().catch((error) => {
    console.error("앱 실행 중 오류 발생:", error);
    uiService.showError("앱 실행 중 오류가 발생했습니다.");
  });

  // 탭 이벤트 리스너 설정
  setupTabEventListeners();

  // 페이지 종료 시 리소스 정리
  window.addEventListener("beforeunload", () => {
    app.cleanup();
  });
});

// 탭 이벤트 리스너 설정
function setupTabEventListeners() {
  const tabLinks = document.querySelectorAll(".nav-link");
  const tabContents = document.querySelectorAll(".tab-content");

  tabLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();

      // 활성 탭 표시
      tabLinks.forEach((tab) => tab.classList.remove("active"));
      link.classList.add("active");

      // 탭 컨텐츠 표시
      const targetId = link.getAttribute("data-tab");
      tabContents.forEach((content) => {
        content.style.display = content.id === targetId ? "block" : "none";
      });

      // 주문 탭이 활성화되었을 때 주문 데이터 로드
      if (targetId === "orders") {
        const activeOrderTab = document.querySelector(".order-tab.active");
        if (activeOrderTab) {
          uiService.loadOrders(activeOrderTab.dataset.type);
        }
      }
    });
  });
}

/**
 * 로딩 스피너를 표시하거나 숨깁니다.
 * @param {boolean} show - 표시 여부
 */
function toggleLoadingSpinner(show) {
  const loadingElement = document.getElementById("loading");
  if (loadingElement) {
    loadingElement.style.display = show ? "flex" : "none";
  }
}
