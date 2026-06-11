const TELEGRAM_INIT_DATA_KEY = "astrolhub.telegramInitData";
const TELEGRAM_AUTH_TOKEN_KEY = "astrolhub.telegramAuthToken";
const EMAIL_AUTH_TOKEN_KEY = "astrolhub.emailAuthToken";
const ACTIVE_AUTH_PROVIDER_KEY = "astrolhub.activeAuthProvider";
const TELEGRAM_WEB_APP_SCRIPT_URL = "https://telegram.org/js/telegram-web-app.js";

const state = {
  telegramInitData: "",
  telegramAuthToken:
    localStorage.getItem(TELEGRAM_AUTH_TOKEN_KEY) || sessionStorage.getItem(TELEGRAM_AUTH_TOKEN_KEY) || "",
  emailAuthToken: localStorage.getItem(EMAIL_AUTH_TOKEN_KEY) || "",
  pendingRegisterEmail: "",
  lastPaymentId: sessionStorage.getItem("astrolhub.lastPaymentId") || "",
  selectedSupportTicketId: null,
  profileProvider: "guest",
  activeAuthProvider: localStorage.getItem(ACTIVE_AUTH_PROVIDER_KEY) || "",
  personas: [],
};
let telegramSdkLoadPromise = null;
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
    acceptPublicOffer: "Confirm that you have read the public offer terms",
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
    readingTarot: "Building natal chart...",
    buildingForecast: "Building forecast...",
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
    signInRedirecting: "Redirecting to login...",
    personaSaved: "Persona saved",
    personaDeleted: "Persona deleted",
    personaEmpty: "No saved personas yet",
    choosePersona: "Choose persona",
    personaRequired: "Choose a saved persona or enter at least name and birth date.",
  }
  : {
    guest: "Гость",
    requestError: "Ошибка запроса",
    creatingPayment: "Создаем платеж...",
    paymentCreated: "Платеж создан",
    needCreatePaymentFirst: "Сначала создайте платеж",
    enterEmail: "Введите корректный email",
    acceptPublicOffer: "Подтвердите, что вы ознакомились с условиями публичной оферты",
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
    readingTarot: "Строим натальную карту...",
    buildingForecast: "Строим прогноз...",
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
    signInRedirecting: "Перенаправляем на страницу входа...",
    personaSaved: "Персона сохранена",
    personaDeleted: "Персона удалена",
    personaEmpty: "Сохранённых персон пока нет",
    choosePersona: "Выберите персону",
    personaRequired: "Выберите сохранённую персону или введите минимум имя и дату рождения.",
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

function currentAuthNextParam() {
  return new URLSearchParams(window.location.search).get("next") || "";
}

function loginRedirectUrlFor(nextHref) {
  try {
    const nextUrl = new URL(nextHref, window.location.origin);
    if (nextUrl.origin !== window.location.origin || nextUrl.pathname.startsWith("/api/")) {
      return loginRedirectUrl();
    }
    nextUrl.searchParams.set("lang", lang);
    return authStaticUrl("login", { next: `${nextUrl.pathname}${nextUrl.search}` });
  } catch {
    return loginRedirectUrl();
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

function authStaticUrlWithCurrentNext(page, extraParams = {}) {
  const next = currentAuthNextParam();
  return authStaticUrl(page, next ? { ...extraParams, next } : extraParams);
}

function wireAuthRequiredLinks() {
  document.querySelectorAll("[data-auth-required='true']").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (isLoggedIn()) {
        return;
      }
      event.preventDefault();
      window.location.href = loginRedirectUrlFor(link.getAttribute("href") || currentRelativeUrl());
    });
  });
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
  document.querySelectorAll(".header-auth-btn.auth-login-link").forEach((node) => {
    node.textContent = copy.goLogin;
  });
  document.querySelectorAll(".header-auth-btn.auth-register-link").forEach((node) => {
    node.textContent = copy.goRegister;
  });
  document.querySelectorAll(".auth-brand-link, .auth-username-link").forEach((link) => {
    link.setAttribute("href", withLangQuery(link.getAttribute("href")));
  });
  document.querySelectorAll(".auth-login-link").forEach((link) => {
    link.setAttribute("href", authStaticUrlWithCurrentNext("login"));
  });
  document.querySelectorAll(".auth-register-link").forEach((link) => {
    link.setAttribute("href", authStaticUrlWithCurrentNext("register"));
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

function renderInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderMarkdownText(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const parts = [];
  let paragraph = [];
  let listItems = [];

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }
    parts.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) {
      return;
    }
    parts.push(`<ul>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
    listItems = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      parts.push("<hr>");
      return;
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length + 1, 4);
      parts.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      return;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      listItems.push(bullet[1]);
      return;
    }
    flushList();
    paragraph.push(trimmed);
  });
  flushParagraph();
  flushList();
  return parts.join("");
}

function setResult(id, text) {
  const node = element(id);
  if (node) {
    if (node.classList.contains("rich-result")) {
      node.innerHTML = text ? renderMarkdownText(text) : "";
    } else {
      node.textContent = text || "";
    }
    node.hidden = !text;
  }
}

function setBalance(value) {
  const headerSparks = element("header-sparks");
  if (headerSparks) {
    headerSparks.textContent = String(value);
  }
  const dashboardHeroSparks = element("dashboard-hero-sparks");
  if (dashboardHeroSparks) {
    dashboardHeroSparks.textContent = String(value);
  }
  const pageSparks = element("page-sparks");
  if (pageSparks) {
    pageSparks.textContent = String(value);
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
  const dashboardHeroUsername = element("dashboard-hero-username");
  if (dashboardHeroUsername) {
    dashboardHeroUsername.textContent = username || i18n.guest;
  }
}

function isSocialAuthorized() {
  return state.profileProvider !== "guest";
}

function isLoggedIn() {
  return (
    state.profileProvider === "email" ||
    state.profileProvider === "telegram" ||
    state.profileProvider === "max"
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

function setActiveAuthProvider(provider) {
  state.activeAuthProvider = provider || "";
  if (!state.activeAuthProvider) {
    localStorage.removeItem(ACTIVE_AUTH_PROVIDER_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_AUTH_PROVIDER_KEY, state.activeAuthProvider);
}

function persistTelegramAuthToken(token) {
  state.telegramAuthToken = token || "";
  if (!state.telegramAuthToken) {
    sessionStorage.removeItem(TELEGRAM_AUTH_TOKEN_KEY);
    localStorage.removeItem(TELEGRAM_AUTH_TOKEN_KEY);
    if (state.activeAuthProvider === "telegram") {
      setActiveAuthProvider("");
    }
    return;
  }
  sessionStorage.setItem(TELEGRAM_AUTH_TOKEN_KEY, state.telegramAuthToken);
  localStorage.setItem(TELEGRAM_AUTH_TOKEN_KEY, state.telegramAuthToken);
  setActiveAuthProvider("telegram");
}

function hasStoredAuthToken() {
  return Boolean(state.telegramAuthToken || state.emailAuthToken);
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

function isTelegramSdkReady() {
  return Boolean(window.Telegram && window.Telegram.WebApp);
}

function activateTelegramWebApp() {
  if (!isTelegramSdkReady()) {
    return;
  }
  const tg = window.Telegram.WebApp;
  tg.ready();
  if (tg.expand) {
    tg.expand();
  }
}

function loadTelegramWebAppSdk() {
  if (isTelegramSdkReady()) {
    activateTelegramWebApp();
    return Promise.resolve(true);
  }
  if (telegramSdkLoadPromise) {
    return telegramSdkLoadPromise;
  }
  telegramSdkLoadPromise = new Promise((resolve) => {
    const existingScript = document.querySelector(`script[src="${TELEGRAM_WEB_APP_SCRIPT_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener(
        "load",
        () => {
          activateTelegramWebApp();
          resolve(isTelegramSdkReady());
        },
        { once: true },
      );
      existingScript.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = TELEGRAM_WEB_APP_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      activateTelegramWebApp();
      resolve(isTelegramSdkReady());
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return telegramSdkLoadPromise;
}

function isTelegramWebAppContext() {
  const platform = new URLSearchParams(window.location.search).get("platform");
  if (platform === "telegram") {
    return true;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("tgWebAppData")) {
    return true;
  }
  return Boolean(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData);
}

function hydrateUiFromCache() {
  const profile = readTimedCache(PROFILE_CACHE_KEY);
  if (isTelegramWebAppContext() && profile?.provider !== "telegram") {
    setAuthUsername(i18n.guest);
    syncAuthChrome({ provider: "guest", username: i18n.guest });
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
  if (state.activeAuthProvider === "email" && state.emailAuthToken) {
    headers["X-Active-Auth-Provider"] = "email";
    headers["X-Email-Auth-Token"] = state.emailAuthToken;
    return headers;
  }
  if (state.activeAuthProvider === "telegram" && state.telegramAuthToken) {
    headers["X-Active-Auth-Provider"] = "telegram";
    headers["X-Telegram-Auth-Token"] = state.telegramAuthToken;
    return headers;
  }
  if (isTelegramWebAppContext() && state.telegramAuthToken) {
    headers["X-Active-Auth-Provider"] = "telegram";
    headers["X-Telegram-Auth-Token"] = state.telegramAuthToken;
    return headers;
  }
  if (state.emailAuthToken) {
    headers["X-Active-Auth-Provider"] = "email";
    headers["X-Email-Auth-Token"] = state.emailAuthToken;
    return headers;
  }
  if (state.telegramAuthToken) {
    headers["X-Active-Auth-Provider"] = "telegram";
    headers["X-Telegram-Auth-Token"] = state.telegramAuthToken;
    return headers;
  }
  if (state.telegramInitData) {
    headers["X-Active-Auth-Provider"] = "telegram";
    headers["X-Telegram-Init-Data"] = state.telegramInitData;
  }
  return headers;
}

function persistEmailAuthToken(token) {
  state.emailAuthToken = token || "";
  if (token) {
    localStorage.setItem(EMAIL_AUTH_TOKEN_KEY, token);
    setActiveAuthProvider("email");
  } else {
    localStorage.removeItem(EMAIL_AUTH_TOKEN_KEY);
    if (state.activeAuthProvider === "email") {
      setActiveAuthProvider("");
    }
  }
}

function toggleHeaderAuthLinks() {
  const links = element("header-auth-links");
  if (!links) {
    return;
  }
  links.hidden = isLoggedIn();
}

function syncGuestOnlyChrome(isGuest) {
  const sparkPill = element("header-spark-pill");
  if (sparkPill) {
    sparkPill.hidden = isGuest;
  }
  const dashboardHeroSparkPill = element("dashboard-hero-spark-pill");
  if (dashboardHeroSparkPill) {
    dashboardHeroSparkPill.hidden = isGuest;
  }
  const pageSparkPill = element("page-spark-pill");
  if (pageSparkPill) {
    pageSparkPill.hidden = isGuest;
  }
  const profileLink = element("bottom-nav-profile");
  if (profileLink) {
    profileLink.hidden = isGuest;
  }
  const loginLink = element("bottom-nav-login");
  if (loginLink) {
    loginLink.hidden = !isGuest;
    loginLink.setAttribute("href", authStaticUrl("login", { next: "/client/profile" }));
  }
}

function syncAuthRequiredSections(isGuest) {
  document.querySelectorAll(".auth-required-panel").forEach((panel) => {
    panel.hidden = !isGuest;
  });
  document.querySelectorAll(".auth-required-content").forEach((content) => {
    content.hidden = false;
    content.classList.toggle("is-auth-locked", isGuest);
    content.querySelectorAll("input, textarea, select, button").forEach((control) => {
      control.disabled = isGuest;
    });
  });
}

function syncAuthChrome(profile) {
  if (profile?.provider) {
    state.profileProvider = profile.provider;
  }
  const loggedIn = isLoggedIn();
  toggleHeaderAuthLinks();
  syncGuestOnlyChrome(!loggedIn);
  syncAuthRequiredSections(!loggedIn);
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
    persistTelegramAuthToken("");
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

function setFormBusy(form, isBusy, loadingText = i18n.loading) {
  if (!form) {
    return;
  }
  const submitButton = form.querySelector("button[type='submit']");
  if (!submitButton) {
    return;
  }
  if (isBusy) {
    submitButton.dataset.originalText = submitButton.textContent || "";
    submitButton.disabled = true;
    submitButton.textContent = loadingText;
    return;
  }
  submitButton.disabled = false;
  if (submitButton.dataset.originalText) {
    submitButton.textContent = submitButton.dataset.originalText;
  }
}

function redirectGuestFromForm() {
  if (isLoggedIn()) {
    return false;
  }
  window.location.href = loginRedirectUrl();
  return true;
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
      persistEmailAuthToken("");
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
  if (isTelegramSdkReady()) {
    const tg = window.Telegram.WebApp;
    activateTelegramWebApp();
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
  if (isLoggedIn()) {
    return false;
  }
  if (!readTelegramInitData()) {
    const loaded = await loadTelegramWebAppSdk();
    if (!loaded && !new URLSearchParams(window.location.search).get("tgWebAppData")) {
      setTelegramAuthStatus(i18n.telegramNoInitData);
      return false;
    }
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
      persistEmailAuthToken("");
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
  if (state.profileProvider === "guest") {
    persistEmailAuthToken("");
    persistTelegramAuthToken("");
  }
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
        window.location.href = resolvePostLoginRedirect();
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
      const next = currentAuthNextParam();
      window.location.href = authStaticUrl("verify", next ? { email: result.email || email, next } : { email: result.email || email });
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
      window.location.href = resolvePostLoginRedirect();
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
        const offerAccepted = element("payment-offer-accepted");
        if (offerAccepted && !offerAccepted.checked) {
          throw new Error(i18n.acceptPublicOffer);
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

function moduleLabel(module) {
  const labels = {
    sonnik: lang === "en" ? "Dreambook" : "Сонник",
    numerology: lang === "en" ? "Numerology" : "Нумерология",
    sovmestimost_names: lang === "en" ? "Compatibility" : "Совместимость",
    sovmestimost_names_dates: lang === "en" ? "Compatibility" : "Совместимость",
    tarot: lang === "en" ? "Natal Charts" : "Натальные карты",
    astrology: lang === "en" ? "Astrology" : "Астропрогноз",
  };
  return labels[module] || module || (lang === "en" ? "Request" : "Запрос");
}

function natalTopicLabel(topic) {
  const labels = lang === "en"
    ? {
      money: "Money and Realization",
      career: "Career Potential",
      love: "Relationships and Love",
      attraction: "What Attracts You in People",
      hidden_scenarios: "Hidden Life Scenarios",
      energy: "Your Source of Energy",
      period_task: "Main Task of This Period",
      child_potential: "Child Potential",
      strengths: "Natural Strengths",
      decisions: "Decision-Making Style",
      relationship_compatibility: "Relationship Compatibility",
      full_portrait: "Full Personality Portrait",
    }
    : {
      money: "Деньги и реализация",
      career: "Карьерный потенциал",
      love: "Отношения и любовь",
      attraction: "Что вас привлекает в людях",
      hidden_scenarios: "Скрытые сценарии жизни",
      energy: "Источник энергии",
      period_task: "Главная задача периода",
      child_potential: "Потенциал ребёнка",
      strengths: "Природные сильные качества",
      decisions: "Как вы принимаете решения",
      relationship_compatibility: "Совместимость в отношениях",
      full_portrait: "Полный портрет личности",
    };
  return labels[topic] || topic || moduleLabel("tarot");
}

function compactText(text, fallback = "") {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function formatHistorySummary(item) {
  const raw = item.input_text || "";
  if (item.module === "tarot") {
    const parts = raw.split(";").map((part) => part.trim());
    const topic = parts[0] || "";
    const personaPart = parts.find((part) => part.startsWith("persona=")) || "";
    const personaName = personaPart ? personaPart.replace(/^persona=/, "").trim() : "";
    const question = parts
      .filter((part, index) => index > 0 && part !== "natal_map" && !part.startsWith("persona="))
      .join("; ")
      .trim();
    return {
      title: personaName ? `${natalTopicLabel(topic)} · ${personaName}` : natalTopicLabel(topic),
      subtitle: compactText(question, lang === "en" ? "Natal chart by selected topic" : "Натальная карта по выбранной теме"),
      chips: [natalTopicLabel(topic), personaName ? `${lang === "en" ? "Persona" : "Персона"}: ${personaName}` : ""].filter(Boolean),
    };
  }
  if (item.module === "numerology") {
    const [name, birthDate] = raw.split(";").map((part) => part.trim());
    return {
      title: compactText(name, moduleLabel(item.module)),
      subtitle: birthDate || "",
      chips: birthDate ? [birthDate] : [],
    };
  }
  if (item.module === "sovmestimost_names" || item.module === "sovmestimost_names_dates") {
    const parts = raw.split(";").map((part) => part.trim()).filter(Boolean);
    const names = item.module === "sovmestimost_names_dates" ? [parts[0], parts[2]].filter(Boolean) : parts.slice(0, 2);
    return {
      title: names.length ? names.join(" + ") : moduleLabel(item.module),
      subtitle: parts.filter((part) => !names.includes(part)).join(" · "),
      chips: [moduleLabel(item.module)],
    };
  }
  if (item.module === "sonnik") {
    return {
      title: lang === "en" ? "Dream interpretation" : "Толкование сна",
      subtitle: compactText(raw),
      chips: [],
    };
  }
  return {
    title: compactText(raw, moduleLabel(item.module)),
    subtitle: "",
    chips: [],
  };
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
      const itemId = Number(item.id) || 0;
      const summary = formatHistorySummary(item);
      const summaryTitle = escapeHtml(summary.title || moduleLabel(item.module));
      const summarySubtitle = escapeHtml(summary.subtitle || "");
      const summaryChips = (summary.chips || [])
        .map((chip) => `<span class="history-meta-chip">${escapeHtml(chip)}</span>`)
        .join("");
      const outputText = renderMarkdownText(item.output_text || "");
      const createdAt = escapeHtml(new Date(item.created_at).toLocaleString());
      const label = escapeHtml(moduleLabel(item.module));
      const reportLink = item.report_url
        ? `<a class="secondary-btn inline-link-btn" href="${escapeHtml(item.report_url)}">${i18n.openReport}</a>`
        : "";
      return `<article class="history-row history-item" data-item-id="${itemId}">
      <button class="history-summary-btn" type="button" data-item-id="${itemId}">
        <span class="history-card-top">
          <span class="history-module-badge">${label}</span>
          <span class="muted">${createdAt}</span>
        </span>
        <span class="history-summary-main">${summaryTitle}</span>
        ${summarySubtitle ? `<span class="history-summary-subtitle">${summarySubtitle}</span>` : ""}
        ${summaryChips ? `<span class="history-meta-chips">${summaryChips}</span>` : ""}
        <span class="history-open-hint">${lang === "en" ? "Open answer" : "Открыть ответ"}</span>
      </button>
      <div id="history-answer-${itemId}" class="history-answer">
        <div class="history-answer-body">${outputText}</div>
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
    const result = await apiRequest("/api/history/requests?limit=50", "GET", undefined, { redirectOnUnauthorized: true });
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
    .map((ticket) => {
      const ticketId = Number(ticket.id) || 0;
      return `<article class="history-row">
        <div class="payment-row-top">
          <strong>${i18n.ticket} #${ticketId}</strong>
          <span class="payment-status">${escapeHtml(supportTicketStatusLabel(ticket.status))}</span>
        </div>
        <div>${escapeHtml(ticket.subject)}</div>
        <button class="secondary-btn support-ticket-open" data-ticket-id="${ticketId}" type="button">
          ${lang === "en" ? "Open dialog" : "Открыть диалог"}
        </button>
      </article>`;
    })
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
        <strong>${escapeHtml(item.username || `#${item.author_user_id}`)}</strong>
        <span class="muted">${escapeHtml(new Date(item.created_at).toLocaleString())}</span>
      </div>
      <div>${escapeHtml(item.message_text)}</div>
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
    if (redirectGuestFromForm()) {
      setResult("sonnik-result", i18n.signInRedirecting);
      return;
    }
    setResult("sonnik-result", i18n.analyzingDream);
    setFormBusy(form, true, i18n.analyzingDream);
    try {
      const result = await apiRequest("/api/sonnik/interpret", "POST", {
        dream_text: element("dream-text").value.trim(),
        language: lang,
      }, { redirectOnUnauthorized: true });
      setResult("sonnik-result", result.interpretation);
      setBalance(result.balance);
    } catch (error) {
      setResult("sonnik-result", error.message);
    } finally {
      setFormBusy(form, false);
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
    if (redirectGuestFromForm()) {
      setResult("numerology-result", i18n.signInRedirecting);
      return;
    }
    setResult("numerology-result", i18n.generatingReport);
    setFormBusy(form, true, i18n.generatingReport);
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
    } finally {
      setFormBusy(form, false);
    }
  });
}

function personaPayloadFromPrefix(prefix) {
  return {
    name: element(`${prefix}-name`)?.value.trim() || "",
    birth_date: element(`${prefix}-birth-date`)?.value.trim() || "",
    birth_time: element(`${prefix}-birth-time`)?.value.trim() || "",
    birth_place: element(`${prefix}-birth-place`)?.value.trim() || "",
    note: element(`${prefix}-note`)?.value.trim() || "",
  };
}

function personaPreview(persona) {
  if (!persona) {
    return "";
  }
  return [persona.name, persona.birth_date, persona.birth_time, persona.birth_place]
    .filter(Boolean)
    .join(" · ");
}

async function createPersona(payload) {
  const result = await apiRequest("/api/personas", "POST", payload, { redirectOnUnauthorized: true });
  return result.persona;
}

async function updatePersona(personaId, payload) {
  const result = await apiRequest(`/api/personas/${personaId}`, "PATCH", payload, { redirectOnUnauthorized: true });
  return result.persona;
}

async function deletePersona(personaId) {
  return apiRequest(`/api/personas/${personaId}`, "DELETE", undefined, { redirectOnUnauthorized: true });
}

function renderTarotPersonaSelect() {
  const select = element("tarot-persona-select");
  if (!select) {
    return;
  }
  const selectedValue = select.value;
  select.innerHTML = `<option value="">${i18n.choosePersona}</option>${state.personas
    .map((persona) => `<option value="${persona.id}">${escapeHtml(persona.name)} · ${escapeHtml(persona.birth_date)}</option>`)
    .join("")}`;
  if (selectedValue && state.personas.some((persona) => String(persona.id) === selectedValue)) {
    select.value = selectedValue;
  }
  updateTarotPersonaPreview();
}

function updateTarotPersonaPreview() {
  const preview = element("tarot-persona-preview");
  const select = element("tarot-persona-select");
  if (!preview || !select) {
    return;
  }
  const persona = state.personas.find((item) => String(item.id) === String(select.value));
  preview.textContent = persona ? personaPreview(persona) : i18n.personaEmpty;
}

async function loadPersonas() {
  if (!isLoggedIn()) {
    state.personas = [];
    renderTarotPersonaSelect();
    renderProfilePersonas();
    return [];
  }
  try {
    const result = await apiRequest("/api/personas", "GET", undefined, { redirectOnUnauthorized: true });
    state.personas = result.personas || [];
  } catch {
    state.personas = [];
  }
  renderTarotPersonaSelect();
  renderProfilePersonas();
  return state.personas;
}

function clearProfilePersonaForm() {
  if (!element("profile-persona-form")) {
    return;
  }
  element("profile-persona-id").value = "";
  element("profile-persona-name").value = "";
  element("profile-persona-birth-date").value = "";
  element("profile-persona-birth-time").value = "";
  element("profile-persona-birth-place").value = "";
  element("profile-persona-note").value = "";
}

function fillProfilePersonaForm(persona) {
  if (!persona || !element("profile-persona-form")) {
    return;
  }
  element("profile-persona-id").value = String(persona.id || "");
  element("profile-persona-name").value = persona.name || "";
  element("profile-persona-birth-date").value = persona.birth_date || "";
  element("profile-persona-birth-time").value = persona.birth_time || "";
  element("profile-persona-birth-place").value = persona.birth_place || "";
  element("profile-persona-note").value = persona.note || "";
}

function renderProfilePersonas() {
  const container = element("profile-personas-list");
  if (!container) {
    return;
  }
  if (!state.personas.length) {
    container.innerHTML = `<div class="muted">${i18n.personaEmpty}</div>`;
    return;
  }
  container.innerHTML = state.personas
    .map((persona) => `<article class="persona-list-row" data-persona-id="${persona.id}">
      <div class="persona-list-info">
        <strong>${escapeHtml(persona.name)}</strong>
        <span class="muted">${escapeHtml(personaPreview(persona))}</span>
        ${persona.note ? `<span>${escapeHtml(persona.note)}</span>` : ""}
      </div>
      <div class="persona-row-actions">
        <button type="button" class="secondary-btn persona-edit-btn" data-persona-id="${persona.id}">${lang === "en" ? "Edit" : "Редактировать"}</button>
        <button type="button" class="secondary-btn persona-delete-btn" data-persona-id="${persona.id}">${lang === "en" ? "Delete" : "Удалить"}</button>
      </div>
    </article>`)
    .join("");
}

function wireProfilePersonas() {
  const form = element("profile-persona-form");
  const list = element("profile-personas-list");
  const modal = element("profile-persona-modal");
  if (!form && !list) {
    return;
  }
  const setProfilePersonaFormStatus = (message) => setResult("profile-persona-form-result", message);
  const openProfilePersonaModal = (mode = "create") => {
    if (!modal) {
      return;
    }
    const title = element("profile-persona-modal-title");
    if (title) {
      title.textContent = mode === "edit" ? (lang === "en" ? "Edit persona" : "Редактировать персону") : (lang === "en" ? "Add persona" : "Добавить персону");
    }
    setProfilePersonaFormStatus("");
    modal.hidden = false;
    document.body.classList.add("modal-open");
    setTimeout(() => element("profile-persona-name")?.focus(), 0);
  };
  const closeProfilePersonaModal = () => {
    if (!modal) {
      return;
    }
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  };
  element("profile-persona-add-btn")?.addEventListener("click", () => {
    clearProfilePersonaForm();
    setResult("profile-persona-result", "");
    openProfilePersonaModal("create");
  });
  element("profile-persona-reset")?.addEventListener("click", () => {
    clearProfilePersonaForm();
    setProfilePersonaFormStatus("");
    closeProfilePersonaModal();
  });
  modal?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest("[data-profile-persona-close]")) {
      clearProfilePersonaForm();
      closeProfilePersonaModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal && !modal.hidden) {
      closeProfilePersonaModal();
    }
  });
  list?.addEventListener("click", async (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }
    const editButton = target.closest(".persona-edit-btn");
    const deleteButton = target.closest(".persona-delete-btn");
    if (editButton) {
      const persona = state.personas.find((item) => String(item.id) === String(editButton.dataset.personaId));
      fillProfilePersonaForm(persona);
      openProfilePersonaModal("edit");
      return;
    }
    if (!deleteButton) {
      return;
    }
    const personaId = Number(deleteButton.dataset.personaId || 0);
    if (!personaId) {
      return;
    }
    deleteButton.disabled = true;
    try {
      await deletePersona(personaId);
      setResult("profile-persona-result", i18n.personaDeleted);
      await loadPersonas();
    } catch (error) {
      setResult("profile-persona-result", error.message);
    } finally {
      deleteButton.disabled = false;
    }
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const personaId = Number(element("profile-persona-id")?.value || 0);
    const payload = personaPayloadFromPrefix("profile-persona");
    setProfilePersonaFormStatus(i18n.loading);
    try {
      if (personaId) {
        await updatePersona(personaId, payload);
      } else {
        await createPersona(payload);
      }
      clearProfilePersonaForm();
      closeProfilePersonaModal();
      setResult("profile-persona-result", i18n.personaSaved);
      await loadPersonas();
    } catch (error) {
      setProfilePersonaFormStatus(error.message);
    }
  });
}

function wireTarotForm() {
  const form = element("tarot-form");
  if (!form) {
    return;
  }
  const setTarotFormStatus = (message) => setResult("tarot-form-result", message);
  const showTarotReadingResult = (text) => {
    const resultNode = element("tarot-result");
    form.hidden = true;
    setResult("tarot-result", text);
    if (resultNode) {
      resultNode.insertAdjacentHTML(
        "beforeend",
        `<div class="reading-result-actions">
          <button type="button" class="secondary-btn" id="tarot-new-reading-btn">
            ${lang === "en" ? "New reading" : "Новый разбор"}
          </button>
        </div>`,
      );
    }
  };
  const togglePersonaMode = () => {
    const mode = document.querySelector("input[name='tarot-persona-mode']:checked")?.value || "saved";
    const savedPanel = element("tarot-saved-persona-panel");
    const manualPanel = element("tarot-manual-persona-panel");
    if (savedPanel) {
      savedPanel.hidden = mode !== "saved";
    }
    if (manualPanel) {
      manualPanel.hidden = mode !== "manual";
    }
  };
  document.querySelectorAll("input[name='tarot-persona-mode']").forEach((radio) => {
    radio.addEventListener("change", togglePersonaMode);
  });
  element("tarot-persona-select")?.addEventListener("change", updateTarotPersonaPreview);
  element("tarot-result")?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target?.closest("#tarot-new-reading-btn")) {
      return;
    }
    setResult("tarot-result", "");
    form.hidden = false;
    setTarotFormStatus("");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  togglePersonaMode();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (redirectGuestFromForm()) {
      setTarotFormStatus(i18n.signInRedirecting);
      return;
    }
    setResult("tarot-result", "");
    setFormBusy(form, true, i18n.readingTarot);
    try {
      setTarotFormStatus(i18n.readingTarot);
      const personaMode = document.querySelector("input[name='tarot-persona-mode']:checked")?.value || "saved";
      const manualPersona = personaPayloadFromPrefix("tarot-persona");
      let personaId = personaMode === "saved" ? Number(element("tarot-persona-select")?.value || 0) : 0;
      if (personaMode === "saved" && !personaId) {
        throw new Error(i18n.personaRequired);
      }
      if (personaMode === "manual" && (!manualPersona.name || !manualPersona.birth_date)) {
        throw new Error(i18n.personaRequired);
      }
      if (personaMode === "manual" && element("tarot-save-persona")?.checked && manualPersona.name && manualPersona.birth_date) {
        const persona = await createPersona(manualPersona);
        personaId = Number(persona?.id || 0);
        await loadPersonas();
        const select = element("tarot-persona-select");
        if (select && personaId) {
          select.value = String(personaId);
          updateTarotPersonaPreview();
        }
        setTarotFormStatus(i18n.personaSaved);
      }
      const result = await apiRequest("/api/tarot/reading", "POST", {
        question: element("tarot-question").value.trim(),
        topic: element("tarot-topic")?.value || "full_portrait",
        spread: "natal_map",
        persona_id: personaId,
        persona_name: personaMode === "manual" ? manualPersona.name : "",
        persona_birth_date: personaMode === "manual" ? manualPersona.birth_date : "",
        persona_birth_time: personaMode === "manual" ? manualPersona.birth_time : "",
        persona_birth_place: personaMode === "manual" ? manualPersona.birth_place : "",
        persona_note: personaMode === "manual" ? manualPersona.note : "",
        language: lang,
      }, { redirectOnUnauthorized: true });
      setTarotFormStatus("");
      showTarotReadingResult(result.result);
      setBalance(result.balance);
    } catch (error) {
      setTarotFormStatus(error.message);
    } finally {
      setFormBusy(form, false);
    }
  });
}

