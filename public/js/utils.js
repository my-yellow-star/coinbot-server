/**
 * 유틸리티 함수를 담당하는 모듈
 */

/**
 * 금액을 원화 형식으로 포맷팅합니다.
 * @param {number} amount - 포맷팅할 금액
 * @returns {string} 포맷팅된 금액
 */
function formatKRW(amount) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    currencyDisplay: "symbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * 수량을 포맷팅합니다.
 * @param {number} amount - 포맷팅할 수량
 * @returns {string} 포맷팅된 수량
 */
function formatAmount(amount) {
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(amount);
}

/**
 * 퍼센트를 포맷팅합니다.
 * @param {number} percent - 포맷팅할 퍼센트값
 * @returns {string} 포맷팅된 퍼센트값
 */
function formatPercent(percent) {
  return new Intl.NumberFormat("ko-KR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(percent / 100);
}

/**
 * 날짜를 사용자 친화적인 형태로 포맷팅합니다.
 * @param {string} dateString - ISO 날짜 문자열
 * @returns {string} 포맷팅된 날짜
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

/**
 * 주어진 텍스트로 토스트 메시지를 표시합니다.
 * @param {string} message - 표시할 메시지
 * @param {string} type - 메시지 타입 ('success', 'error', 'info')
 */
function showToast(message, type = "info") {
  // 이미 존재하는 토스트를 제거
  const existingToast = document.querySelector(".toast");
  if (existingToast) {
    existingToast.remove();
  }

  // 새 토스트 생성
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  // body에 토스트 추가
  document.body.appendChild(toast);

  // 토스트 표시 애니메이션
  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  // 토스트 자동 제거
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

/**
 * 로딩 스피너를 표시하거나 숨깁니다.
 * @param {boolean} show - 표시 여부
 * @param {string} containerId - 스피너를 표시할 컨테이너 ID
 */
function toggleLoadingSpinner(show, containerId = "app") {
  let spinner = document.getElementById("loading-spinner");
  const container = document.getElementById(containerId);

  if (!container) return;

  if (show) {
    if (!spinner) {
      spinner = document.createElement("div");
      spinner.id = "loading-spinner";
      spinner.className = "loading-spinner";
      spinner.innerHTML = '<div class="spinner"></div>';
      container.appendChild(spinner);
    }
    spinner.style.display = "flex";
  } else if (spinner) {
    spinner.style.display = "none";
  }
}

/**
 * 두 값 사이의 변화율을 계산합니다.
 * @param {number} currentValue - 현재 값
 * @param {number} previousValue - 이전 값
 * @returns {number} 변화율(%)
 */
function calculateChangeRate(currentValue, previousValue) {
  if (!previousValue) return 0;
  return ((currentValue - previousValue) / previousValue) * 100;
}

/**
 * 디바운스 함수 - 연속 호출 시 마지막 호출만 실행합니다.
 * @param {Function} func - 실행할 함수
 * @param {number} wait - 대기 시간(ms)
 * @returns {Function} 디바운스된 함수
 */
function debounce(func, wait = 300) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(this, args);
    }, wait);
  };
}

/**
 * 주어진 요소의 데이터를 업데이트합니다.
 * @param {string} elementId - 요소 ID
 * @param {string} text - 표시할 텍스트
 * @param {string} type - 데이터 타입 ('number', 'price', 'percent')
 */
function updateElementText(elementId, text, type = "text") {
  const element = document.getElementById(elementId);
  if (!element) return;

  let formattedText = text;

  // 타입별 포맷팅
  if (type === "price" && !isNaN(text)) {
    formattedText = formatKRW(Number(text));
  } else if (type === "percent" && !isNaN(text)) {
    formattedText = formatPercent(Number(text));

    // 양수/음수에 따른 클래스 추가
    element.classList.remove("positive", "negative");
    if (Number(text) > 0) {
      element.classList.add("positive");
    } else if (Number(text) < 0) {
      element.classList.add("negative");
    }
  } else if (type === "number" && !isNaN(text)) {
    formattedText = formatAmount(Number(text));
  } else if (type === "date" && text) {
    formattedText = formatDate(text);
  }

  element.textContent = formattedText;
}
