const TELEGRAM_INIT_DATA_KEY = "astrolhub.telegramInitData";
const TELEGRAM_AUTH_TOKEN_KEY = "astrolhub.telegramAuthToken";
const EMAIL_AUTH_TOKEN_KEY = "astrolhub.emailAuthToken";

if (window.Telegram && window.Telegram.WebApp) {
  window.Telegram.WebApp.ready();
  if (window.Telegram.WebApp.expand) {
    window.Telegram.WebApp.expand();
  }
}

const state = {
  telegramInitData: "",
  telegramAuthToken:
    localStorage.getItem(TELEGRAM_AUTH_TOKEN_KEY) || sessionStorage.getItem(TELEGRAM_AUTH_TOKEN_KEY) || "",
  emailAuthToken: localStorage.getItem(EMAIL_AUTH_TOKEN_KEY) || "",
  pendingRegisterEmail: "",
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
    emailPrefix: "Email",
    devBypassPrefix: "Dev bypass",
    authSuccess: "Authentication successful",
    codeSent: "Code sent to your email",
    passwordsMismatch: "Passwords do not match",
    passwordResetSuccess: "Password updated",
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
    telegramLinkAuthFailed: "Telegram link login failed. The link may be invalid, expired, or the account is unknown.",
    telegramAuthFailed: "Telegram sign-in failed",
    telegramNoInitData: "Telegram did not provide initData. Open the app from the bot button.",
    telegramTokenMismatchHint: "Check TELEGRAM_BOT_TOKEN on the server matches your bot token.",
    close: "Close",
    chooseTicketFirst: "Choose ticket first",
    logout: "Log out",
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
    emailPrefix: "Email",
    devBypassPrefix: "Dev bypass",
    authSuccess: "Авторизация успешна",
    codeSent: "Код отправлен на почту",
    passwordsMismatch: "Пароли не совпадают",
    passwordResetSuccess: "Пароль обновлён",
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
    telegramLinkAuthFailed: "Вход по ссылке не удался. Ссылка неверна, срок истёк или такого пользователя нет в системе.",
    telegramAuthFailed: "Не удалось войти через Telegram",
    telegramNoInitData: "Telegram не передал initData. Откройте приложение кнопкой из бота.",
    telegramTokenMismatchHint: "На сервере TELEGRAM_BOT_TOKEN должен совпадать с токеном бота.",
    close: "Закрыть",
    chooseTicketFirst: "Сначала выберите обращение",
    logout: "Выйти",
  };

const authPageCopy = {
  en: {
    loginTitle: "Login",
    registerTitle: "Register",
    registerHint: "Create an account with email",
    email: "Email",
    password: "Password",
    repeatPassword: "Repeat password",
    loginSubmit: "Log in",
    registerSubmit: "Register",
    sendCode: "Send code",
    registerSubmitCode: "Send code",
    confirmRegistration: "Confirm registration",
    verifyTitle: "Confirm registration",
    verificationCode: "Verification code",
    noAccount: "No account yet?",
    haveAccount: "Already have an account?",
    goRegister: "Register",
    goLogin: "Log in",
    back: "Back",
    sparks: "Sparks",
  },
  ru: {
    loginTitle: "Вход",
    registerTitle: "Регистрация",
    registerHint: "Создайте аккаунт по email",
    email: "Email",
    password: "Пароль",
    repeatPassword: "Повтор пароля",
    loginSubmit: "Войти",
    registerSubmit: "Регистрация",
    sendCode: "Отправить код",
    registerSubmitCode: "Отправить код",
    confirmRegistration: "Подтвердить",
    verifyTitle: "Подтверждение регистрации",
    verificationCode: "Код из письма",
    noAccount: "Нет аккаунта?",
    haveAccount: "Уже есть аккаунт?",
    goRegister: "Зарегистрироваться",
    goLogin: "Войти",
    back: "Назад",
    sparks: "Искры",
  },
};

function element(id) {
  return document.getElementById(id);
}

function authStaticUrl(page, extraParams = {}) {
  const paths = {
    login: "/static/auth/login.html",
    register: "/static/auth/register.html",
    verify: "/static/auth/register-verify.html",
  };
  const params = new URLSearchParams({ lang, ...extraParams });
  return `${paths[page]}?${params.toString()}`;
}

