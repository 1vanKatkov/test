const TELEGRAM_INIT_DATA_KEY = "astrolhub.telegramInitData";
const TELEGRAM_AUTH_TOKEN_KEY = "astrolhub.telegramAuthToken";

const state = {
  telegramInitData: localStorage.getItem(TELEGRAM_INIT_DATA_KEY) || sessionStorage.getItem(TELEGRAM_INIT_DATA_KEY) || "",
  telegramAuthToken:
    localStorage.getItem(TELEGRAM_AUTH_TOKEN_KEY) || sessionStorage.getItem(TELEGRAM_AUTH_TOKEN_KEY) || "",
  emailAuthToken: localStorage.getItem("astrolhub.emailAuthToken") || "",
  lastPaymentId: sessionStorage.getItem("astrolhub.lastPaymentId") || "",
  selectedSupportTicketId: null,
  profileProvider: "guest",
};
const lang = document.body.dataset.lang === "en" ? "en" : "ru";
const currentReportId = Number(document.body.dataset.reportId || 0);
const PROFILE_CACHE_KEY = "astrolhub.profileCache";
const BALANCE_CACHE_KEY = "astrolhub.balanceCache";
const CACHE_TTL_MS = 300000;
const i18n = lang === "en"
  ? {
    guest: "Guest",
    requestError: "Request failed",
    creatingPayment: "Creating payment...",
    paymentCreated: "Payment created",
    needCreatePaymentFirst: "Create a payment first",
    enterEmail: "Enter a valid email",
    paymentPending: "Payment is pending",
    paymentsHistoryEmpty: "No payments yet",
    cancelPayment: "Cancel",
    cancellingPayment: "Cancelling payment...",
    canceled: "Canceled",
    statusPending: "Pending",
    statusSucceeded: "Succeeded",
    statusCanceled: "Canceled",
    statusWaitingCapture: "Waiting for capture",
    credited: "Credited",
    status: "Status",
    balance: "Balance",
    analyzingDream: "Analyzing dream...",
    generatingReport: "Generating report...",
    reportReady: "Report is ready",
    calculating: "Calculating...",
    maxPrefix: "MAX",
    tgPrefix: "Telegram",
    devBypassPrefix: "Dev bypass",
    emailPrefix: "Email",
    authSuccess: "Authentication successful",
    loading: "Loading...",
    noHistory: "No request history yet",
    noTickets: "No tickets yet",
    ticket: "Ticket",
    lunarLoaded: "Lunar calendar loaded",
    phase_new_moon: "New moon",
    phase_waxing_crescent: "Waxing crescent",
    phase_first_quarter: "First quarter",
    phase_waxing_gibbous: "Waxing gibbous",
    phase_full_moon: "Full moon",
    phase_waning_gibbous: "Waning gibbous",
    phase_last_quarter: "Last quarter",
    phase_waning_crescent: "Waning crescent",
    noAdminData: "No admin data",
    reportReady: "Report is ready",
    openReport: "Open report",
    showAnswer: "Show answer",
    hideAnswer: "Hide answer",
    authCellTitle: "Email authorization",
    authCellOpen: "Sign in with email",
    loginViaTelegram: "Log in with Telegram",
    telegramOnlyMiniApp: "Open this page inside Telegram Mini App to sign in with Telegram.",
    telegramAuthFailed: "Telegram authorization failed. Try opening from the bot again.",
    close: "Close",
    chooseTicketFirst: "Choose ticket first",
  }
  : {
    guest: "Гость",
    requestError: "Ошибка запроса",
    creatingPayment: "Создаем платеж...",
    paymentCreated: "Платеж создан",
    needCreatePaymentFirst: "Сначала создайте платеж",
    enterEmail: "Введите корректный email",
    paymentPending: "Платеж еще в обработке",
    paymentsHistoryEmpty: "Платежей пока нет",
    cancelPayment: "Отменить",
    cancellingPayment: "Отменяем платеж...",
    canceled: "Отменен",
    statusPending: "Ожидает оплату",
    statusSucceeded: "Оплачен",
    statusCanceled: "Отменен",
    statusWaitingCapture: "Ожидает подтверждение",
    credited: "Зачислено",
    status: "Статус",
    balance: "Баланс",
    analyzingDream: "Выполняется анализ...",
    generatingReport: "Генерация отчета...",
    reportReady: "Отчет готов",
    calculating: "Выполняется расчет...",
    maxPrefix: "MAX",
    tgPrefix: "Telegram",
    devBypassPrefix: "Dev bypass",
    emailPrefix: "Email",
    authSuccess: "Авторизация успешна",
    loading: "Загрузка...",
    noHistory: "История запросов пока пуста",
    noTickets: "Обращений пока нет",
    ticket: "Обращение",
    lunarLoaded: "Лунный календарь загружен",
    phase_new_moon: "Новолуние",
    phase_waxing_crescent: "Растущий серп",
    phase_first_quarter: "Первая четверть",
    phase_waxing_gibbous: "Растущая луна",
    phase_full_moon: "Полнолуние",
    phase_waning_gibbous: "Убывающая луна",
    phase_last_quarter: "Последняя четверть",
    phase_waning_crescent: "Убывающий серп",
    noAdminData: "Нет данных",
    reportReady: "Разбор готов",
    openReport: "Открыть отчет",
    showAnswer: "Показать ответ",
    hideAnswer: "Скрыть ответ",
    authCellTitle: "Авторизация по email",
    authCellOpen: "Войти по email",
    loginViaTelegram: "Войти через Telegram",
    telegramOnlyMiniApp: "Откройте эту страницу внутри Telegram Mini App, чтобы войти через Telegram.",
    telegramAuthFailed: "Не удалось авторизоваться через Telegram. Попробуйте снова открыть приложение из бота.",
    close: "Закрыть",
    chooseTicketFirst: "Сначала выберите обращение",
  };

