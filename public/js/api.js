/**
 * API 통신을 담당하는 모듈
 */
class ApiService {
  constructor() {
    this.baseUrl = "";
    this.socket = null;
    this.isConnecting = false;
  }

  /**
   * API 엔드포인트에 GET 요청을 보냅니다.
   * @param {string} endpoint - API 엔드포인트
   * @returns {Promise<any>} - 응답 데이터
   */
  async get(endpoint) {
    try {
      const response = await fetch(`${this.baseUrl}/api/${endpoint}`);
      if (!response.ok) {
        throw new Error(`API 오류: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("API 요청 실패:", error);
      throw error;
    }
  }

  /**
   * 계좌 정보를 가져옵니다.
   * @returns {Promise<any>} - 계좌 정보
   */
  async getAccounts() {
    return this.get("accounts");
  }

  /**
   * 마켓 정보를 가져옵니다.
   * @returns {Promise<any>} - 마켓 정보
   */
  async getMarkets() {
    return this.get("markets");
  }

  /**
   * 주문 내역을 가져옵니다.
   * @returns {Promise<any>} - 주문 내역
   */
  async getOrders(market) {
    const endpoint = market ? `orders?market=${market}` : "orders";
    return this.get(endpoint);
  }

  /**
   * 웹소켓 연결을 초기화합니다.
   * @param {Function} onMessage - 메시지 수신 시 호출될 콜백 함수
   * @returns {WebSocket} - 웹소켓 객체
   */
  initWebSocket(onMessage) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log("이미 웹소켓이 연결되어 있습니다.");
      return;
    }

    if (this.isConnecting) {
      console.log("웹소켓 연결 중입니다.");
      return;
    }

    this.isConnecting = true;

    // 로딩 스피너 표시
    this.toggleLoadingSpinner(true);

    // WebSocket URL 생성
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log("웹소켓 연결 성공");
        this.isConnecting = false;
        this.updateConnectionStatus(true);
        this.toggleLoadingSpinner(false);
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // 첫 메시지 수신 시 로딩 스피너 숨김
          this.toggleLoadingSpinner(false);
          if (onMessage && typeof onMessage === "function") {
            onMessage(data);
          }
        } catch (error) {
          console.error("웹소켓 메시지 처리 오류:", error);
        }
      };

      this.socket.onclose = (event) => {
        console.log(`웹소켓 연결 종료: ${event.code}`);
        this.socket = null;
        this.isConnecting = false;
        this.updateConnectionStatus(false);

        // 3초 후 재연결 시도
        setTimeout(() => this.initWebSocket(onMessage), 3000);
      };

      this.socket.onerror = (error) => {
        console.error("웹소켓 오류:", error);
        this.isConnecting = false;
        this.updateConnectionStatus(false);
        this.toggleLoadingSpinner(false);
      };
    } catch (error) {
      console.error("웹소켓 초기화 오류:", error);
      this.isConnecting = false;
      this.toggleLoadingSpinner(false);
    }
  }

  /**
   * 연결 상태를 UI에 업데이트합니다.
   * @param {boolean} isConnected - 연결 상태
   */
  updateConnectionStatus(isConnected) {
    const statusElement = document.getElementById("connectionStatus");
    if (statusElement) {
      statusElement.className = isConnected ? "online" : "offline";
      statusElement.textContent = isConnected
        ? "서버 연결됨"
        : "서버 연결 끊김";
    }
  }

  /**
   * 로딩 스피너를 표시하거나 숨깁니다.
   * @param {boolean} show - 표시 여부
   */
  toggleLoadingSpinner(show) {
    const loadingElement = document.getElementById("loading");
    if (loadingElement) {
      loadingElement.style.display = show ? "flex" : "none";
    }
  }

  /**
   * 웹소켓 연결 상태를 확인합니다.
   * @returns {boolean} - 연결 상태
   */
  isSocketConnected() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  /**
   * 웹소켓 연결을 종료합니다.
   */
  closeWebSocket() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  async getOpenOrders(params = {}) {
    let endpoint = "orders/open";
    const queryParams = [];

    // 쿼리 파라미터 구성
    if (params.market) queryParams.push(`market=${params.market}`);
    if (params.state) queryParams.push(`state=${params.state}`);
    if (params.states) queryParams.push(`states=${params.states}`);
    if (params.page) queryParams.push(`page=${params.page}`);
    if (params.limit) queryParams.push(`limit=${params.limit}`);
    if (params.order_by) queryParams.push(`order_by=${params.order_by}`);

    // 쿼리 파라미터 추가
    if (queryParams.length > 0) {
      endpoint += `?${queryParams.join("&")}`;
    }

    return this.get(endpoint);
  }

  async getClosedOrders(params = {}) {
    let endpoint = "orders/closed";
    const queryParams = [];

    // 쿼리 파라미터 구성
    if (params.market) queryParams.push(`market=${params.market}`);
    if (params.state) queryParams.push(`state=${params.state}`);
    if (params.states) queryParams.push(`states=${params.states}`);
    if (params.uuids) queryParams.push(`uuids=${params.uuids}`);
    if (params.page) queryParams.push(`page=${params.page}`);
    if (params.limit) queryParams.push(`limit=${params.limit}`);
    if (params.order_by) queryParams.push(`order_by=${params.order_by}`);

    // 쿼리 파라미터 추가
    if (queryParams.length > 0) {
      endpoint += `?${queryParams.join("&")}`;
    }

    return this.get(endpoint);
  }

  async getProfitRate(market) {
    return this.get(`profit/${market}`);
  }
}

// API 서비스 인스턴스 생성
const apiService = new ApiService();