function currentRelativeUrl() {
  return `${window.location.pathname}${window.location.search}`;
}

function loginRedirectUrl() {
  return authStaticUrl("login", { next: currentRelativeUrl() });
}

function resolvePostLoginRedirect() {
  const nextRaw = new URLSearchParams(window.location.search).get("next") || "";
  if (!nextRaw) {
    return `/client?lang=${lang}`;
  }
  try {
    const nextUrl = new URL(nextRaw, window.location.origin);
    if (nextUrl.origin !== window.location.origin) {
      return `/client?lang=${lang}`;
    }
    if (nextUrl.pathname.startsWith("/api/")) {
      return `/client?lang=${lang}`;
    }
    nextUrl.searchParams.set("lang", lang);
    return `${nextUrl.pathname}${nextUrl.search}`;
  } catch {
    return `/client?lang=${lang}`;
  }
}

function withLangQuery(url) {
  if (!url) {
    return url;
  }
  const target = new URL(url, window.location.origin);
  target.searchParams.set("lang", lang);
  return `${target.pathname}${target.search}`;
}

async function initAuthStaticPage() {
  if (!document.body.classList.contains("auth-static-page")) {
    return;
  }
  const copy = authPageCopy[lang] || authPageCopy.ru;
  document.querySelectorAll("[data-auth-label]").forEach((node) => {
    const key = node.dataset.authLabel;
    if (copy[key]) {
      node.textContent = copy[key];
    }
  });
  document.querySelectorAll(".auth-sparks-label").forEach((node) => {
    node.textContent = copy.sparks;
  });
  document.querySelectorAll(".auth-brand-link, .auth-username-link, .auth-login-link, .auth-register-link").forEach((link) => {
    link.setAttribute("href", withLangQuery(link.getAttribute("href")));
  });
  const verifyEmail = document.body.dataset.registerEmail || new URLSearchParams(window.location.search).get("email") || "";
  if (element("verify-email-display")) {
    element("verify-email-display").textContent = verifyEmail;
  }
  const hiddenEmail = element("register-email");
  if (hiddenEmail) {
    hiddenEmail.value = verifyEmail;
  }
  if (document.body.dataset.page === "register") {
    document.body.dataset.emailSkipVerification = "true";
    const submitBtn = element("register-submit-btn");
    if (submitBtn) {
      submitBtn.textContent = copy.registerSubmit;
    }
  }
  try {
    const response = await fetch(resolveApiUrl("/api/auth/email/health"));
    if (!response.ok) {
      toggleHeaderAuthLinks();
      return;
    }
    const data = await response.json();
    document.body.dataset.emailSkipVerification = data.email_skip_verification ? "true" : "false";
    if (document.body.dataset.page === "register") {
      const submitBtn = element("register-submit-btn");
      if (submitBtn) {
        submitBtn.textContent = data.email_skip_verification ? copy.registerSubmit : copy.registerSubmitCode;
      }
    }
  } catch {
    // Health endpoint may be missing until the server process is restarted.
  }
  toggleHeaderAuthLinks();
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

function isLoggedIn() {
  return (
    state.profileProvider === "email" ||
    state.profileProvider === "telegram" ||
    state.profileProvider === "max" ||
    Boolean(state.emailAuthToken) ||
    Boolean(state.telegramAuthToken)
  );
}

function isEmailSkipVerificationEnabled() {
  return document.body?.dataset?.emailSkipVerification === "true";
}

function shouldShowPasswordReset() {
  return state.profileProvider === "email" && !isEmailSkipVerificationEnabled();
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
  if (state.profileProvider === "guest") {
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
    return;
  }
  sessionStorage.setItem(TELEGRAM_INIT_DATA_KEY, state.telegramInitData);
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

function setTelegramAuthStatus(message) {
  const node = element("telegram-auth-status");
  if (!node) {
    return;
  }
  if (!message) {
    node.hidden = true;
    node.textContent = "";
    return;
  }
  node.hidden = false;
  node.textContent = message;
}

function isTelegramWebAppContext() {
  const platform = new URLSearchParams(window.location.search).get("platform");
  if (platform === "telegram") {
    return true;
  }
  const initData = readTelegramInitData();
  return Boolean(initData);
}

function hydrateUiFromCache() {
  const profile = readTimedCache(PROFILE_CACHE_KEY);
  if (isTelegramWebAppContext() && profile?.provider !== "telegram") {
    setAuthUsername(i18n.guest);
    const balance = readTimedCache(BALANCE_CACHE_KEY);
    if (typeof balance === "number") {
      setBalance(balance);
    }
    return;
  }
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
  toggleEmailAuthEntry();
  syncAuthChrome(profile);
  const balance = readTimedCache(BALANCE_CACHE_KEY);
  if (typeof balance === "number") {
    setBalance(balance);
  }
}

function getAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (state.telegramAuthToken) {
    headers["X-Telegram-Auth-Token"] = state.telegramAuthToken;
    return headers;
  }
  if (state.emailAuthToken) {
    headers["X-Email-Auth-Token"] = state.emailAuthToken;
    return headers;
  }
  if (state.telegramInitData) {
    headers["X-Telegram-Init-Data"] = state.telegramInitData;
  }
  return headers;
}

function persistEmailAuthToken(token) {
  state.emailAuthToken = token || "";
  if (token) {
    localStorage.setItem(EMAIL_AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(EMAIL_AUTH_TOKEN_KEY);
  }
}

function toggleHeaderAuthLinks() {
  const links = element("header-auth-links");
  if (!links) {
    return;
  }
  links.hidden = isTelegramWebAppContext() || isLoggedIn();
}

function syncAuthChrome(profile) {
  if (profile?.provider) {
    state.profileProvider = profile.provider;
  }
  const loggedIn = isLoggedIn();
  toggleHeaderAuthLinks();
  const logoutBtn = element("profile-logout-btn");
  if (logoutBtn) {
    logoutBtn.hidden = !loggedIn;
  }
  if (state.profileProvider === "email") {
    togglePasswordResetPanel(shouldShowPasswordReset());
  } else {
    togglePasswordResetPanel(false);
  }
}

function toggleLogoutPanel(isVisible) {
  const logoutBtn = element("profile-logout-btn");
  if (logoutBtn) {
    logoutBtn.hidden = !isVisible;
  }
}

function toggleEmailAuthEntry() {
  toggleHeaderAuthLinks();
  const entry = element("email-auth-entry");
  if (entry) {
    entry.hidden = true;
  }
}

function applyEmailAuthResult(result) {
  if (result.token) {
    persistEmailAuthToken(result.token);
  }
  if (result.profile) {
    saveTimedCache(PROFILE_CACHE_KEY, result.profile);
    applyProfileUi(result.profile);
  }
  if (typeof result.balance === "number") {
    saveTimedCache(BALANCE_CACHE_KEY, result.balance);
    setBalance(result.balance);
  }
  toggleEmailAuthEntry();
  updateAdminTileVisibility().catch(() => {});
}

function resolveApiUrl(path) {
  const base = (document.body?.dataset?.apiBase || "").replace(/\/$/, "");
  if (!path.startsWith("/")) {
    return `${base}/${path}`;
  }
  return `${base}${path}`;
}

function formatApiError(data, rawText, status, url) {
  if (data?.error) {
    return String(data.error);
  }
  const detail = data?.detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail) && detail.length) {
    return detail.map((item) => item.msg || JSON.stringify(item)).join("; ");
  }
  if (rawText) {
    return rawText;
  }
  return `${i18n.requestError} (HTTP ${status}, ${url})`;
}