function element(id) {
  return document.getElementById(id);
}

function setResult(id, text) {
  const node = element(id);
  if (node) {
    node.textContent = text || "";
  }
}

function setBalance(value) {
  const headerSparks = element("header-sparks");
  if (headerSparks) {
    headerSparks.textContent = String(value);
  }
  const node = element("balance-view");
  if (node) {
    node.textContent = String(value);
  }
}

function setAuthBadge(text) {
  const node = element("auth-provider");
  if (node) {
    node.textContent = text;
  }
}

function setAuthUsername(username) {
  const node = element("auth-username");
  if (node) {
    node.textContent = username || i18n.guest;
  }
}

function isSocialAuthorized() {
  return state.profileProvider !== "guest";
}

function toggleEmailAuthEntry() {
  const entry = element("email-auth-entry");
  if (entry) {
    entry.style.display = isSocialAuthorized() ? "none" : "";
  }
}

function setEmailAuthModalOpen(isOpen) {
  const modal = element("email-auth-modal");
  if (!modal) {
    return;
  }
  modal.classList.toggle("is-open", isOpen);
}

function ensureTelegramLoginButton() {
  const modal = element("email-auth-modal");
  const authResultNode = element("auth-result");
  if (!modal || !authResultNode || element("telegram-login-btn")) {
    return;
  }
  const button = document.createElement("button");
  button.id = "telegram-login-btn";
  button.type = "button";
  button.className = "secondary-btn";
  button.textContent = i18n.loginViaTelegram;

  const firstForm = modal.querySelector("form");
  if (firstForm && firstForm.parentNode) {
    firstForm.parentNode.insertBefore(button, firstForm);
  } else {
    authResultNode.parentNode?.insertBefore(button, authResultNode);
  }
}

function setAdminTileVisible(isVisible) {
  const entry = element("admin-panel-entry");
  const button = element("admin-panel-button");
  if (!button || !entry) {
    return;
  }
  entry.hidden = !isVisible;
  button.hidden = !isVisible;
}

async function updateAdminTileVisibility() {
  if (!element("admin-panel-button") || !element("admin-panel-entry")) {
    return;
  }
  if (state.profileProvider !== "email") {
    setAdminTileVisible(false);
    return;
  }
  try {
    const result = await apiRequest("/api/admin/me", "GET");
    setAdminTileVisible(Boolean(result.is_admin));
  } catch {
    setAdminTileVisible(false);
  }
}

function saveTimedCache(key, value) {
  sessionStorage.setItem(
    key,
    JSON.stringify({
      ts: Date.now(),
      value,
    }),
  );
}

function readTimedCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const payload = JSON.parse(raw);
    if (!payload?.ts || Date.now() - payload.ts > CACHE_TTL_MS) {
      return null;
    }
    return payload.value;
  } catch {
    return null;
  }
}

function persistTelegramInitData(initData) {
  state.telegramInitData = initData || "";
  if (!state.telegramInitData) {
    sessionStorage.removeItem(TELEGRAM_INIT_DATA_KEY);
    localStorage.removeItem(TELEGRAM_INIT_DATA_KEY);
    return;
  }
  sessionStorage.setItem(TELEGRAM_INIT_DATA_KEY, state.telegramInitData);
  localStorage.setItem(TELEGRAM_INIT_DATA_KEY, state.telegramInitData);
}