function wireAstrologyForm() {
  const form = element("astrology-form");
  if (!form) {
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (redirectGuestFromForm()) {
      setResult("astrology-result", i18n.signInRedirecting);
      return;
    }
    setResult("astrology-result", i18n.buildingForecast);
    setFormBusy(form, true, i18n.buildingForecast);
    try {
      const result = await apiRequest("/api/astrology/forecast", "POST", {
        name: element("astrology-name").value.trim(),
        birth_date: element("astrology-birth-date").value.trim(),
        birth_time: element("astrology-birth-time").value.trim(),
        birth_place: element("astrology-birth-place").value.trim(),
        focus: element("astrology-focus").value.trim(),
        language: lang,
      }, { redirectOnUnauthorized: true });
      setResult("astrology-result", result.result);
      setBalance(result.balance);
    } catch (error) {
      setResult("astrology-result", error.message);
    } finally {
      setFormBusy(form, false);
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

function adminFormatNumber(value) {
  return Number(value || 0).toLocaleString(lang === "en" ? "en-US" : "ru-RU");
}

function adminText(key) {
  const ru = {
    usersTotal: "Всего пользователей",
    newUsers: "Новые пользователи",
    activeUsers: "Активные пользователи",
    requests: "Запросы",
    successfulPayments: "Успешные платежи",
    revenue: "Выручка",
    sparksCharged: "Списано искр",
    sparksAdded: "Начислено искр",
    openTickets: "Открытые обращения",
    newUsersByDay: "Новые пользователи по дням",
    requestsByDay: "Запросы по дням",
    revenueByDay: "Выручка по дням",
    supportTicketsByDay: "Обращения в поддержку по дням",
    dateAxis: "Дата",
    usersAxis: "Пользователи",
    requestsAxis: "Запросы",
    revenueAxis: "Выручка, ₽",
    ticketsAxis: "Обращения",
    admin: "админ",
    target: "цель",
    created: "создан",
    lastRequest: "последний запрос",
    paid: "платежи",
    personas: "Персоны",
    requestHistory: "История запросов",
    transactions: "Транзакции",
    payments: "Платежи",
    roleUpdated: "Роль обновлена",
    createdStatus: "создан",
    succeededStatus: "успешно",
    canceledStatus: "отменён",
    pendingStatus: "ожидает",
    chargeType: "списания",
    creditType: "начисления",
    refundType: "возвраты",
    adminCreditType: "админ начисления",
    adminDebitType: "админ списания",
  };
  const en = {
    usersTotal: "Users total",
    newUsers: "New users",
    activeUsers: "Active users",
    requests: "Requests",
    successfulPayments: "Successful payments",
    revenue: "Revenue",
    sparksCharged: "Sparks charged",
    sparksAdded: "Sparks added",
    openTickets: "Open tickets",
    newUsersByDay: "New users by day",
    requestsByDay: "Requests by day",
    revenueByDay: "Revenue by day",
    supportTicketsByDay: "Support tickets by day",
    dateAxis: "Date",
    usersAxis: "Users",
    requestsAxis: "Requests",
    revenueAxis: "Revenue, ₽",
    ticketsAxis: "Tickets",
    admin: "admin",
    target: "target",
    created: "created",
    lastRequest: "last request",
    paid: "paid",
    personas: "Personas",
    requestHistory: "Request history",
    transactions: "Transactions",
    payments: "Payments",
    roleUpdated: "Role updated",
    createdStatus: "created",
    succeededStatus: "succeeded",
    canceledStatus: "canceled",
    pendingStatus: "pending",
    chargeType: "charges",
    creditType: "credits",
    refundType: "refunds",
    adminCreditType: "admin credits",
    adminDebitType: "admin debits",
  };
  return (lang === "en" ? en : ru)[key] || key;
}

function adminPaymentStatusText(status) {
  const labels = {
    created: adminText("createdStatus"),
    succeeded: adminText("succeededStatus"),
    canceled: adminText("canceledStatus"),
    pending: adminText("pendingStatus"),
  };
  return labels[status] || status || "-";
}

function adminTransactionTypeText(type) {
  const labels = {
    charge: adminText("chargeType"),
    credit: adminText("creditType"),
    refund: adminText("refundType"),
    admin_credit: adminText("adminCreditType"),
    admin_debit: adminText("adminDebitType"),
  };
  return labels[type] || type || "-";
}

function renderAdminKpi(overview) {
  const container = element("admin-kpi");
  if (!container) {
    return;
  }
  const items = [
    [adminText("usersTotal"), overview.users_total],
    [adminText("newUsers"), overview.new_users],
    [adminText("activeUsers"), overview.active_users],
    [adminText("requests"), overview.period_requests],
    [adminText("successfulPayments"), overview.period_succeeded_payments],
    [adminText("revenue"), `${adminFormatNumber(overview.period_revenue)} ₽`],
    [adminText("sparksCharged"), overview.sparks_charged],
    [adminText("sparksAdded"), overview.sparks_added],
    [adminText("openTickets"), overview.open_tickets],
  ];
  container.innerHTML = items
    .map(([label, value]) => `<article class="admin-kpi-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
    .join("");
}

function renderAdminBars(containerId, items, labelKey, valueKey, emptyText = i18n.noAdminData) {
  const container = element(containerId);
  if (!container) {
    return;
  }
  const rows = (items || []).filter((item) => Number(item[valueKey] || 0) !== 0);
  if (!rows.length) {
    container.innerHTML = `<div class="muted">${escapeHtml(emptyText)}</div>`;
    return;
  }
  const max = Math.max(...rows.map((item) => Math.abs(Number(item[valueKey] || 0))), 1);
  container.innerHTML = rows
    .map((item) => {
      const value = Number(item[valueKey] || 0);
      const width = Math.max(4, Math.round((Math.abs(value) / max) * 100));
      return `<article class="admin-bar-row">
        <div class="admin-bar-top"><strong>${escapeHtml(item[labelKey])}</strong><span>${adminFormatNumber(value)}</span></div>
        <div class="admin-bar-track"><span style="width:${width}%"></span></div>
      </article>`;
    })
    .join("");
}

function formatAdminChartDate(value) {
  if (!value) {
    return "";
  }
  const dateValue = new Date(`${value}T00:00:00`);
  return dateValue.toLocaleDateString(lang === "en" ? "en-US" : "ru-RU", { day: "2-digit", month: "2-digit" });
}

function renderAdminLineChart(containerId, title, days, valueKey, yAxisLabel) {
  const container = element(containerId);
  if (!container) {
    return;
  }
  const rows = days || [];
  if (!rows.length) {
    container.innerHTML = `<div class="muted">${i18n.noAdminData}</div>`;
    return;
  }
  const width = 360;
  const height = 170;
  const padding = { left: 54, right: 12, top: 16, bottom: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);
  const points = rows.map((row, index) => {
    const x = rows.length === 1 ? padding.left + chartWidth / 2 : padding.left + (index / (rows.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - (Number(row[valueKey] || 0) / max) * chartHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const firstDay = rows[0]?.day || "";
  const middleDay = rows[Math.floor(rows.length / 2)]?.day || "";
  const lastDay = rows[rows.length - 1]?.day || "";
  const xLabels = rows.length <= 2
    ? [[padding.left, firstDay], [padding.left + chartWidth, lastDay]]
    : [[padding.left, firstDay], [padding.left + chartWidth / 2, middleDay], [padding.left + chartWidth, lastDay]];
  const gridLines = [0, 0.5, 1].map((ratio) => {
    const y = padding.top + chartHeight - ratio * chartHeight;
    const value = Math.round(max * ratio);
    return `<line x1="${padding.left}" y1="${y}" x2="${padding.left + chartWidth}" y2="${y}" class="admin-chart-grid"></line>
      <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" class="admin-chart-axis-text">${adminFormatNumber(value)}</text>`;
  }).join("");
  const xLabelMarkup = xLabels
    .filter(([, value], index, source) => value && source.findIndex(([, item]) => item === value) === index)
    .map(([x, value]) => `<text x="${x}" y="${height - 20}" text-anchor="middle" class="admin-chart-axis-text">${escapeHtml(formatAdminChartDate(value))}</text>`)
    .join("");
  container.insertAdjacentHTML("beforeend", `<article class="admin-chart-card">
    <h3>${escapeHtml(title)}</h3>
    <svg viewBox="0 0 ${width} ${height}" class="admin-line-chart" role="img" aria-label="${escapeHtml(title)}">
      ${gridLines}
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight}" class="admin-chart-axis"></line>
      <line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${padding.left + chartWidth}" y2="${padding.top + chartHeight}" class="admin-chart-axis"></line>
      <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
      <text x="16" y="${padding.top + chartHeight / 2}" text-anchor="middle" class="admin-chart-axis-title" transform="rotate(-90 16 ${padding.top + chartHeight / 2})">${escapeHtml(yAxisLabel)}</text>
      <text x="${padding.left + chartWidth / 2}" y="${height - 4}" text-anchor="middle" class="admin-chart-axis-title">${escapeHtml(adminText("dateAxis"))}</text>
      ${xLabelMarkup}
    </svg>
  </article>`);
}

function renderAdminDailyCharts(days) {
  const container = element("admin-daily-charts");
  if (!container) {
    return;
  }
  container.innerHTML = "";
  renderAdminLineChart("admin-daily-charts", adminText("newUsersByDay"), days, "new_users", adminText("usersAxis"));
  renderAdminLineChart("admin-daily-charts", adminText("requestsByDay"), days, "requests", adminText("requestsAxis"));
  renderAdminLineChart("admin-daily-charts", adminText("revenueByDay"), days, "revenue", adminText("revenueAxis"));
  renderAdminLineChart("admin-daily-charts", adminText("supportTicketsByDay"), days, "tickets_opened", adminText("ticketsAxis"));
}

function renderAdminModules(modules) {
  renderAdminBars("admin-modules", modules || [], "module", "total");
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
        <strong>#${Number(ticket.id) || 0} ${escapeHtml(ticket.subject)}</strong>
        <span class="payment-status">${escapeHtml(supportTicketStatusLabel(ticket.status))}</span>
      </div>
      <div class="muted">${escapeHtml(ticket.username || `user:${ticket.user_id}`)}</div>
      <button class="secondary-btn admin-ticket-open" type="button" data-ticket-id="${Number(ticket.id) || 0}">
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
    .map((item) => `<article class="history-row"><strong>${escapeHtml(item.username)}</strong><div>${escapeHtml(item.message_text)}</div></article>`)
    .join("");
}

function renderAdminPaymentFunnel(payments) {
  const grouped = {};
  (payments || []).forEach((item) => {
    grouped[item.status] = (grouped[item.status] || 0) + Number(item.total || 0);
  });
  renderAdminBars(
    "admin-payment-funnel",
    Object.entries(grouped).map(([status, total]) => ({ status: adminPaymentStatusText(status), total })),
    "status",
    "total",
  );
}

function renderAdminSparks(sparks) {
  const grouped = {};
  (sparks || []).forEach((item) => {
    const key = item.type || item.reason || "spark";
    grouped[key] = (grouped[key] || 0) + Number(item.amount || 0);
  });
  renderAdminBars(
    "admin-sparks-chart",
    Object.entries(grouped).map(([type, amount]) => ({ type: adminTransactionTypeText(type), amount })),
    "type",
    "amount",
  );
}

function renderAdminProviders(providers) {
  renderAdminBars("admin-providers", providers || [], "provider", "total");
}

function renderAdminAudit(items) {
  const container = element("admin-audit-log");
  if (!container) {
    return;
  }
  if (!items.length) {
    container.innerHTML = `<div class="muted">${i18n.noAdminData}</div>`;
    return;
  }
  container.innerHTML = items
    .map((item) => `<article class="history-row">
      <div class="history-card-top">
        <strong>${escapeHtml(item.action)}</strong>
        <span class="muted">${escapeHtml(new Date(item.created_at).toLocaleString())}</span>
      </div>
      <div class="muted">${adminText("admin")}: ${escapeHtml(item.admin_username || `#${item.admin_user_id}`)} · ${adminText("target")}: ${escapeHtml(item.target_username || item.target_user_id || "-")}</div>
      <div>${escapeHtml(item.metadata || "")}</div>
    </article>`)
    .join("");
}

function renderAdminUserDetail(payload) {
  const container = element("admin-user-detail");
  const roleForm = document.querySelector(".admin-role-form");
  if (!container) {
    return;
  }
  if (!payload || !payload.user) {
    container.innerHTML = `<div class="muted">${adminLabel("selectUser")}</div>`;
    if (roleForm) {
      roleForm.hidden = true;
    }
    return;
  }
  const user = payload.user;
  const display = user.username || user.provider_user_id || `#${user.id}`;
  container.innerHTML = `<article class="history-row">
    <strong>#${user.id} · ${escapeHtml(display)}</strong>
    <div class="muted">${escapeHtml(user.provider)} · ${escapeHtml(user.role || "user")}</div>
    <div>${adminFormatNumber(user.credits)} ${adminLabel("sparks")}</div>
    <div class="muted">${adminText("created")}: ${escapeHtml(new Date(user.created_at).toLocaleString())}</div>
    <div class="muted">${adminText("lastRequest")}: ${escapeHtml(user.last_request_at ? new Date(user.last_request_at).toLocaleString() : "-")}</div>
    <div>${adminText("requests")}: ${adminFormatNumber(user.requests_total)} · ${adminText("paid")}: ${adminFormatNumber(user.succeeded_payments)} · ${adminText("revenue")}: ${adminFormatNumber(user.revenue_total)} ₽</div>
  </article>`;
  if (roleForm) {
    roleForm.hidden = false;
  }
  const roleSelect = element("admin-user-role");
  if (roleSelect) {
    roleSelect.value = user.role || "user";
  }
  const personasContainer = element("admin-user-personas");
  if (personasContainer) {
    const personas = payload.personas || [];
    personasContainer.innerHTML = `<h3>${adminText("personas")}</h3>${personas.length ? personas
      .map((persona) => `<article class="history-row"><strong>${escapeHtml(persona.name)}</strong><div class="muted">${escapeHtml(persona.birth_date)} · ${escapeHtml(persona.birth_time || "")} · ${escapeHtml(persona.birth_place || "")}</div><div>${escapeHtml(persona.note || "")}</div></article>`)
      .join("") : `<div class="muted">${i18n.noAdminData}</div>`}`;
  }
}

function renderAdminUserRelated(containerId, title, rows, formatter) {
  const container = element(containerId);
  if (!container) {
    return;
  }
  container.innerHTML = `<h3>${escapeHtml(title)}</h3>${rows.length ? rows.map(formatter).join("") : `<div class="muted">${i18n.noAdminData}</div>`}`;
}

async function loadAdminUserDetail(userId) {
  if (!userId) {
    renderAdminUserDetail(null);
    return;
  }
  const [detail, history, transactions, payments] = await Promise.all([
    apiRequest(`/api/admin/users/${userId}`, "GET"),
    apiRequest(`/api/admin/users/${userId}/history`, "GET"),
    apiRequest(`/api/admin/users/${userId}/transactions`, "GET"),
    apiRequest(`/api/admin/users/${userId}/payments`, "GET"),
  ]);
  renderAdminUserDetail(detail);
  renderAdminUserRelated("admin-user-history", adminText("requestHistory"), history.items || [], (item) => {
    const summary = formatHistorySummary(item);
    return `<article class="history-row"><strong>${escapeHtml(summary.title)}</strong><div class="muted">${escapeHtml(summary.subtitle || "")}</div><div class="muted">${escapeHtml(new Date(item.created_at).toLocaleString())}</div></article>`;
  });
  renderAdminUserRelated("admin-user-transactions", adminText("transactions"), transactions.transactions || [], (item) => `<article class="history-row"><strong>${escapeHtml(adminTransactionTypeText(item.type))} · ${adminFormatNumber(item.amount)}</strong><div>${escapeHtml(item.reason)}</div><div class="muted">${escapeHtml(new Date(item.created_at).toLocaleString())}</div></article>`);
  renderAdminUserRelated("admin-user-payments", adminText("payments"), payments.payments || [], (item) => `<article class="history-row"><strong>${escapeHtml(adminPaymentStatusText(item.status))} · ${adminFormatNumber(item.amount)} ₽</strong><div>${adminFormatNumber(item.sparks)} ${adminLabel("sparks")}</div><div class="muted">${escapeHtml(new Date(item.created_at).toLocaleString())}</div></article>`);
}

function adminRangeQuery() {
  const from = element("admin-date-from")?.value || "";
  const to = element("admin-date-to")?.value || "";
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

async function loadAdminDashboard() {
  if (!element("admin-kpi")) {
    return;
  }
  setResult("admin-result", i18n.loading);
  try {
    const query = adminRangeQuery();
    const [overview, daily, modules, paymentsStats, sparksStats, providers, audit, tickets] = await Promise.all([
      apiRequest(`/api/admin/stats/overview?${query}`, "GET"),
      apiRequest(`/api/admin/stats/daily?${query}`, "GET"),
      apiRequest(`/api/admin/stats/modules?${query}`, "GET"),
      apiRequest(`/api/admin/stats/payments?${query}`, "GET"),
      apiRequest(`/api/admin/stats/sparks?${query}`, "GET"),
      apiRequest(`/api/admin/stats/providers?${query}`, "GET"),
      apiRequest("/api/admin/audit-log?limit=50", "GET"),
      apiRequest(`/api/admin/support/tickets?status=${encodeURIComponent(element("admin-support-status")?.value || "")}`, "GET"),
    ]);
    renderAdminKpi(overview);
    renderAdminDailyCharts(daily.days || []);
    renderAdminModules(modules.modules || []);
    renderAdminPaymentFunnel(paymentsStats.payments || []);
    renderAdminSparks(sparksStats.sparks || []);
    renderAdminProviders(providers.providers || []);
    renderAdminAudit(audit.items || []);
    renderAdminTickets(tickets.tickets || []);
    setResult("admin-result", "");
  } catch (error) {
    setResult("admin-result", error.message);
  }
}

let adminUsersCache = [];
let selectedAdminUserId = 0;
let selectedAdminTicketId = 0;

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
            <span class="muted">${escapeHtml(user.created_at ? new Date(user.created_at).toLocaleString() : "")}</span>
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
    selectedAdminUserId = 0;
    return;
  }
  const display = user.username || user.provider_user_id || `#${user.id}`;
  card.innerHTML = `<strong>${adminLabel("selected")}:</strong> #${user.id} · ${escapeHtml(user.provider)} · ${escapeHtml(display)} · ${user.credits} ${adminLabel("sparks")}`;
  hiddenId.value = String(user.id);
  selectedAdminUserId = Number(user.id) || 0;
  form.hidden = false;
}

async function loadAdminUsers(query = "") {
  setResult("admin-credits-result", i18n.loading);
  try {
    const provider = element("admin-user-provider")?.value || "";
    const role = element("admin-user-role-filter")?.value || "";
    const result = await apiRequest(`/api/admin/users/search?q=${encodeURIComponent(query)}&provider=${encodeURIComponent(provider)}&role=${encodeURIComponent(role)}`, "GET");
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
    loadAdminUserDetail(userId).catch((error) => setResult("admin-credits-result", error.message));
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
      await loadAdminUserDetail(result.user_id);
      await loadAdminDashboard();
    } catch (error) {
      setResult("admin-credits-result", error.message);
    }
  });
}