function shouldRedirectUnauthorized(path, options = {}) {
  if (!options.redirectOnUnauthorized) {
    return false;
  }
  if (isTelegramWebAppContext()) {
    return false;
  }
  const pathname = new URL(resolveApiUrl(path), window.location.origin).pathname;
  if (!pathname.startsWith("/api/")) {
    return false;
  }
  if (
    pathname.startsWith("/api/auth/email/login")
    || pathname.startsWith("/api/auth/email/register")
    || pathname.startsWith("/api/auth/telegram/")
    || pathname.startsWith("/api/auth/max/")
    || pathname.startsWith("/api/auth/logout")
  ) {
    return false;
  }
  return true;
}

async function apiRequest(url, method, bodyObj, options = {}) {
  const requestUrl = resolveApiUrl(url);
  const response = await fetch(requestUrl, {
    method,
    headers: getAuthHeaders(),
    credentials: "same-origin",
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });
  const rawText = await response.text();
  let data = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      if (!response.ok) {
        throw new Error(formatApiError(null, rawText, response.status, requestUrl));
      }
    }
  }
  if (!response.ok) {
    if (response.status === 401 && shouldRedirectUnauthorized(url, options)) {
      window.location.href = loginRedirectUrl();
      throw new Error(lang === "en" ? "Redirecting to login..." : "Перенаправление на страницу входа...");
    }
    const message = formatApiError(data, rawText, response.status, requestUrl);
    if (response.status === 404) {
      throw new Error(
        `${message}. API not found — update server (git pull) or fix nginx proxy for /api/. Try ${requestUrl}`,
      );
    }
    throw new Error(message);
  }
  return data || {};
}

async function verifyTelegramUsernameLinkFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const linkToken = params.get("tglink");
  if (!linkToken) {
    return;
  }
  let errMsg = "";
  try {
    const response = await fetch("/api/auth/telegram/verify-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ link_token: linkToken }),
    });
    const rawText = await response.text();
    let data = null;
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        /* ignore */
      }
    }
    if (!response.ok) {
      const detail = data && data.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : i18n.telegramLinkAuthFailed;
      throw new Error(msg);
    }
    if (data.token) {
      persistTelegramAuthToken(data.token);
    }
    if (data.profile) {
      saveTimedCache(PROFILE_CACHE_KEY, data.profile);
      saveTimedCache(BALANCE_CACHE_KEY, data.balance);
    }
  } catch (e) {
    errMsg = e && e.message ? e.message : i18n.telegramLinkAuthFailed;
  }
  {
    const url = new URL(window.location.href);
    url.searchParams.delete("tglink");
    const next = url.search ? `${url.pathname}${url.search}` : url.pathname;
    window.history.replaceState({}, "", next);
  }
  if (errMsg) {
    const n = element("auth-result");
    if (n) {
      n.textContent = errMsg;
    }
  }
}

function readTelegramInitData() {
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    if (tg.initData) {
      return tg.initData;
    }
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("tgWebAppData") || "";
}

async function waitForTelegramInitData(maxAttempts = 80, delayMs = 100) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const initData = readTelegramInitData();
    if (initData) {
      return initData;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return "";
}

async function autoVerifyTelegram() {
  if (!isTelegramWebAppContext()) {
    return false;
  }
  const initData = await waitForTelegramInitData();
  if (!initData) {
    setTelegramAuthStatus(i18n.telegramNoInitData);
    return false;
  }
  persistTelegramInitData(initData);

  try {
    const response = await fetch("/api/auth/telegram/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ init_data: initData }),
    });
    const rawText = await response.text();
    let result = null;
    if (rawText) {
      try {
        result = JSON.parse(rawText);
      } catch {
        if (!response.ok) {
          throw new Error(rawText || i18n.requestError);
        }
      }
    }
    if (!response.ok) {
      const detail = result && (result.detail || result.error);
      throw new Error(typeof detail === "string" ? detail : i18n.requestError);
    }
    if (result.token) {
      persistTelegramAuthToken(result.token);
    }
    if (result.profile) {
      saveTimedCache(PROFILE_CACHE_KEY, result.profile);
      applyProfileUi(result.profile);
    }
    if (typeof result.balance === "number") {
      saveTimedCache(BALANCE_CACHE_KEY, result.balance);
      setBalance(result.balance);
    }
    setTelegramAuthStatus("");
    return true;
  } catch (error) {
    persistTelegramAuthToken("");
    const message = error && error.message ? error.message : i18n.telegramAuthFailed;
    const hint = message.includes("signature") || message.includes("initData")
      ? ` ${i18n.telegramTokenMismatchHint}`
      : "";
    setTelegramAuthStatus(`${message}${hint}`);
    return false;
  }
}

function applyProfileUi(profile) {
  state.profileProvider = profile.provider || "guest";
  if (profile.provider === "max") {
    setAuthBadge(`${i18n.maxPrefix}: ${profile.username}`);
    setAuthUsername(profile.username);
    syncAuthChrome(profile);
    return;
  }
  if (profile.provider === "telegram") {
    setAuthBadge(`${i18n.tgPrefix}: ${profile.username}`);
    setAuthUsername(profile.username);
    syncAuthChrome(profile);
    return;
  }
  if (profile.provider === "email") {
    setAuthBadge(`${i18n.emailPrefix}: ${profile.username}`);
    setAuthUsername(profile.username);
    syncAuthChrome(profile);
    return;
  }
  setAuthBadge(i18n.guest);
  setAuthUsername(i18n.guest);
  syncAuthChrome(profile);
}