function persistTelegramAuthToken(token) {
  state.telegramAuthToken = token || "";
  if (!state.telegramAuthToken) {
    sessionStorage.removeItem(TELEGRAM_AUTH_TOKEN_KEY);
    localStorage.removeItem(TELEGRAM_AUTH_TOKEN_KEY);
    return;
  }
  sessionStorage.setItem(TELEGRAM_AUTH_TOKEN_KEY, state.telegramAuthToken);
  localStorage.setItem(TELEGRAM_AUTH_TOKEN_KEY, state.telegramAuthToken);
}

function hydrateUiFromCache() {
  const profile = readTimedCache(PROFILE_CACHE_KEY);
  state.profileProvider = profile?.provider || "guest";
  if (profile?.provider === "max") {
    setAuthBadge(`${i18n.maxPrefix}: ${profile.username}`);
    setAuthUsername(profile.username);
  } else if (profile?.provider === "telegram") {
    setAuthBadge(`${i18n.tgPrefix}: ${profile.username}`);
    setAuthUsername(profile.username);
  } else if (profile?.provider === "email") {
    setAuthBadge(`${i18n.emailPrefix}: ${profile.username}`);
    setAuthUsername(profile.username);
  } else {
    setAuthUsername(i18n.guest);
  }
  const balance = readTimedCache(BALANCE_CACHE_KEY);
  if (typeof balance === "number") {
    setBalance(balance);
  }
  toggleEmailAuthEntry();
}

function getAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (state.telegramAuthToken) {
    headers["X-Telegram-Auth-Token"] = state.telegramAuthToken;
  }
  if (state.telegramInitData) {
    headers["X-Telegram-Init-Data"] = state.telegramInitData;
  }
  if (state.emailAuthToken) {
    headers["X-Email-Auth-Token"] = state.emailAuthToken;
  }
  return headers;
}

async function apiRequest(url, method, bodyObj) {
  const response = await fetch(url, {
    method,
    headers: getAuthHeaders(),
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });
  const rawText = await response.text();
  let data = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      if (!response.ok) {
        throw new Error(rawText || i18n.requestError);
      }
    }
  }
  if (!response.ok) {
    throw new Error((data && (data.error || data.detail)) || rawText || i18n.requestError);
  }
  return data || {};
}

async function autoVerifyTelegram() {
  async function waitForTelegramInitData(maxAttempts = 20, delayMs = 120) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        const initData = tg.initData || "";
        if (initData) {
          return initData;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return "";
  }

  const initData = await waitForTelegramInitData();
  if (initData) {
    persistTelegramInitData(initData);
  }
  if (state.telegramAuthToken || !state.telegramInitData) {
    return;
  }
  try {
    const result = await apiRequest("/api/auth/telegram/verify", "POST", {
      init_data: state.telegramInitData,
    });
    if (result.token) {
      persistTelegramAuthToken(result.token);
    }
    if (result.profile) {
      saveTimedCache(PROFILE_CACHE_KEY, result.profile);
      saveTimedCache(BALANCE_CACHE_KEY, result.balance);
    }
  } catch {
    persistTelegramAuthToken("");
  }
}

async function loadProfile() {
  try {
    const profile = await apiRequest("/api/profile", "GET");
    saveTimedCache(PROFILE_CACHE_KEY, profile);
    state.profileProvider = profile.provider || "guest";
    if (profile.provider === "max") {
      setAuthBadge(`${i18n.maxPrefix}: ${profile.username}`);
      setAuthUsername(profile.username);
      toggleEmailAuthEntry();
      updateAdminTileVisibility().catch(() => {});
      return;
    }
    if (profile.provider === "telegram") {
      setAuthBadge(`${i18n.tgPrefix}: ${profile.username}`);
      setAuthUsername(profile.username);
      toggleEmailAuthEntry();
      updateAdminTileVisibility().catch(() => {});
      return;
    }
    if (profile.provider === "email") {
      setAuthBadge(`${i18n.emailPrefix}: ${profile.username}`);
      setAuthUsername(profile.username);
      toggleEmailAuthEntry();
      updateAdminTileVisibility().catch(() => {});
      return;
    }
    setAuthBadge(i18n.guest);
    setAuthUsername(i18n.guest);
    toggleEmailAuthEntry();
    updateAdminTileVisibility().catch(() => {});
  } catch {
    state.profileProvider = "guest";
    setAuthBadge(i18n.guest);
    setAuthUsername(i18n.guest);
    toggleEmailAuthEntry();
    updateAdminTileVisibility().catch(() => {});
  }
}

