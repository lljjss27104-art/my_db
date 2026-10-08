/**
 * ===================================================================
 * 바이브 카페 주문서 및 주문 내역 기능 스크립트 (script.js)
 * ===================================================================
 */

// -------------------------------------------------------------------
// [Supabase 설정]
// 사용자의 Supabase 프로젝트 대시보드(Settings > API)에서 확인하여 값을 입력해주세요.
// -------------------------------------------------------------------
const SUPABASE_URL = 'https://zpatjimqcozitmvwxwnv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwYXRqaW1xY296aXRtdnd4d252Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MTM0MzAsImV4cCI6MjEwNjk4OTQzMH0.57s4OktKmETThPxhDnfB_VvEhnuBfZqZ0_rSmOiqhl4';

// Supabase 클라이언트 초기화 (요청하신 변수명: supabaseClient)
// URL 앞뒤 공백을 제거하고, 예외 처리를 추가하여 안전하게 생성합니다.
let supabaseClient = null;

try {
  const cleanUrl = typeof SUPABASE_URL === 'string' ? SUPABASE_URL.trim() : '';
  const cleanKey = typeof SUPABASE_KEY === 'string' ? SUPABASE_KEY.trim() : '';

  if (window.supabase && (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'))) {
    const { createClient } = window.supabase;
    supabaseClient = createClient(cleanUrl, cleanKey);
  } else {
    console.warn('⚠️ Supabase URL이 올바른 HTTP/HTTPS 형식이 아닙니다. SUPABASE_URL을 확인해주세요.');
  }
} catch (err) {
  console.error('Supabase 클라이언트 생성 중 오류가 발생했습니다:', err);
}

// HTML 문서가 모두 로드되면 동작 시작
document.addEventListener('DOMContentLoaded', function () {
  // -----------------------------------------------------------------
  // 1. 사용할 HTML 요소(DOM) 가져오기
  // -----------------------------------------------------------------
  // 탭 네비게이션 요소
  const tabOrderBtn = document.getElementById('tab-order-btn');       // 주문하기 탭 버튼
  const tabHistoryBtn = document.getElementById('tab-history-btn');   // 주문 내역 탭 버튼
  const orderTabPanel = document.getElementById('order-tab-panel');   // 주문하기 화면 영역
  const historyTabPanel = document.getElementById('history-tab-panel'); // 주문 내역 화면 영역
  const orderCountBadge = document.getElementById('order-count-badge'); // 주문 내역 건수 배지

  // 주문서 폼 요소
  const orderForm = document.getElementById('order-form');               // 주문서 폼 전체
  const customerNameInput = document.getElementById('customer-name');   // 이름 입력창
  const customerPhoneInput = document.getElementById('customer-phone'); // 전화번호 입력창
  const drinkSelect = document.getElementById('drink-select');           // 음료 선택 드롭다운
  const sizeRadios = document.querySelectorAll('input[name="size"]');    // 사이즈 라디오 버튼들
  const optionCheckboxes = document.querySelectorAll('input[name="options"]'); // 추가 옵션 체크박스들
  const quantityInput = document.getElementById('quantity');             // 수량 입력창
  const requestsInput = document.getElementById('requests');             // 요청사항 텍스트 영역
  const estimatedPriceSpan = document.getElementById('estimated-price'); // 예상 금액 표시 span
  const submitBtn = document.getElementById('submit-btn');               // 주문하기 버튼
  const resetBtn = document.getElementById('reset-btn');                 // 다시 작성 버튼
  const orderConfirmation = document.getElementById('order-confirmation'); // 주문 확인 메시지 상자

  // 주문 내역 탭 요소
  const orderList = document.getElementById('order-list');               // 주문 카드 목록 컨테이너
  const emptyHistoryMsg = document.getElementById('empty-history-msg');   // 내역 없을 때 안내 문구
  const orderSummaryContainer = document.getElementById('order-summary-container'); // 총 금액 및 지우기 영역
  const allOrdersTotalSpan = document.getElementById('all-orders-total'); // 총 주문 금액 표시 span
  const allOrdersCountSpan = document.getElementById('all-orders-count'); // 총 주문 건수 표시 span
  const clearAllBtn = document.getElementById('clear-all-btn');           // 내역 모두 지우기 버튼

  // -----------------------------------------------------------------
  // 2. 주문 데이터 관리 변수 및 매핑 테이블
  // -----------------------------------------------------------------
  let orders = [];          // 접수된 주문 목록을 보관하는 로컬 배열
  let orderIdCounter = 1;   // 임시 주문 고유 번호 (#1, #2, ...)

  // 음료 value -> 한글 이름 매핑
  const DRINK_NAMES = {
    'americano': '아메리카노',
    'latte': '카페라떼',
    'mocha': '카페모카',
    'vanilla-latte': '바닐라라떼',
    'green-tea-latte': '녹차라떼',
    'ashotchu': '아샷추',
    'matcha-latte': '말차라떼'
  };

  // 추가 옵션 value -> 한글 이름 매핑
  const OPTION_NAMES = {
    'shot': '샷 추가',
    'cream': '크림 추가',
    'syrup': '시럽 추가',
    'decaf': '디카페인'
  };

  // -----------------------------------------------------------------
  // 3. 총 예상 금액 계산 함수 (calculateTotal)
  // -----------------------------------------------------------------
  function calculateTotal() {
    // (1) 음료 선택 확인
    const selectedOption = drinkSelect.options[drinkSelect.selectedIndex];
    const drinkValue = drinkSelect.value;

    // 음료를 고르지 않은 상태면 0원 표시
    if (!drinkValue) {
      estimatedPriceSpan.textContent = '0';
      return 0;
    }

    // 음료 기본 가격 (data-price)
    const drinkPrice = Number(selectedOption.dataset.price) || 0;

    // (2) 사이즈 추가금
    const selectedSizeRadio = document.querySelector('input[name="size"]:checked');
    const sizePrice = selectedSizeRadio ? Number(selectedSizeRadio.dataset.price) || 0 : 0;

    // (3) 추가 옵션 금액 합산
    let optionsPrice = 0;
    const checkedOptions = document.querySelectorAll('input[name="options"]:checked');
    checkedOptions.forEach(function (checkbox) {
      optionsPrice += Number(checkbox.dataset.price) || 0;
    });

    // (4) 수량 가져오기
    let quantity = parseInt(quantityInput.value, 10);
    if (isNaN(quantity) || quantity < 1) {
      quantity = 1;
    }

    // (5) 한 잔당 금액에 수량을 곱하여 최종 금액 산출
    const total = (drinkPrice + sizePrice + optionsPrice) * quantity;

    // (6) 천 단위 콤마 형식(예: 5,000)으로 표시
    estimatedPriceSpan.textContent = total.toLocaleString();

    return total;
  }

  // -----------------------------------------------------------------
  // 4. 주문 내역 화면 렌더링 함수 (renderOrders)
  //    - 손님이 입력한 내용은 보안(XSS 방지)을 위해 textContent 사용
  // -----------------------------------------------------------------
  function renderOrders() {
    // 탭 옆 배지의 건수 갱신
    orderCountBadge.textContent = orders.length;

    // (1) 주문 내역이 하나도 없는 경우
    if (orders.length === 0) {
      orderList.textContent = '';
      emptyHistoryMsg.classList.remove('hidden');
      orderSummaryContainer.classList.add('hidden');
      return;
    }

    // (2) 주문 내역이 있는 경우
    emptyHistoryMsg.classList.add('hidden');
    orderSummaryContainer.classList.remove('hidden');
    orderList.textContent = '';

    // 주문 카드를 하나씩 생성하여 목록에 추가
    orders.forEach(function (order) {
      const card = document.createElement('div');
      card.className = 'order-card';

      // [취소 버튼]
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'cancel-btn';
      cancelBtn.textContent = '취소';
      cancelBtn.addEventListener('click', function () {
        const isConfirmed = confirm(`#${order.id} 주문을 취소하시겠습니까?`);
        if (isConfirmed) {
          orders = orders.filter(function (item) {
            return item.id !== order.id;
          });
          renderOrders();
        }
      });
      card.appendChild(cancelBtn);

      // [1번째 줄]: "#1 홍길동님(전화번호뒤에4자리) · 5,000원"
      const line1 = document.createElement('div');
      line1.className = 'order-card-line1';
      const phoneLast4 = order.phone.length >= 4 ? order.phone.slice(-4) : order.phone;
      line1.textContent = `#${order.id} ${order.name}님(${phoneLast4}) · ${order.total.toLocaleString()}원`;
      card.appendChild(line1);

      // [2번째 줄]: "카페라떼 M사이즈 (샷 추가) 1잔"
      const line2 = document.createElement('div');
      line2.className = 'order-card-line2';
      const optionText = (order.options && order.options.length > 0)
        ? ` (${order.options.join(', ')})`
        : '';
      line2.textContent = `${order.drink} ${order.size}사이즈${optionText} ${order.quantity}잔`;
      card.appendChild(line2);

      // [3번째 줄]: 요청사항 · 주문 시간
      const line3 = document.createElement('div');
      line3.className = 'order-card-line3';
      if (order.requests && order.requests.trim() !== '') {
        line3.textContent = `${order.requests} · ${order.orderTime}`;
      } else {
        line3.textContent = order.orderTime;
      }
      card.appendChild(line3);

      orderList.appendChild(card);
    });

    // (3) 하단 총 주문 금액 및 건수 갱신
    const totalSum = orders.reduce(function (sum, item) {
      return sum + item.total;
    }, 0);
    allOrdersTotalSpan.textContent = totalSum.toLocaleString();
    allOrdersCountSpan.textContent = orders.length;
  }

  // -----------------------------------------------------------------
  // 5. 탭 메뉴 전환 이벤트
  // -----------------------------------------------------------------
  // 주문하기 탭 클릭
  tabOrderBtn.addEventListener('click', function () {
    tabOrderBtn.classList.add('active');
    tabHistoryBtn.classList.remove('active');
    orderTabPanel.classList.remove('hidden');
    historyTabPanel.classList.add('hidden');
  });

  // 주문 내역 탭 클릭
  tabHistoryBtn.addEventListener('click', function () {
    tabHistoryBtn.classList.add('active');
    tabOrderBtn.classList.remove('active');
    historyTabPanel.classList.remove('hidden');
    orderTabPanel.classList.add('hidden');
    renderOrders();
  });

  // -----------------------------------------------------------------
  // 6. 실시간 예상 금액 계산 이벤트
  // -----------------------------------------------------------------
  drinkSelect.addEventListener('change', calculateTotal);

  sizeRadios.forEach(function (radio) {
    radio.addEventListener('change', calculateTotal);
  });

  optionCheckboxes.forEach(function (checkbox) {
    checkbox.addEventListener('change', calculateTotal);
  });

  quantityInput.addEventListener('input', calculateTotal);
  quantityInput.addEventListener('change', calculateTotal);

  // -----------------------------------------------------------------
  // 7. 주문하기 버튼 클릭 (폼 제출 & Supabase DB 저장)
  // -----------------------------------------------------------------
  orderForm.addEventListener('submit', async function (event) {
    event.preventDefault(); // 기본 폼 제출(페이지 새로고침) 방지

    // 입력값 가져오기
    const name = customerNameInput.value.trim();
    const phone = customerPhoneInput.value.trim();
    const drinkValue = drinkSelect.value;
    const requests = requestsInput.value.trim();

    // [유효성 검사 1] 이름 확인
    if (!name) {
      alert('이름을 입력해주세요');
      customerNameInput.focus();
      return;
    }

    // [유효성 검사 2] 음료 선택 확인
    if (!drinkValue) {
      alert('음료를 선택해주세요');
      drinkSelect.focus();
      return;
    }

    // [유효성 검사 3] 전화번호 확인
    if (!phone) {
      alert('전화번호를 입력해주세요');
      customerPhoneInput.focus();
      return;
    }

    // 최종 금액 계산
    const total = calculateTotal();

    // 음료 기본 가격 및 음료명
    const selectedOption = drinkSelect.options[drinkSelect.selectedIndex];
    const drinkPrice = Number(selectedOption.dataset.price) || 0;
    const drinkName = DRINK_NAMES[drinkValue] || selectedOption.text;

    // 선택된 사이즈
    const selectedSizeRadio = document.querySelector('input[name="size"]:checked');
    const size = selectedSizeRadio ? selectedSizeRadio.value : 'M';

    // 선택된 추가 옵션 (문자열 배열)
    const checkedOptions = document.querySelectorAll('input[name="options"]:checked');
    const selectedOptionNames = [];
    checkedOptions.forEach(function (checkbox) {
      const optName = OPTION_NAMES[checkbox.value] || checkbox.value;
      selectedOptionNames.push(optName);
    });

    const optionText = selectedOptionNames.length > 0 ? ` (${selectedOptionNames.join(', ')})` : '';
    const quantity = parseInt(quantityInput.value, 10) || 1;

    // 주문 시간 (HH:MM 형식)
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const orderTime = `${hours}:${minutes}`;

    // ===============================================================
    // [Supabase DB 저장 처리]
    // 중복 클릭을 방지하기 위해 저장 중에는 주문하기 버튼을 비활성화합니다.
    // ===============================================================
    submitBtn.disabled = true;
    const originalBtnText = submitBtn.textContent;
    submitBtn.textContent = '주문 저장 중...';

    try {
      // Supabase 클라이언트가 정상 로드되었는지 확인
      if (!supabaseClient) {
        throw new Error('Supabase 클라이언트가 초기화되지 않았습니다. SUPABASE_URL과 SUPABASE_KEY를 확인해주세요.');
      }

      // Supabase orders 테이블에 데이터 삽입 (INSERT)
      // 요구하신 열: customer_name, phone, drink, drink_price, size, options, quantity, request, total_price
      const { data, error } = await supabaseClient
        .from('orders')
        .insert([
          {
            customer_name: name,
            phone: phone,
            drink: drinkName,
            drink_price: drinkPrice,
            size: size,
            options: selectedOptionNames,
            quantity: quantity,
            request: requests,
            total_price: total
          }
        ])
        .select();

      // DB 저장 중 오류가 발생한 경우 에러 던지기
      if (error) {
        throw error;
      }

      // [저장 성공 시 동작]
      // 1. DB에서 생성된 주문 ID 가져오기 (없으면 임시 카운터 사용)
      const orderId = (data && data[0] && data[0].id) ? data[0].id : orderIdCounter++;

      // 2. 주문 내역 목록에 추가
      const newOrder = {
        id: orderId,
        name: name,
        phone: phone,
        drink: drinkName,
        size: size,
        options: selectedOptionNames,
        quantity: quantity,
        requests: requests,
        total: total,
        orderTime: orderTime
      };
      orders.unshift(newOrder);
      renderOrders();

      // 3. 기존 주문 확인 메시지 표시
      const confirmationMessage = `${name}님, ${drinkName} ${size}사이즈${optionText} ${quantity}잔, 총 ${total.toLocaleString()}원 주문이 접수되었습니다!`;
      orderConfirmation.textContent = confirmationMessage;
      orderConfirmation.removeAttribute('hidden');
      orderConfirmation.classList.remove('hidden');

      // 4. 메시지 위치로 부드럽게 스크롤
      orderConfirmation.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (error) {
      // [저장 실패 시 동작]
      console.error('주문 저장 오류 (Supabase Error):', error);
      if (error && error.message) {
        console.error('📋 원인:', error.message, '| 상세:', error.details, '| 힌트:', error.hint);
        alert(`주문 저장에 실패했어요:\n${error.message}`);
      } else {
        alert('주문 저장에 실패했어요');
      }
    } finally {
      // 성공/실패 여부와 관계없이 버튼을 다시 활성화
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  });

  // -----------------------------------------------------------------
  // 8. 내역 모두 지우기 버튼 이벤트
  // -----------------------------------------------------------------
  clearAllBtn.addEventListener('click', function () {
    const isConfirmed = confirm('주문 내역을 모두 지우시겠습니까?');
    if (isConfirmed) {
      orders = [];
      renderOrders();
    }
  });

  // -----------------------------------------------------------------
  // 9. 다시 작성 버튼 이벤트 (주문서 폼만 초기화)
  // -----------------------------------------------------------------
  resetBtn.addEventListener('click', function () {
    setTimeout(function () {
      const defaultSizeRadio = document.getElementById('size-m');
      if (defaultSizeRadio) {
        defaultSizeRadio.checked = true;
      }

      quantityInput.value = 1;
      calculateTotal();

      orderConfirmation.textContent = '';
      orderConfirmation.setAttribute('hidden', '');
      orderConfirmation.classList.add('hidden');
    }, 0);
  });

  // -----------------------------------------------------------------
  // 10. 초기 실행 (초기 금액 0원 계산 & 빈 주문 내역 렌더링)
  // -----------------------------------------------------------------
  calculateTotal();
  renderOrders();
});