function togglePasswordResetPanel(isVisible) {
  const panel = element("email-password-reset-panel");
  if (panel) {
    panel.hidden = !isVisible;
  }
}

async function loadProfile() {
  try {
    const profile = await apiRequest("/api/profile", "GET");
    saveTimedCache(PROFILE_CACHE_KEY, profile);
    applyProfileUi(profile);
    if (profile.provider === "telegram") {
      setTelegramAuthStatus("");
    }
    updateAdminTileVisibility().catch(() => {});
    return profile;
  } catch {
    state.profileProvider = "guest";
    setAuthBadge(i18n.guest);
    setAuthUsername(i18n.guest);
    toggleEmailAuthEntry();
    syncAuthChrome(null);
    updateAdminTileVisibility().catch(() => {});
    return null;
  }
}

async function logout() {
  try {
    await apiRequest("/api/auth/logout", "POST");
  } catch {
    // Clear local session even if the request fails.
  }
  persistEmailAuthToken("");
  persistTelegramAuthToken("");
  persistTelegramInitData("");
  sessionStorage.removeItem(PROFILE_CACHE_KEY);
  sessionStorage.removeItem(BALANCE_CACHE_KEY);
  state.profileProvider = "guest";
  setAuthBadge(i18n.guest);
  setAuthUsername(i18n.guest);
  syncAuthChrome({ provider: "guest", username: i18n.guest });
  setAdminTileVisible(false);
  window.location.href = `/client?lang=${lang}`;
}

function wireLogoutButton() {
  const button = element("profile-logout-btn");
  if (!button) {
    return;
  }
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await logout();
    } finally {
      button.disabled = false;
    }
  });
}

function wireRegisterPage() {
  const registerForm = element("email-register-form");
  if (!registerForm) {
    return;
  }
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setResult("auth-result", i18n.loading);
    try {
      const password = element("register-password")?.value || "";
      const passwordConfirm = element("register-password-confirm")?.value || "";
      if (password !== passwordConfirm) {
        throw new Error(i18n.passwordsMismatch);
      }
      const email = element("register-email")?.value.trim() || "";
      const result = await apiRequest("/api/auth/email/register/start", "POST", {
        email,
        password,
        password_confirm: passwordConfirm,
        language: lang,
      });
      if (result.profile || result.token) {
        applyEmailAuthResult(result);
        window.location.href = `/client?lang=${lang}`;
        return;
      }
      const skipVerify = document.body.dataset.emailSkipVerification === "true";
      if (skipVerify) {
        throw new Error(
          lang === "en"
            ? "Instant registration is not active on the server. Set EMAIL_SKIP_VERIFICATION=true in .env and run: sudo systemctl restart miniapp"
            : "На сервере не активна мгновенная регистрация. Добавьте EMAIL_SKIP_VERIFICATION=true в .env на VDS и выполните: sudo systemctl restart miniapp",
        );
      }
      window.location.href = authStaticUrl("verify", { email: result.email || email });
    } catch (error) {
      setResult("auth-result", error.message);
    }
  });
}

function wireRegisterVerifyPage() {
  const registerVerifyForm = element("email-register-verify-form");
  if (!registerVerifyForm) {
    return;
  }
  const email = document.body.dataset.registerEmail || element("register-email")?.value || "";

  registerVerifyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setResult("auth-result", i18n.loading);
    try {
      const result = await apiRequest("/api/auth/email/register/verify", "POST", {
        email: email.trim(),
        code: element("register-code")?.value.trim(),
        language: lang,
      });
      applyEmailAuthResult(result);
      window.location.href = `/client?lang=${lang}`;
    } catch (error) {
      setResult("auth-result", error.message);
    }
  });

  const resendBtn = element("register-resend-btn");
  if (resendBtn) {
    resendBtn.addEventListener("click", async () => {
      setResult("auth-result", i18n.loading);
      try {
        await apiRequest("/api/auth/email/register/resend", "POST", {
          email: email.trim(),
          language: lang,
        });
        setResult("auth-result", i18n.codeSent);
      } catch (error) {
        setResult("auth-result", error.message);
      }
    });
  }
}