function wireEmailAuthForms() {
  const registerForm = element("email-register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setResult("auth-result", i18n.calculating);
      try {
        const result = await apiRequest("/api/auth/email/register", "POST", {
          email: element("register-email").value.trim(),
          password: element("register-password").value,
          username: (element("register-username")?.value || "").trim(),
          language: lang,
        });
        state.emailAuthToken = result.token;
        localStorage.setItem("astrolhub.emailAuthToken", result.token);
        setAuthBadge(`${i18n.emailPrefix}: ${result.profile.username}`);
        setAuthUsername(result.profile.username);
        state.profileProvider = "email";
        toggleEmailAuthEntry();
        updateAdminTileVisibility().catch(() => {});
        setBalance(result.balance);
        setResult("auth-result", i18n.authSuccess);
        setEmailAuthModalOpen(false);
        window.location.href = `/client?lang=${lang}`;
      } catch (error) {
        setResult("auth-result", error.message);
      }
    });
  }

  const loginForm = element("email-login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setResult("auth-result", i18n.calculating);
      try {
        const result = await apiRequest("/api/auth/email/login", "POST", {
          email: element("login-email").value.trim(),
          password: element("login-password").value,
        });
        state.emailAuthToken = result.token;
        localStorage.setItem("astrolhub.emailAuthToken", result.token);
        setAuthBadge(`${i18n.emailPrefix}: ${result.profile.username}`);
        setAuthUsername(result.profile.username);
        state.profileProvider = "email";
        toggleEmailAuthEntry();
        updateAdminTileVisibility().catch(() => {});
        setBalance(result.balance);
        setResult("auth-result", i18n.authSuccess);
        setEmailAuthModalOpen(false);
        window.location.href = `/client?lang=${lang}`;
      } catch (error) {
        setResult("auth-result", error.message);
      }
    });
  }
}

function wireEmailAuthModal() {
  ensureTelegramLoginButton();
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.closest("#open-email-auth-modal")) {
      setEmailAuthModalOpen(true);
      return;
    }
    if (target.closest("#close-email-auth-modal")) {
      setEmailAuthModalOpen(false);
      return;
    }
    if (target.closest("#telegram-login-btn")) {
      if (!(window.Telegram && window.Telegram.WebApp)) {
        setResult("auth-result", i18n.telegramOnlyMiniApp);
        return;
      }
      setResult("auth-result", i18n.loading);
      autoVerifyTelegram()
        .then(() => loadProfile())
        .then(() => refreshBalance().catch(() => {}))
        .then(() => {
          if (state.profileProvider === "telegram") {
            setResult("auth-result", i18n.authSuccess);
            setEmailAuthModalOpen(false);
            window.location.href = `/client?lang=${lang}`;
            return;
          }
          setResult("auth-result", i18n.telegramAuthFailed);
        })
        .catch(() => {
          setResult("auth-result", i18n.telegramAuthFailed);
        });
    }
  });
  const overlay = element("email-auth-modal");
  if (overlay) {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        setEmailAuthModalOpen(false);
      }
    });
  }
}

async function refreshBalance() {
  const result = await apiRequest("/api/balance", "GET");
  setBalance(result.balance);
  saveTimedCache(BALANCE_CACHE_KEY, result.balance);
}

async function loadPaymentPackages() {
  const select = element("payment-package");
  if (!select) {
    return;
  }
  try {
    const result = await apiRequest("/api/payments/packages", "GET");
    select.innerHTML = "";
    result.packages.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      select.appendChild(option);
    });
  } catch (error) {
    setResult("payment-result", error.message);
  }
}

function wirePaymentForms() {
  const createForm = element("payment-create-form");
  if (createForm) {
    createForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setResult("payment-result", i18n.creatingPayment);
      try {
        const packageId = element("payment-package").value;
        const receiptEmail = (element("payment-email")?.value || "").trim();
        if (!receiptEmail.includes("@")) {
          throw new Error(i18n.enterEmail);
        }
        const result = await apiRequest("/api/payments/yookassa/create", "POST", {
          package_id: packageId,
          receipt_email: receiptEmail,
        });
        state.lastPaymentId = result.payment_id;
        sessionStorage.setItem("astrolhub.lastPaymentId", result.payment_id);
        setResult("payment-result", `${i18n.paymentCreated}: ${result.payment_id}`);
        if (result.confirmation_url) {
          window.location.href = result.confirmation_url;
        }
      } catch (error) {
        setResult("payment-result", error.message);
      }
    });
  }
}

function paymentStatusLabel(status) {
  if (status === "pending") {
    return i18n.statusPending;
  }
  if (status === "succeeded") {
    return i18n.statusSucceeded;
  }
  if (status === "canceled") {
    return i18n.statusCanceled;
  }
  if (status === "waiting_for_capture") {
    return i18n.statusWaitingCapture;
  }
  return status;
}

function supportTicketStatusLabel(status) {
  if (status === "open") {
    return lang === "en" ? "Open" : "Открыто";
  }
  if (status === "closed") {
    return lang === "en" ? "Closed" : "Закрыто";
  }
  return status;
}