function wireAdminEvents() {
  wireAdminCreditsForm();
  document.querySelectorAll(".admin-period-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const days = Number(button.dataset.days || 30);
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - Math.max(days - 1, 0));
      const toInput = element("admin-date-to");
      const fromInput = element("admin-date-from");
      if (toInput) {
        toInput.value = end.toISOString().slice(0, 10);
      }
      if (fromInput) {
        fromInput.value = start.toISOString().slice(0, 10);
      }
      loadAdminDashboard();
    });
  });
  element("admin-analytics-apply")?.addEventListener("click", () => loadAdminDashboard());
  element("admin-user-provider")?.addEventListener("change", () => loadAdminUsers(element("admin-user-query")?.value.trim() || ""));
  element("admin-user-role-filter")?.addEventListener("change", () => loadAdminUsers(element("admin-user-query")?.value.trim() || ""));
  element("admin-role-apply")?.addEventListener("click", async () => {
    if (!selectedAdminUserId) {
      setResult("admin-credits-result", adminLabel("findFirst"));
      return;
    }
    try {
      const role = element("admin-user-role")?.value || "user";
      await apiRequest(`/api/admin/users/${selectedAdminUserId}/role`, "PATCH", { role });
      await loadAdminUsers(element("admin-user-query")?.value.trim() || "");
      await loadAdminUserDetail(selectedAdminUserId);
      await loadAdminDashboard();
      setResult("admin-credits-result", "Role updated");
    } catch (error) {
      setResult("admin-credits-result", error.message);
    }
  });
  element("admin-support-refresh")?.addEventListener("click", () => loadAdminDashboard());
  const replyForm = element("admin-ticket-reply-form");
  replyForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedAdminTicketId) {
      return;
    }
    try {
      const messageText = element("admin-ticket-reply-text")?.value.trim() || "";
      const result = await apiRequest(`/api/admin/support/tickets/${selectedAdminTicketId}/messages`, "POST", { message_text: messageText });
      renderAdminTicketMessages(result.messages || []);
      element("admin-ticket-reply-text").value = "";
      await loadAdminDashboard();
    } catch (error) {
      setResult("admin-result", error.message);
    }
  });
  const updateTicketStatus = async (status) => {
    if (!selectedAdminTicketId) {
      return;
    }
    try {
      await apiRequest(`/api/admin/support/tickets/${selectedAdminTicketId}`, "PATCH", { status });
      await loadAdminDashboard();
      const result = await apiRequest(`/api/admin/support/tickets/${selectedAdminTicketId}`, "GET");
      renderAdminTicketMessages(result.messages || []);
    } catch (error) {
      setResult("admin-result", error.message);
    }
  };
  element("admin-ticket-close-btn")?.addEventListener("click", () => updateTicketStatus("closed"));
  element("admin-ticket-open-btn")?.addEventListener("click", () => updateTicketStatus("open"));
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
      selectedAdminTicketId = ticketId;
      const hiddenTicket = element("admin-selected-ticket-id");
      if (hiddenTicket) {
        hiddenTicket.value = String(ticketId);
      }
      const form = element("admin-ticket-reply-form");
      if (form) {
        form.hidden = false;
      }
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
      if (redirectGuestFromForm()) {
        setResult("compat-result", i18n.signInRedirecting);
        return;
      }
      setResult("compat-result", i18n.calculating);
      setFormBusy(namesForm, true, i18n.calculating);
      try {
        const result = await apiRequest("/api/sovmestimost/by-names", "POST", {
          name1: element("compat-name1").value.trim(),
          name2: element("compat-name2").value.trim(),
          language: lang,
        }, { redirectOnUnauthorized: true });
        setResult("compat-result", result.result);
        setBalance(result.balance);
      } catch (error) {
        setResult("compat-result", error.message);
      } finally {
        setFormBusy(namesForm, false);
      }
    });
  }

  if (namesDatesForm) {
    namesDatesForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (redirectGuestFromForm()) {
        setResult("compat-result", i18n.signInRedirecting);
        return;
      }
      setResult("compat-result", i18n.calculating);
      setFormBusy(namesDatesForm, true, i18n.calculating);
      try {
        const result = await apiRequest("/api/sovmestimost/by-names-dates", "POST", {
          name1: element("compat-nd-name1").value.trim(),
          date1: element("compat-date1").value.trim(),
          name2: element("compat-nd-name2").value.trim(),
          date2: element("compat-date2").value.trim(),
          language: lang,
        }, { redirectOnUnauthorized: true });
        setResult("compat-result", result.result);
        setBalance(result.balance);
      } catch (error) {
        setResult("compat-result", error.message);
      } finally {
        setFormBusy(namesDatesForm, false);
      }
    });
  }

  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((item) => {
        item.classList.remove("active");
        item.setAttribute("aria-selected", "false");
      });
      document.querySelectorAll(".tab-content").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      button.setAttribute("aria-selected", "true");
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
  syncAuthRequiredSections(!isLoggedIn());
  wirePaymentForms();
  wireAuthPages();
  wireAuthRequiredLinks();
  wireLogoutButton();
  wirePasswordResetForm();
  wireRequestHistory();
  wirePaymentsHistoryActions();
  wireSupportForms();
  wireAdminEvents();
  wireProfilePersonas();
  wireSonnikForm();
  wireNumerologyForm();
  wireTarotForm();
  wireAstrologyForm();
  wireCompatibilityForms();
  localStorage.removeItem(TELEGRAM_INIT_DATA_KEY);
  hydrateUiFromCache();
  await verifyTelegramUsernameLinkFromQuery();
  let profile = null;
  if (hasStoredAuthToken()) {
    profile = await loadProfile();
  }
  let telegramVerified = false;
  if (!isLoggedIn()) {
    telegramVerified = await autoVerifyTelegram();
  }
  if (!profile || telegramVerified || !isLoggedIn()) {
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
  await loadPersonas();
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