function wireLoginPage() {
  const loginForm = element("email-login-form");
  if (!loginForm) {
    return;
  }
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setResult("auth-result", i18n.loading);
    try {
      const result = await apiRequest("/api/auth/email/login", "POST", {
        email: element("login-email")?.value.trim(),
        password: element("login-password")?.value,
      });
      applyEmailAuthResult(result);
      window.location.href = resolvePostLoginRedirect();
    } catch (error) {
      setResult("auth-result", error.message);
    }
  });
}

function wireAuthPages() {
  const page = document.body.dataset.page || "";
  if (page === "register") {
    wireRegisterPage();
  } else if (page === "register-verify") {
    wireRegisterVerifyPage();
  } else if (page === "login") {
    wireLoginPage();
  }
}

function wirePasswordResetForm() {
  const requestBtn = element("password-reset-request-btn");
  const form = element("email-password-reset-form");
  if (requestBtn) {
    requestBtn.addEventListener("click", async () => {
      setResult("password-reset-result", i18n.loading);
      try {
        await apiRequest("/api/auth/email/password-reset/request", "POST", undefined, { redirectOnUnauthorized: true });
        setResult("password-reset-result", i18n.codeSent);
      } catch (error) {
        setResult("password-reset-result", error.message);
      }
    });
  }
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setResult("password-reset-result", i18n.loading);
      try {
        const newPassword = element("password-reset-new")?.value || "";
        const passwordConfirm = element("password-reset-confirm")?.value || "";
        if (newPassword !== passwordConfirm) {
          throw new Error(i18n.passwordsMismatch);
        }
        await apiRequest("/api/auth/email/password-reset/confirm", "POST", {
          code: element("password-reset-code")?.value.trim(),
          new_password: newPassword,
          password_confirm: passwordConfirm,
        }, { redirectOnUnauthorized: true });
        setResult("password-reset-result", i18n.passwordResetSuccess);
      } catch (error) {
        setResult("password-reset-result", error.message);
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
        }, { redirectOnUnauthorized: true });
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
        }, { redirectOnUnauthorized: true });
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
          { redirectOnUnauthorized: true },
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
    const result = await apiRequest("/api/payments/yookassa/sync-pending", "POST", undefined, { redirectOnUnauthorized: true });
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
      const result = await apiRequest(`/api/payments/yookassa/${paymentId}/cancel`, "POST", undefined, { redirectOnUnauthorized: true });
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
      }, { redirectOnUnauthorized: true });
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
        language: lang,
      }, { redirectOnUnauthorized: true });
      const resultNode = element("numerology-result");
      if (resultNode) {
        const separator = result.report_url.includes("?") ? "&" : "?";
        const reportUrl = `${result.report_url}${separator}lang=${encodeURIComponent(lang)}`;
        resultNode.innerHTML = `${i18n.reportReady}: <a href="${reportUrl}">${lang === "en" ? "Open report" : "Открыть разбор"}</a>`;
      }
      setBalance(result.balance);
    } catch (error) {
      setResult("numerology-result", error.message);
    }
  });
}