function renderRequestHistory(items) {
  const container = element("request-history");
  if (!container) {
    return;
  }
  if (!items.length) {
    container.textContent = i18n.noHistory;
    return;
  }
  container.innerHTML = items
    .map((item) => {
      const reportLink = item.report_url
        ? `<a class="secondary-btn inline-link-btn" href="${item.report_url}">${i18n.openReport}</a>`
        : "";
      return `<article class="history-row history-item" data-item-id="${item.id}">
      <button class="history-summary-btn" type="button" data-item-id="${item.id}">
        <span class="history-summary-main">${item.input_text}</span>
        <span class="muted">${new Date(item.created_at).toLocaleString()}</span>
      </button>
      <div id="history-answer-${item.id}" class="history-answer">
        <div><b>${lang === "en" ? "Answer" : "Ответ"}:</b> ${item.output_text}</div>
        <div class="history-actions">${reportLink}</div>
      </div>
    </article>`;
    })
    .join("");
}

function wireRequestHistory() {
  const container = element("request-history");
  if (!container) {
    return;
  }
  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest(".history-summary-btn");
    if (!button) {
      return;
    }
    const itemId = button.dataset.itemId;
    if (!itemId) {
      return;
    }
    const answer = element(`history-answer-${itemId}`);
    if (!answer) {
      return;
    }
    answer.classList.toggle("is-open");
  });
}

async function loadRequestHistory() {
  if (!element("request-history")) {
    return;
  }
  setResult("history-result", i18n.loading);
  try {
    const result = await apiRequest("/api/history/requests?limit=50", "GET");
    renderRequestHistory(result.items || []);
    setResult("history-result", "");
  } catch (error) {
    setResult("history-result", error.message);
  }
}

function renderSupportTickets(tickets) {
  const container = element("support-tickets");
  if (!container) {
    return;
  }
  if (!tickets.length) {
    container.textContent = i18n.noTickets;
    return;
  }
  container.innerHTML = tickets
    .map((ticket) => `<article class="history-row">
      <div class="payment-row-top">
        <strong>${i18n.ticket} #${ticket.id}</strong>
        <span class="payment-status">${supportTicketStatusLabel(ticket.status)}</span>
      </div>
      <div>${ticket.subject}</div>
      <button class="secondary-btn support-ticket-open" data-ticket-id="${ticket.id}" type="button">
        ${lang === "en" ? "Open dialog" : "Открыть диалог"}
      </button>
    </article>`)
    .join("");
}

function renderSupportMessages(messages) {
  const container = element("support-messages");
  if (!container) {
    return;
  }
  container.innerHTML = messages
    .map((item) => `<article class="history-row">
      <div class="payment-row-top">
        <strong>${item.username || `#${item.author_user_id}`}</strong>
        <span class="muted">${new Date(item.created_at).toLocaleString()}</span>
      </div>
      <div>${item.message_text}</div>
    </article>`)
    .join("");
}

async function loadSupportTickets() {
  if (!element("support-tickets")) {
    return;
  }
  try {
    const result = await apiRequest("/api/support/tickets", "GET");
    renderSupportTickets(result.tickets || []);
  } catch (error) {
    setResult("support-result", error.message);
  }
}

async function loadSupportTicketMessages(ticketId) {
  if (!element("support-messages")) {
    return;
  }
  try {
    const result = await apiRequest(`/api/support/tickets/${ticketId}`, "GET");
    renderSupportMessages(result.messages || []);
    state.selectedSupportTicketId = ticketId;
  } catch (error) {
    setResult("support-result", error.message);
  }
}

function wireSupportForms() {
  const form = element("support-ticket-form");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setResult("support-result", i18n.loading);
      try {
        const result = await apiRequest("/api/support/tickets", "POST", {
          subject: element("support-subject").value.trim(),
          message_text: element("support-message").value.trim(),
        });
        setResult("support-result", `${i18n.ticket} #${result.ticket_id}`);
        await loadSupportTickets();
      } catch (error) {
        setResult("support-result", error.message);
      }
    });
  }

  const ticketsContainer = element("support-tickets");
  if (ticketsContainer) {
    ticketsContainer.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest(".support-ticket-open");
      if (!button) {
        return;
      }
      const ticketId = Number(button.dataset.ticketId || 0);
      if (!ticketId) {
        return;
      }
      await loadSupportTicketMessages(ticketId);
    });
  }

  const replyForm = element("support-reply-form");
  if (replyForm) {
    replyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.selectedSupportTicketId) {
        setResult("support-result", i18n.chooseTicketFirst);
        return;
      }
      try {
        const result = await apiRequest(
          `/api/support/tickets/${state.selectedSupportTicketId}/messages`,
          "POST",
          { message_text: element("support-reply-message").value.trim() },
        );
        renderSupportMessages(result.messages || []);
        element("support-reply-message").value = "";
      } catch (error) {
        setResult("support-result", error.message);
      }
    });
  }
}