function numerologySectionValue(section, keys) {
  const source = section || {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

function renderNumerologyReport(report) {
  const container = element("numerology-report-view");
  if (!container) {
    return;
  }
  const numbers = report.numbers || {};
  const sections = report.sections || {};
  const actionSection = sections.action || {};
  const matrix = report.matrix || {};
  const missing = report.missing_energies || [];
  const innate = report.innate_energies || [];
  const actionFocus = numerologySectionValue(actionSection, ["action", "действие"]);
  const actionComment = numerologySectionValue(actionSection, ["comment", "коммент"]);
  const actionGuidance = numerologySectionValue(actionSection, ["guidance", "наставление"]);
  const actionPlus = numerologySectionValue(actionSection, ["plus_actions", "поступки_плюс"]);
  const actionMinus = numerologySectionValue(actionSection, ["minus_actions", "поступки_минус"]);
  const plusLabel = lang === "en" ? "Strengths" : "Плюс";
  const minusLabel = lang === "en" ? "Weaknesses" : "Минус";
  const commentLabel = lang === "en" ? "Comment" : "Комментарий";
  const actionLabel = lang === "en" ? "Action focus" : "Действие";
  const guidanceLabel = lang === "en" ? "Guidance" : "Наставление";
  const positiveActionsLabel = lang === "en" ? "Positive actions" : "Поступки (+)";
  const negativeActionsLabel = lang === "en" ? "Negative actions" : "Поступки (-)";
  container.innerHTML = `
    <h3>${report.full_name || ""}</h3>
    <div class="muted">${report.birth_date || ""}</div>
    <div class="history-row"><b>${lang === "en" ? "Consciousness" : "Сознание"}:</b> ${numbers.consciousness ?? "-"}</div>
    <div class="history-row"><b>${lang === "en" ? "Destiny" : "Судьба"}:</b> ${numbers.destiny ?? "-"}</div>
    <div class="history-row"><b>${lang === "en" ? "Action" : "Действие"}:</b> ${numbers.action ?? "-"}</div>
    <div class="history-row"><b>${lang === "en" ? "Character" : "Характер"}:</b> ${numbers.character ?? "-"}</div>
    <div class="history-row"><b>${lang === "en" ? "Energy" : "Энергия"}:</b> ${numbers.energy ?? "-"}</div>
    <article class="history-row"><h4>${lang === "en" ? "Consciousness" : "Число сознания"}</h4><div><b>${plusLabel}:</b> ${sections.consciousness?.plus || ""}</div><div><b>${minusLabel}:</b> ${sections.consciousness?.minus || ""}</div><div><b>${commentLabel}:</b> ${sections.consciousness?.comment || ""}</div></article>
    <article class="history-row"><h4>${lang === "en" ? "Destiny" : "Число судьбы"}</h4><div><b>${plusLabel}:</b> ${sections.destiny?.plus || ""}</div><div><b>${minusLabel}:</b> ${sections.destiny?.minus || ""}</div><div><b>${commentLabel}:</b> ${sections.destiny?.comment || ""}</div></article>
    <article class="history-row"><h4>${lang === "en" ? "Action" : "Число действия"}</h4><div><b>${actionLabel}:</b> ${actionFocus}</div><div><b>${commentLabel}:</b> ${actionComment}</div><div><b>${guidanceLabel}:</b> ${actionGuidance}</div><div><b>${positiveActionsLabel}:</b> ${actionPlus}</div><div><b>${negativeActionsLabel}:</b> ${actionMinus}</div></article>
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
    const result = await apiRequest(`/api/numerology/report/${currentReportId}?lang=${encodeURIComponent(lang)}`, "GET", undefined, { redirectOnUnauthorized: true });
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

let adminUsersCache = [];

function adminLabel(key) {
  const ru = {
    selectUser: "Выберите пользователя из списка",
    selected: "Выбран",
    sparks: "искр",
    role: "роль",
    select: "Выбрать",
    noUsers: "Пользователи не найдены",
    findFirst: "Сначала найдите и выберите пользователя",
    nonZero: "Укажите ненулевое количество искр",
  };
  const en = {
    selectUser: "Select a user from the list",
    selected: "Selected",
    sparks: "sparks",
    role: "role",
    select: "Select",
    noUsers: "No users found",
    findFirst: "Find and select a user first",
    nonZero: "Enter a non-zero amount",
  };
  return (lang === "en" ? en : ru)[key];
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[ch]));
}

function renderAdminUserList(users) {
  const container = element("admin-user-list");
  if (!container) {
    return;
  }
  adminUsersCache = users || [];
  if (!adminUsersCache.length) {
    container.innerHTML = `<div class="muted">${adminLabel("noUsers")}</div>`;
    return;
  }
  container.innerHTML = adminUsersCache
    .map((user) => {
      const display = user.username || user.provider_user_id || "";
      const role = user.role || "user";
      return `
        <article class="history-row admin-user-row" data-user-id="${user.id}">
          <div class="admin-user-info">
            <strong>#${user.id}</strong>
            <span class="muted">${escapeHtml(user.provider)}</span>
            <span>${escapeHtml(display)}</span>
            <span class="muted">${user.credits} ${adminLabel("sparks")} · ${escapeHtml(role)}</span>
          </div>
          <button type="button" class="secondary-btn admin-user-select-btn" data-user-id="${user.id}">
            ${adminLabel("select")}
          </button>
        </article>`;
    })
    .join("");
}

function renderAdminSelectedUser(user) {
  const card = element("admin-selected-user-card");
  const hiddenId = element("admin-selected-user-id");
  const form = element("admin-credits-form");
  if (!card || !hiddenId || !form) {
    return;
  }
  if (!user) {
    card.textContent = adminLabel("selectUser");
    hiddenId.value = "";
    form.hidden = true;
    return;
  }
  const display = user.username || user.provider_user_id || `#${user.id}`;
  card.innerHTML = `<strong>${adminLabel("selected")}:</strong> #${user.id} · ${escapeHtml(user.provider)} · ${escapeHtml(display)} · ${user.credits} ${adminLabel("sparks")}`;
  hiddenId.value = String(user.id);
  form.hidden = false;
}

async function loadAdminUsers(query = "") {
  setResult("admin-credits-result", i18n.loading);
  try {
    const result = await apiRequest(`/api/admin/users/search?q=${encodeURIComponent(query)}`, "GET");
    renderAdminUserList(result.users || []);
    setResult("admin-credits-result", "");
  } catch (error) {
    setResult("admin-credits-result", error.message);
  }
}

function wireAdminCreditsForm() {
  const form = element("admin-credits-form");
  const listContainer = element("admin-user-list");
  const searchBtn = element("admin-user-search-btn");
  const queryInput = element("admin-user-query");
  if (!form || !listContainer) {
    return;
  }
  renderAdminSelectedUser(null);
  loadAdminUsers("");

  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      loadAdminUsers(queryInput?.value.trim() || "");
    });
  }
  if (queryInput) {
    queryInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        loadAdminUsers(queryInput.value.trim());
      }
    });
  }
  listContainer.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }
    const row = target.closest(".admin-user-row");
    if (!row) {
      return;
    }
    const userId = Number(row.dataset.userId || 0);
    const user = adminUsersCache.find((item) => item.id === userId);
    renderAdminSelectedUser(user || null);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const userId = Number(element("admin-selected-user-id")?.value || 0);
    const amount = Number(element("admin-credits-amount")?.value || 0);
    const reason = element("admin-credits-reason")?.value.trim() || "admin_adjustment";
    if (!userId) {
      setResult("admin-credits-result", adminLabel("findFirst"));
      return;
    }
    if (!amount) {
      setResult("admin-credits-result", adminLabel("nonZero"));
      return;
    }
    setResult("admin-credits-result", i18n.loading);
    try {
      const result = await apiRequest("/api/admin/users/adjust-credits", "POST", {
        user_id: userId,
        amount,
        reason,
      });
      setResult(
        "admin-credits-result",
        `#${result.user_id}: ${result.balance} ${adminLabel("sparks")}`,
      );
      await loadAdminUsers(queryInput?.value.trim() || "");
      const refreshed = adminUsersCache.find((item) => item.id === result.user_id);
      renderAdminSelectedUser(refreshed || null);
    } catch (error) {
      setResult("admin-credits-result", error.message);
    }
  });
}

function wireAdminEvents() {
  wireAdminCreditsForm();
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
        }, { redirectOnUnauthorized: true });
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
        }, { redirectOnUnauthorized: true });
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
  await initAuthStaticPage();
  toggleHeaderAuthLinks();
  wirePaymentForms();
  wireAuthPages();
  wireLogoutButton();
  wirePasswordResetForm();
  wireRequestHistory();
  wirePaymentsHistoryActions();
  wireSupportForms();
  wireAdminEvents();
  wireSonnikForm();
  wireNumerologyForm();
  wireCompatibilityForms();
  localStorage.removeItem(TELEGRAM_INIT_DATA_KEY);
  hydrateUiFromCache();
  await verifyTelegramUsernameLinkFromQuery();
  let telegramVerified = await autoVerifyTelegram();
  let profile = await loadProfile();
  if (!telegramVerified && profile?.provider !== "telegram" && state.telegramInitData) {
    telegramVerified = await autoVerifyTelegram();
    profile = await loadProfile();
  }
  if (profile?.provider !== "telegram" && isTelegramWebAppContext() && state.telegramInitData) {
    setTelegramAuthStatus(
      (element("telegram-auth-status")?.textContent || "") ||
        `${i18n.telegramAuthFailed}. ${i18n.telegramTokenMismatchHint}`,
    );
  }
  toggleEmailAuthEntry();
  syncAuthChrome(profile);
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