function phaseLabel(phase) {
  return i18n[`phase_${phase}`] || phase;
}

function renderLunarMonth(days) {
  const container = element("lunar-calendar");
  if (!container) {
    return;
  }
  container.innerHTML = days
    .map((day) => `<article class="history-row">
      <div class="payment-row-top">
        <strong>${day.day}</strong>
        <span class="payment-status">${phaseLabel(day.phase)}</span>
      </div>
      <div class="muted">${lang === "en" ? "Illumination" : "Освещенность"}: ${day.illumination_percent}%</div>
      <div>${day.advice}</div>
    </article>`)
    .join("");
}

async function loadLunarMonth(year, month) {
  if (!element("lunar-calendar")) {
    return;
  }
  setResult("lunar-result", i18n.loading);
  try {
    const query = new URLSearchParams();
    if (year) {
      query.set("year", String(year));
    }
    if (month) {
      query.set("month", String(month));
    }
    const result = await apiRequest(`/api/lunar/month?${query.toString()}`, "GET");
    renderLunarMonth(result.days || []);
    setResult("lunar-result", i18n.lunarLoaded);
  } catch (error) {
    setResult("lunar-result", error.message);
  }
}

function wireLunarForm() {
  const form = element("lunar-form");
  if (!form) {
    return;
  }
  const today = new Date();
  if (element("lunar-year")) {
    element("lunar-year").value = String(today.getFullYear());
  }
  if (element("lunar-month")) {
    element("lunar-month").value = String(today.getMonth() + 1);
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadLunarMonth(Number(element("lunar-year").value), Number(element("lunar-month").value));
  });
  loadLunarMonth(today.getFullYear(), today.getMonth() + 1).catch(() => {});
}

function renderPaymentsHistory(payments) {
  const container = element("payments-history");
  if (!container) {
    return;
  }
  if (!payments.length) {
    container.textContent = i18n.paymentsHistoryEmpty;
    return;
  }
  container.innerHTML = payments
    .map((payment) => {
      const createdAt = new Date(payment.created_at).toLocaleString();
      const cancelButton = payment.can_cancel
        ? `<button class="secondary-btn payment-cancel-btn" data-payment-id="${payment.payment_id}" type="button">${i18n.cancelPayment}</button>`
        : "";
      return `<article class="payment-row">
        <div class="payment-row-top">
          <strong>${payment.sparks} ${lang === "en" ? "sparks" : "искр"}</strong>
          <span class="payment-status">${paymentStatusLabel(payment.status)}</span>
        </div>
        <div class="muted">${payment.amount}₽ • ${createdAt}</div>
        <div class="payment-row-actions">${cancelButton}</div>
      </article>`;
    })
    .join("");
}

async function loadPaymentsHistory() {
  const container = element("payments-history");
  if (!container) {
    return;
  }
  try {
    const result = await apiRequest("/api/payments/yookassa/history", "GET");
    renderPaymentsHistory(result.payments || []);
    setBalance(result.balance);
  } catch (error) {
    setResult("payment-result", error.message);
  }
}

async function syncPendingPayments() {
  const container = element("payments-history");
  if (!container) {
    return;
  }
  try {
    const result = await apiRequest("/api/payments/yookassa/sync-pending", "POST");
    setBalance(result.balance);
    await loadPaymentsHistory();
  } catch (error) {
    setResult("payment-result", error.message);
  }
}

function wirePaymentsHistoryActions() {
  const container = element("payments-history");
  if (!container) {
    return;
  }
  container.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest(".payment-cancel-btn");
    if (!button) {
      return;
    }
    const paymentId = button.dataset.paymentId;
    if (!paymentId) {
      return;
    }
    setResult("payment-result", i18n.cancellingPayment);
    try {
      const result = await apiRequest(`/api/payments/yookassa/${paymentId}/cancel`, "POST");
      setResult("payment-result", `${i18n.canceled}. ${i18n.status}: ${paymentStatusLabel(result.status)}`);
      await loadPaymentsHistory();
    } catch (error) {
      setResult("payment-result", error.message);
    }
  });
}

function wireSonnikForm() {
  const form = element("sonnik-form");
  if (!form) {
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setResult("sonnik-result", i18n.analyzingDream);
    try {
      const result = await apiRequest("/api/sonnik/interpret", "POST", {
        dream_text: element("dream-text").value.trim(),
      });
      setResult("sonnik-result", result.interpretation);
      setBalance(result.balance);
    } catch (error) {
      setResult("sonnik-result", error.message);
    }
  });
}

function wireNumerologyForm() {
  const form = element("numerology-form");
  if (!form) {
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setResult("numerology-result", i18n.generatingReport);
    try {
      const result = await apiRequest("/api/numerology/generate", "POST", {
        full_name: element("full-name").value.trim(),
        birth_date: element("birth-date").value.trim(),
      });
      const resultNode = element("numerology-result");
      if (resultNode) {
        resultNode.innerHTML = `${i18n.reportReady}: <a href="${result.report_url}">${lang === "en" ? "Open report" : "Открыть разбор"}</a>`;
      }
      setBalance(result.balance);
    } catch (error) {
      setResult("numerology-result", error.message);
    }
  });
}

function renderNumerologyReport(report) {
  const container = element("numerology-report-view");
  if (!container) {
    return;
  }
  const numbers = report.numbers || {};
  const sections = report.sections || {};
  const matrix = report.matrix || {};
  const missing = report.missing_energies || [];
  const innate = report.innate_energies || [];
  container.innerHTML = `
    <h3>${report.full_name || ""}</h3>
    <div class="muted">${report.birth_date || ""}</div>
    <div class="history-row"><b>${lang === "en" ? "Consciousness" : "Сознание"}:</b> ${numbers.consciousness ?? "-"}</div>
    <div class="history-row"><b>${lang === "en" ? "Destiny" : "Судьба"}:</b> ${numbers.destiny ?? "-"}</div>
    <div class="history-row"><b>${lang === "en" ? "Action" : "Действие"}:</b> ${numbers.action ?? "-"}</div>
    <div class="history-row"><b>${lang === "en" ? "Character" : "Характер"}:</b> ${numbers.character ?? "-"}</div>
    <div class="history-row"><b>${lang === "en" ? "Energy" : "Энергия"}:</b> ${numbers.energy ?? "-"}</div>
    <article class="history-row"><h4>${lang === "en" ? "Consciousness" : "Число сознания"}</h4><div>${sections.consciousness?.plus || ""}</div><div>${sections.consciousness?.minus || ""}</div><div>${sections.consciousness?.comment || ""}</div></article>
    <article class="history-row"><h4>${lang === "en" ? "Destiny" : "Число судьбы"}</h4><div>${sections.destiny?.plus || ""}</div><div>${sections.destiny?.minus || ""}</div><div>${sections.destiny?.comment || ""}</div></article>
    <article class="history-row"><h4>${lang === "en" ? "Action" : "Число действия"}</h4><div>${sections.action?.["действие"] || ""}</div><div>${sections.action?.["коммент"] || ""}</div><div>${sections.action?.["наставление"] || ""}</div><div>${sections.action?.["поступки_плюс"] || ""}</div><div>${sections.action?.["поступки_минус"] || ""}</div></article>
    <article class="history-row"><h4>${lang === "en" ? "Character" : "Число характера"}</h4><div>${sections.character_text || ""}</div></article>
    <article class="history-row"><h4>${lang === "en" ? "Energy" : "Число энергии"}</h4><div>${sections.energy_text || ""}</div></article>
    <article class="history-row"><h4>${lang === "en" ? "Matrix" : "Матрица"}</h4><div>${Object.entries(matrix).map(([key, value]) => `${key}: ${value}`).join(", ")}</div></article>
    <article class="history-row"><h4>${lang === "en" ? "Innate energies" : "Врожденные энергии"}</h4><div>${innate.map((item) => `${item.number}. ${item.title}`).join("<br>")}</div></article>
    <article class="history-row"><h4>${lang === "en" ? "Missing energies" : "Недостающие энергии"}</h4><div>${missing.map((item) => `${item.number}. ${item.title}<br>${item.description}`).join("<hr>")}</div></article>
  `;
}

async function loadNumerologyReport() {
  if (!element("numerology-report-view") || !currentReportId) {
    return;
  }
  setResult("numerology-result", i18n.loading);
  try {
    const result = await apiRequest(`/api/numerology/report/${currentReportId}`, "GET");
    renderNumerologyReport(result.report || {});
    setResult("numerology-result", "");
  } catch (error) {
    setResult("numerology-result", error.message);
  }
}

function renderAdminOverview(overview) {
  const container = element("admin-overview");
  if (!container) {
    return;
  }
  const entries = Object.entries(overview || {});
  if (!entries.length) {
    container.textContent = i18n.noAdminData;
    return;
  }
  container.innerHTML = entries
    .map(([key, value]) => `<article class="history-row"><strong>${key}</strong><div>${value}</div></article>`)
    .join("");
}

function renderAdminModules(modules) {
  const container = element("admin-modules");
  if (!container) {
    return;
  }
  if (!modules.length) {
    container.textContent = i18n.noAdminData;
    return;
  }
  container.innerHTML = modules
    .map((item) => `<article class="history-row"><strong>${item.module}</strong><div>${item.total}</div></article>`)
    .join("");
}

function renderAdminTickets(tickets) {
  const container = element("admin-tickets");
  if (!container) {
    return;
  }
  if (!tickets.length) {
    container.textContent = i18n.noTickets;
    return;
  }
  container.innerHTML = tickets
    .map((ticket) => `<article class="history-row">
      <div class="payment-row-top">
        <strong>#${ticket.id} ${ticket.subject}</strong>
        <span class="payment-status">${supportTicketStatusLabel(ticket.status)}</span>
      </div>
      <div class="muted">${ticket.username || `user:${ticket.user_id}`}</div>
      <button class="secondary-btn admin-ticket-open" type="button" data-ticket-id="${ticket.id}">
        ${lang === "en" ? "Open" : "Открыть"}
      </button>
    </article>`)
    .join("");
}

function renderAdminTicketMessages(messages) {
  const container = element("admin-ticket-messages");
  if (!container) {
    return;
  }
  container.innerHTML = messages
    .map((item) => `<article class="history-row"><strong>${item.username}</strong><div>${item.message_text}</div></article>`)
    .join("");
}

async function loadAdminDashboard() {
  if (!element("admin-overview")) {
    return;
  }
  setResult("admin-result", i18n.loading);
  try {
    const [overview, modules, tickets] = await Promise.all([
      apiRequest("/api/admin/stats/overview", "GET"),
      apiRequest("/api/admin/stats/modules", "GET"),
      apiRequest("/api/admin/support/tickets", "GET"),
    ]);
    renderAdminOverview(overview);
    renderAdminModules(modules.modules || []);
    renderAdminTickets(tickets.tickets || []);
    setResult("admin-result", "");
  } catch (error) {
    setResult("admin-result", error.message);
  }
}

function wireAdminEvents() {
  const container = element("admin-tickets");
  if (!container) {
    return;
  }
  container.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest(".admin-ticket-open");
    if (!button) {
      return;
    }
    const ticketId = Number(button.dataset.ticketId || 0);
    if (!ticketId) {
      return;
    }
    try {
      const result = await apiRequest(`/api/admin/support/tickets/${ticketId}`, "GET");
      renderAdminTicketMessages(result.messages || []);
    } catch (error) {
      setResult("admin-result", error.message);
    }
  });
}

function wireCompatibilityForms() {
  const namesForm = element("compat-names-form");
  const namesDatesForm = element("compat-names-dates-form");

  if (namesForm) {
    namesForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setResult("compat-result", i18n.calculating);
      try {
        const result = await apiRequest("/api/sovmestimost/by-names", "POST", {
          name1: element("compat-name1").value.trim(),
          name2: element("compat-name2").value.trim(),
        });
        setResult("compat-result", result.result);
        setBalance(result.balance);
      } catch (error) {
        setResult("compat-result", error.message);
      }
    });
  }

  if (namesDatesForm) {
    namesDatesForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setResult("compat-result", i18n.calculating);
      try {
        const result = await apiRequest("/api/sovmestimost/by-names-dates", "POST", {
          name1: element("compat-nd-name1").value.trim(),
          date1: element("compat-date1").value.trim(),
          name2: element("compat-nd-name2").value.trim(),
          date2: element("compat-date2").value.trim(),
        });
        setResult("compat-result", result.result);
        setBalance(result.balance);
      } catch (error) {
        setResult("compat-result", error.message);
      }
    });
  }

  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      if (button.dataset.tab === "names-only") {
        element("compat-names-form")?.classList.add("active");
      } else {
        element("compat-names-dates-form")?.classList.add("active");
      }
    });
  });
}

async function boot() {
  wirePaymentForms();
  wireEmailAuthModal();
  wireEmailAuthForms();
  wireRequestHistory();
  wirePaymentsHistoryActions();
  wireSupportForms();
  wireLunarForm();
  wireAdminEvents();
  wireSonnikForm();
  wireNumerologyForm();
  wireCompatibilityForms();
  hydrateUiFromCache();
  await autoVerifyTelegram();
  await loadProfile();
  await Promise.all([loadPaymentPackages(), refreshBalance().catch(() => {})]);
  await loadPaymentsHistory();
  await loadRequestHistory();
  await loadSupportTickets();
  await loadNumerologyReport();
  await loadAdminDashboard();
  if (element("payments-history")) {
    setInterval(() => {
      loadPaymentsHistory().catch(() => {});
    }, 30000);
    setInterval(() => {
      syncPendingPayments().catch(() => {});
    }, 15000);
  }
}

boot().catch(() => {});

