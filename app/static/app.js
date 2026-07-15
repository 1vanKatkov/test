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

function readLangCookie() {
  const match = document.cookie.match(/(?:^|;\s*)astrolhub_lang=([^;]+)/);
  const value = match ? decodeURIComponent(match[1]).trim().toLowerCase() : "";
  return value === "en" ? "en" : value === "ru" ? "ru" : "";
}

function bootstrapLangFromUrl() {
  const url = new URL(window.location.href);
  const urlLang = url.searchParams.get("lang");
  if (urlLang !== "en" && urlLang !== "ru") {
    return;
  }
  document.cookie = `astrolhub_lang=${urlLang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  url.searchParams.delete("lang");
  const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", cleanUrl);
}

bootstrapLangFromUrl();

function resolveClientLang() {
  const cookieLang = readLangCookie();
  if (cookieLang) {
    return cookieLang;
  }
  return document.body.dataset.lang === "en" ? "en" : "ru";
}

const lang = resolveClientLang();
const currentReportId = Number(document.body.dataset.reportId || 0);
const PROFILE_CACHE_KEY = "astrolhub.profileCache";
const BALANCE_CACHE_KEY = "astrolhub.balanceCache";
const PLUS_CACHE_KEY = "astrolhub.plusCache";
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
    readingTarotCards: "Reading tarot cards...",
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
    personaRequired: "Choose a saved persona or enter name, birth date, birth time, and birth place.",
    chooseTarotCards: "The deck is drawing three cards for your spread...",
    tarotCardsSelected: "Your spread",
    tarotCardsNeedExact: "Choose exactly the required number of cards for this spread.",
    tarotCardsDrawing: "Drawing your cards...",
    tarotCardsDrawn: "The cards are on the table. Ask your question.",
    tarotCardsDrawFailed: "Could not draw cards. Refresh the page and try again.",
    insufficientSparksRedirect: "Not enough sparks. Redirecting to top up...",
    plusSubscriptionActive: "Plus subscription is active",
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
    readingTarotCards: "Гадаем по картам Таро...",
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
    personaRequired: "Выберите сохранённую персону или введите имя, дату, время и место рождения.",
    chooseTarotCards: "Колода вытягивает три карты для вашего расклада...",
    tarotCardsSelected: "Ваш расклад",
    tarotCardsNeedExact: "Выберите ровно нужное количество карт для этого расклада.",
    tarotCardsDrawing: "Вытягиваем карты...",
    tarotCardsDrawn: "Карты на столе. Задайте вопрос.",
    tarotCardsDrawFailed: "Не удалось вытянуть карты. Обновите страницу и попробуйте снова.",
    insufficientSparksRedirect: "Недостаточно искр. Перенаправляем на пополнение...",
    plusSubscriptionActive: "Подписка Plus активна",
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
    sparks: "✦",
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
    sparks: "✦",
  },
};

function element(id) {
  return document.getElementById(id);
}

function initPageEntranceAnimation() {
  const body = document.body;
  if (!body || !body.classList.contains("mobile-client-shell") || prefersReducedMotion()) {
    return;
  }
  body.classList.add("page-enter-init");
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      body.classList.add("page-enter-play");
      window.setTimeout(() => {
        body.classList.remove("page-enter-init", "page-enter-play");
      }, 560);
    });
  });
}

function authStaticUrl(page, extraParams = {}) {
  const paths = {
    login: "/static/auth/login.html",
    register: "/static/auth/register.html",
    verify: "/static/auth/register-verify.html",
  };
  const params = new URLSearchParams(extraParams);
  const query = params.toString();
  return query ? `${paths[page]}?${query}` : paths[page];
}

function stripLangFromUrl(url) {
  if (!url) {
    return url;
  }
  const target = new URL(url, window.location.origin);
  target.searchParams.delete("lang");
  return `${target.pathname}${target.search}`;
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
    return "/client";
  }
  try {
    const nextUrl = new URL(nextRaw, window.location.origin);
    if (nextUrl.origin !== window.location.origin) {
      return "/client";
    }
    if (nextUrl.pathname.startsWith("/api/")) {
      return "/client";
    }
    nextUrl.searchParams.delete("lang");
    return `${nextUrl.pathname}${nextUrl.search}`;
  } catch {
    return "/client";
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
    nextUrl.searchParams.delete("lang");
    return authStaticUrl("login", { next: `${nextUrl.pathname}${nextUrl.search}` });
  } catch {
    return loginRedirectUrl();
  }
}

function withLangQuery(url) {
  return stripLangFromUrl(url);
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

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function sparkLoaderMarkup(label = i18n.loading) {
  return `<div class="ai-loading-card" role="status" aria-live="polite" aria-atomic="true">
    <div class="ai-spark-loader" aria-hidden="true">
      <span class="ai-spark-core">✦</span>
      <span class="ai-spark">✦</span>
      <span class="ai-spark">✦</span>
      <span class="ai-spark">✦</span>
      <span class="ai-spark">✦</span>
    </div>
    <span class="visually-hidden">${escapeHtml(label)}</span>
  </div>`;
}

function showSparkLoading(resultId, label = i18n.loading) {
  const node = element(resultId);
  if (!node) {
    return;
  }
  node.innerHTML = sparkLoaderMarkup(label);
  node.hidden = false;
  node.classList.remove("ai-result-enter");
}

function collapseAiForm(form) {
  if (!form) {
    return;
  }
  form.style.maxHeight = `${form.scrollHeight}px`;
  form.setAttribute("aria-busy", "true");
  form.setAttribute("inert", "");
  window.requestAnimationFrame(() => {
    form.classList.add("ai-form-exit");
  });
}

function restoreAiForm(form) {
  if (!form) {
    return;
  }
  form.classList.remove("ai-form-exit");
  form.removeAttribute("aria-busy");
  form.removeAttribute("inert");
  form.style.maxHeight = "";
}

function revealAiResult(resultId, content, options = {}) {
  setResult(resultId, content);
  const node = element(resultId);
  if (!node || !content) {
    return;
  }
  node.setAttribute("tabindex", "-1");
  node.classList.remove("ai-result-enter");
  void node.offsetWidth;
  node.classList.add("ai-result-enter");
  if (options.scroll !== false) {
    node.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }
}

function serviceCostFromDataset(key) {
  const value = Number(document.body?.dataset?.[key] || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function readCachedBalance() {
  const value = readTimedCache(BALANCE_CACHE_KEY);
  return typeof value === "number" ? value : null;
}

function isInsufficientCreditsError(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("insufficient credits") || text.includes("недостаточно");
}

function computeSparksShortfall(requiredCost) {
  const balance = readCachedBalance();
  if (balance === null) {
    return requiredCost;
  }
  return Math.max(0, requiredCost - balance);
}

function sparksNeededForPurchase(requiredCost) {
  const shortfall = computeSparksShortfall(requiredCost);
  return shortfall > 0 ? shortfall : requiredCost;
}

function recommendPackageId(packages, sparksNeeded) {
  if (!Array.isArray(packages) || !packages.length || sparksNeeded <= 0) {
    return "";
  }
  const sorted = [...packages].sort((left, right) => Number(left.sparks) - Number(right.sparks));
  const match = sorted.find((pkg) => Number(pkg.sparks) >= sparksNeeded);
  return (match || sorted[sorted.length - 1]).id;
}

function topupRedirectUrl(sparksNeeded, packageId = "") {
  const params = new URLSearchParams({ lang, tab: "sparks" });
  if (sparksNeeded > 0) {
    params.set("sparks", String(sparksNeeded));
  }
  if (packageId) {
    params.set("package", packageId);
  }
  return `/client/topup?${params.toString()}`;
}

async function redirectToTopupForRequiredCost(requiredCost) {
  const cost = Number(requiredCost) || 0;
  if (cost <= 0) {
    return false;
  }
  const sparksNeeded = sparksNeededForPurchase(cost);
  let packageId = "";
  try {
    const result = await apiRequest(`/api/payments/packages?for_sparks=${encodeURIComponent(sparksNeeded)}`, "GET");
    packageId = result.recommended_package_id || recommendPackageId(result.packages, sparksNeeded);
  } catch {
    packageId = "";
  }
  window.location.href = topupRedirectUrl(sparksNeeded, packageId);
  return true;
}

async function runReportFlow({ form, resultId, loadingLabel, request, onSuccess, onError, collapseForm = true, scrollToResult = true, requiredCost = 0 }) {
  if (redirectGuestFromForm()) {
    setResult(resultId, i18n.signInRedirecting);
    return null;
  }
  const cost = Number(requiredCost) || 0;
  if (cost > 0) {
    const balance = readCachedBalance();
    if (balance !== null && balance < cost) {
      setResult(resultId, i18n.insufficientSparksRedirect);
      if (await redirectToTopupForRequiredCost(cost)) {
        return null;
      }
    }
  }
  setResult(resultId, "");
  showSparkLoading(resultId, loadingLabel);
  if (collapseForm) {
    collapseAiForm(form);
  }
  setFormBusy(form, true, null);
  try {
    const data = await request();
    if (onSuccess) {
      onSuccess(data, { revealResult: (content) => revealAiResult(resultId, content, { scroll: scrollToResult }) });
    } else {
      revealAiResult(resultId, data?.result || data?.interpretation || "", { scroll: scrollToResult });
    }
    return data;
  } catch (error) {
    restoreAiForm(form);
    if (isInsufficientCreditsError(error.message) && cost > 0) {
      setResult(resultId, i18n.insufficientSparksRedirect);
      if (await redirectToTopupForRequiredCost(cost)) {
        return null;
      }
    }
    setResult(resultId, error.message);
    if (onError) {
      onError(error);
    }
    return null;
  } finally {
    setFormBusy(form, false);
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

function setPlusStatus(isPlus) {
  document.querySelectorAll("#header-plus-badge, #dashboard-hero-plus-badge").forEach((node) => {
    node.hidden = !isPlus;
  });
  const plusStatus = element("plus-subscription-status");
  const plusForm = element("plus-subscription-form");
  if (plusStatus) {
    plusStatus.hidden = !isPlus;
  }
  if (plusForm) {
    plusForm.hidden = isPlus;
  }
  const plusResult = element("plus-subscription-result");
  if (plusResult && isPlus) {
    plusResult.textContent = i18n.plusSubscriptionActive;
  }
}

function applyBalanceState(result) {
  if (typeof result?.balance === "number") {
    saveTimedCache(BALANCE_CACHE_KEY, result.balance);
    setBalance(result.balance);
  }
  if (typeof result?.is_plus === "boolean") {
    saveTimedCache(PLUS_CACHE_KEY, result.is_plus);
    setPlusStatus(result.is_plus);
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
    setAuthBadge(profile.username);
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
  const isPlus = readTimedCache(PLUS_CACHE_KEY);
  if (typeof isPlus === "boolean") {
    setPlusStatus(isPlus);
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
    if (loadingText !== null) {
      submitButton.textContent = loadingText;
    }
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
    setAuthBadge(profile.username);
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
  window.location.href = "/client";
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
  applyBalanceState(result);
}

async function loadPaymentPackages() {
  const select = element("payment-package");
  if (!select) {
    return;
  }
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const recommendedSparks = Number(urlParams.get("sparks") || 0);
    const recommendedPackage = urlParams.get("package") || "";
    const query = recommendedSparks > 0 ? `?for_sparks=${encodeURIComponent(recommendedSparks)}` : "";
    const result = await apiRequest(`/api/payments/packages${query}`, "GET");
    select.innerHTML = "";
    result.packages.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      select.appendChild(option);
    });
    const packageId = recommendedPackage || result.recommended_package_id || "";
    if (packageId) {
      select.value = packageId;
    }
    const notice = element("payment-topup-notice");
    if (notice && recommendedSparks > 0) {
      const selectedPackage = result.packages.find((item) => item.id === select.value);
      notice.textContent = lang === "en"
        ? `Top up at least ${recommendedSparks} sparks to continue.${selectedPackage ? ` Suggested package: ${selectedPackage.label}.` : ""}`
        : `Для продолжения пополните баланс минимум на ${recommendedSparks} искр.${selectedPackage ? ` Рекомендуемый пакет: ${selectedPackage.label}.` : ""}`;
      notice.hidden = false;
    }
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

function wirePlusSubscriptionForm() {
  const form = element("plus-subscription-form");
  if (!form) {
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setResult("plus-subscription-result", i18n.creatingPayment);
    try {
      const receiptEmail = (element("plus-subscription-email")?.value || "").trim();
      if (!receiptEmail.includes("@")) {
        throw new Error(i18n.enterEmail);
      }
      const offerAccepted = element("plus-subscription-offer-accepted");
      if (offerAccepted && !offerAccepted.checked) {
        throw new Error(i18n.acceptPublicOffer);
      }
      const result = await apiRequest("/api/payments/yookassa/create", "POST", {
        package_id: "astrolhub_plus",
        receipt_email: receiptEmail,
      }, { redirectOnUnauthorized: true });
      state.lastPaymentId = result.payment_id;
      sessionStorage.setItem("astrolhub.lastPaymentId", result.payment_id);
      setResult("plus-subscription-result", `${i18n.paymentCreated}: ${result.payment_id}`);
      if (result.confirmation_url) {
        window.location.href = result.confirmation_url;
      }
    } catch (error) {
      setResult("plus-subscription-result", error.message);
    }
  });
}

function activateTopupTab(tabName) {
  const normalized = tabName === "plus" ? "plus" : "sparks";
  document.querySelectorAll(".topup-tab").forEach((button) => {
    const isActive = button.dataset.topupTab === normalized;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  const sparksPanel = element("topup-panel-sparks");
  const plusPanel = element("topup-panel-plus");
  if (sparksPanel) {
    sparksPanel.hidden = normalized !== "sparks";
    sparksPanel.classList.toggle("is-active", normalized === "sparks");
  }
  if (plusPanel) {
    plusPanel.hidden = normalized !== "plus";
    plusPanel.classList.toggle("is-active", normalized === "plus");
  }
}

function closeTopupChoiceModal() {
  const modal = element("topup-choice-modal");
  if (!modal) {
    return;
  }
  modal.hidden = true;
  modal.classList.remove("is-open");
  document.body.classList.remove("modal-open");
}

function openTopupChoiceModal() {
  const modal = element("topup-choice-modal");
  if (!modal) {
    return;
  }
  modal.hidden = false;
  modal.classList.add("is-open");
  document.body.classList.add("modal-open");
}

function shouldSkipTopupChoiceModal() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("tab") === "plus" || params.get("tab") === "sparks") {
    return true;
  }
  if (params.get("sparks") || params.get("package")) {
    return true;
  }
  return false;
}

function wireTopupPage() {
  if (!element("topup-panel-sparks")) {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const initialTab = params.get("tab") === "plus" ? "plus" : "sparks";
  activateTopupTab(initialTab);
  document.querySelectorAll(".topup-tab").forEach((button) => {
    button.addEventListener("click", () => {
      activateTopupTab(button.dataset.topupTab || "sparks");
    });
  });
  element("topup-choice-plus-btn")?.addEventListener("click", () => {
    activateTopupTab("plus");
    closeTopupChoiceModal();
  });
  element("topup-choice-sparks-btn")?.addEventListener("click", () => {
    activateTopupTab("sparks");
    closeTopupChoiceModal();
  });
  element("topup-choice-modal")?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.id === "topup-choice-modal") {
      closeTopupChoiceModal();
      activateTopupTab("sparks");
    }
  });
  if (!shouldSkipTopupChoiceModal()) {
    openTopupChoiceModal();
  } else {
    closeTopupChoiceModal();
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
    tarot: lang === "en" ? "Astrology" : "Астрология",
    tarot_cards: lang === "en" ? "Tarot" : "Таро",
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

function formatDateOnly(value) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return escapeHtml(String(value));
  }
  return escapeHtml(parsed.toLocaleDateString());
}

function formatHistoryDisplay(item) {
  const raw = item.input_text || "";
  const astrologyModuleLabel = lang === "en" ? "Astrology" : "Астрология";
  const result = {
    service: moduleLabel(item.module),
    serviceType: "",
    persona: "",
    birthDate: "",
    requestInfo: compactText(raw, ""),
  };

  if (item.module === "numerology") {
    const [name, birthDate] = raw.split(";").map((part) => part.trim());
    result.persona = name || "";
    result.birthDate = birthDate || "";
    result.requestInfo = lang === "en" ? "Numerology report request" : "Запрос на нумерологический разбор";
    return result;
  }

  if (item.module === "tarot") {
    const parts = raw.split(";").map((part) => part.trim());
    const topic = parts[0] || "";
    const personaPart = parts.find((part) => part.startsWith("persona=")) || "";
    const personaName = personaPart ? personaPart.replace(/^persona=/, "").trim() : "";
    const requestText = parts
      .filter((part, index) => index > 0 && part !== "natal_map" && !part.startsWith("persona="))
      .join("; ")
      .trim();
    result.service = astrologyModuleLabel;
    result.serviceType = natalTopicLabel(topic);
    result.persona = personaName || "";
    result.requestInfo = compactText(requestText, lang === "en" ? "Astrology analysis request" : "Запрос на астрологический разбор");
    return result;
  }

  if (item.module === "astrology") {
    const [name, birthDate, _birthTime, birthPlace, focus] = raw.split(";").map((part) => part.trim());
    result.service = astrologyModuleLabel;
    result.serviceType = focus && focus !== "-" ? focus : "";
    result.persona = name || "";
    result.birthDate = birthDate || "";
    const infoParts = [focus, birthPlace].filter((part) => part && part !== "-");
    result.requestInfo = compactText(infoParts.join(" · "), lang === "en" ? "Astrology forecast request" : "Запрос на астропрогноз");
    return result;
  }

  if (item.module === "sovmestimost_names_dates") {
    const [name1, date1, name2, date2] = raw.split(";").map((part) => part.trim());
    result.persona = [name1, name2].filter(Boolean).join(" + ") || "";
    result.birthDate = [date1, date2].filter(Boolean).join(" + ") || "";
    result.requestInfo = lang === "en" ? "Compatibility request by names and birth dates" : "Запрос совместимости по именам и датам рождения";
    return result;
  }

  if (item.module === "sovmestimost_names") {
    const [name1, name2] = raw.split(";").map((part) => part.trim());
    result.persona = [name1, name2].filter(Boolean).join(" + ") || "";
    result.requestInfo = lang === "en" ? "Compatibility request by names" : "Запрос совместимости по именам";
    return result;
  }

  if (item.module === "sonnik") {
    result.requestInfo = compactText(raw, lang === "en" ? "Dream interpretation request" : "Запрос на толкование сна");
    return result;
  }

  if (item.module === "tarot_cards") {
    const parts = raw.split(";").map((part) => part.trim());
    const cardsSummary = parts[1] || "";
    const question = parts[2] && parts[2] !== "-" ? parts[2] : "";
    result.requestInfo = compactText(
      question || cardsSummary,
      lang === "en" ? "Tarot cards request" : "Запрос по картам Таро",
    );
    return result;
  }

  return result;
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
  if (item.module === "tarot_cards") {
    const parts = raw.split(";").map((part) => part.trim()).filter(Boolean);
    return {
      title: lang === "en" ? "Tarot reading" : "Гадание Таро",
      subtitle: compactText(parts[1] || parts[2] || "", lang === "en" ? "Selected cards" : "Выбранные карты"),
      chips: [parts[0] || "", parts[1] || ""].filter(Boolean),
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
      const detailsUrl = item.module === "numerology" && item.report_url
        ? escapeHtml(item.report_url)
        : `/client/history/request/${itemId}`;
      const display = formatHistoryDisplay(item);
      const createdAt = formatDateOnly(item.created_at);
      const serviceText = display.serviceType
        ? `${escapeHtml(display.service)} · ${escapeHtml(display.serviceType)}`
        : escapeHtml(display.service);
      const personaLine = display.persona
        ? `<span class="history-summary-main">${lang === "en" ? "Persona" : "Персона"}: ${escapeHtml(display.persona)}</span>`
        : "";
      const birthDateLine = display.birthDate
        ? `<span class="history-summary-subtitle">${lang === "en" ? "Birth date" : "Дата рождения"}: ${escapeHtml(display.birthDate)}</span>`
        : "";
      return `<article class="history-row history-item" data-item-id="${itemId}">
      <a class="history-summary-btn" href="${detailsUrl}" data-item-id="${itemId}">
        <span class="history-card-top">
          <span class="history-module-badge">${serviceText}</span>
          <span class="history-created-at">${createdAt}</span>
        </span>
        ${personaLine}
        ${birthDateLine}
        <span class="history-summary-subtitle">${escapeHtml(display.requestInfo || "—")}</span>
      </a>
    </article>`;
    })
    .join("");
}

function wireRequestHistory() {
  // Card click now navigates to a dedicated full analysis page.
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

async function loadHistoryRequestDetail() {
  const detailsContainer = element("history-detail-body");
  if (!detailsContainer) {
    return;
  }
  const requestId = Number(document.body?.dataset.historyRequestId || 0);
  if (!requestId) {
    setResult("history-detail-result", lang === "en" ? "Request not found" : "Запрос не найден");
    return;
  }
  setResult("history-detail-result", i18n.loading);
  try {
    const response = await apiRequest(`/api/history/requests/${requestId}`, "GET", undefined, { redirectOnUnauthorized: true });
    const item = response.item || {};
    const display = formatHistoryDisplay(item);
    const createdAt = formatDateOnly(item.created_at);
    const serviceText = display.serviceType ? `${display.service} · ${display.serviceType}` : display.service;
    const meta = element("history-detail-meta");
    const personaChip = display.persona
      ? `<span class="history-meta-chip">${lang === "en" ? "Persona" : "Персона"}: ${escapeHtml(display.persona)}</span>`
      : "";
    const birthDateChip = display.birthDate
      ? `<span class="history-meta-chip">${lang === "en" ? "Birth date" : "Дата рождения"}: ${escapeHtml(display.birthDate)}</span>`
      : "";
    if (meta) {
      meta.innerHTML = `
        <span class="history-module-badge">${escapeHtml(serviceText)}</span>
        ${personaChip}
        ${birthDateChip}
        <span class="history-meta-chip">${createdAt}</span>
      `;
    }
    const requestText = element("history-detail-request-text");
    if (requestText) {
      requestText.textContent = display.requestInfo || "—";
    }
    if (item.module === "tarot_cards") {
      detailsContainer.innerHTML = "";
      const tarotResult = element("tarot-cards-result");
      if (tarotResult) {
        tarotResult.hidden = false;
      }
      const raw = (item.input_text || "").split(";").map((part) => part.trim());
      const cardsSummary = raw[1] || "";
      const cards = cardsSummary
        .split(",")
        .map((name, index) => ({
          id: `history-card-${index + 1}`,
          name: name.trim(),
          symbol: "✦",
          arcana: "major",
        }))
        .filter((card) => card.name);
      renderTarotCardsResult({
        cards,
        interpretation: item.output_text || "",
      });
    } else {
      const tarotResult = element("tarot-cards-result");
      if (tarotResult) {
        tarotResult.hidden = true;
        tarotResult.innerHTML = "";
      }
      detailsContainer.innerHTML = renderMarkdownText(item.output_text || "");
    }
    const actions = element("history-detail-actions");
    if (actions) {
      actions.innerHTML = item.report_url
        ? `<a class="secondary-btn inline-link-btn" href="${escapeHtml(item.report_url)}">${i18n.openReport}</a>`
        : "";
    }
    setResult("history-detail-result", "");
  } catch (error) {
    setResult("history-detail-result", error.message);
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
          <strong>${payment.sparks} <span class="spark-icon" aria-hidden="true">✦</span></strong>
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
    await refreshBalance().catch(() => {
      if (typeof result.balance === "number") {
        setBalance(result.balance);
      }
    });
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
    await apiRequest("/api/payments/yookassa/sync-pending", "POST", undefined, { redirectOnUnauthorized: true });
    await refreshBalance().catch(() => {});
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
    await runReportFlow({
      form,
      resultId: "sonnik-result",
      loadingLabel: i18n.analyzingDream,
      requiredCost: serviceCostFromDataset("costSonnik"),
      request: () => apiRequest("/api/sonnik/interpret", "POST", {
        dream_text: element("dream-text").value.trim(),
        language: lang,
      }, { redirectOnUnauthorized: true }),
      onSuccess: (result, { revealResult }) => {
        revealResult(result.interpretation);
        setBalance(result.balance);
      },
    });
  });
}

function wireNumerologyForm() {
  const form = element("numerology-form");
  if (!form) {
    return;
  }
  wirePersonaPicker("numerology-persona");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    let personaPayload;
    try {
      personaPayload = await resolvePersonaForPrefix("numerology-persona");
    } catch (error) {
      setResult("numerology-result", error.message);
      return;
    }
    const resolvedPersona = personaPayload.resolvedPersona || {};
    const fullName = personaPayload.persona_name || resolvedPersona.name || "";
    const birthDate = personaPayload.persona_birth_date || resolvedPersona.birth_date || "";
    await runReportFlow({
      form,
      resultId: "numerology-result",
      loadingLabel: i18n.generatingReport,
      requiredCost: serviceCostFromDataset("costNumerology"),
      request: () => apiRequest("/api/numerology/generate", "POST", {
        full_name: fullName,
        birth_date: birthDate,
        language: lang,
      }, { redirectOnUnauthorized: true }),
      onSuccess: (result) => {
        const reportUrl = result.report_url;
        setBalance(result.balance);
        window.location.assign(reportUrl);
      },
    });
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

function formatBirthDateInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  const parts = [];
  if (digits.length > 0) {
    parts.push(digits.slice(0, 2));
  }
  if (digits.length > 2) {
    parts.push(digits.slice(2, 4));
  }
  if (digits.length > 4) {
    parts.push(digits.slice(4, 8));
  }
  return parts.filter(Boolean).join(".");
}

function wireBirthDateMasks() {
  document.querySelectorAll("input[id$='birth-date'], input[data-date-mask='birth-date']").forEach((input) => {
    if (!(input instanceof HTMLInputElement) || input.dataset.birthDateMaskWired === "true") {
      return;
    }
    input.dataset.birthDateMaskWired = "true";
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("maxlength", "10");
    input.addEventListener("input", () => {
      input.value = formatBirthDateInput(input.value);
    });
    input.addEventListener("paste", () => {
      setTimeout(() => {
        input.value = formatBirthDateInput(input.value);
      }, 0);
    });
    input.value = formatBirthDateInput(input.value);
  });
}

function formatBirthTimeInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

function wireBirthTimeMasks() {
  document.querySelectorAll("input[id$='birth-time'], input[data-time-mask='birth-time']").forEach((input) => {
    if (!(input instanceof HTMLInputElement) || input.dataset.birthTimeMaskWired === "true") {
      return;
    }
    input.dataset.birthTimeMaskWired = "true";
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("maxlength", "5");
    input.addEventListener("input", () => {
      input.value = formatBirthTimeInput(input.value);
    });
    input.addEventListener("paste", () => {
      setTimeout(() => {
        input.value = formatBirthTimeInput(input.value);
      }, 0);
    });
    input.value = formatBirthTimeInput(input.value);
  });
}

function personaPreview(persona) {
  if (!persona) {
    return "";
  }
  return [persona.name, persona.birth_date, persona.birth_time, persona.birth_place]
    .filter(Boolean)
    .join(" · ");
}

function personaModeValue(prefix) {
  return document.querySelector(`input[name='${prefix}-mode']:checked`)?.value || "manual";
}

function renderPersonaSelect(prefix) {
  const select = element(`${prefix}-select`);
  const choices = element(`${prefix}-choices`);
  if (!select && !choices) {
    return;
  }
  const selectedValue = select?.value || choices?.dataset.selectedPersonaId || "";
  const selectedPersona = state.personas.some((persona) => String(persona.id) === selectedValue)
    ? selectedValue
    : String(state.personas[0]?.id || "");
  if (select) {
    select.innerHTML = state.personas.length
      ? state.personas.map((persona) => `<option value="${persona.id}">${escapeHtml(persona.name)} · ${escapeHtml(persona.birth_date)}</option>`).join("")
      : `<option value="">${escapeHtml(i18n.personaEmpty)}</option>`;
    select.value = selectedPersona;
  }
  if (choices) {
    choices.dataset.selectedPersonaId = selectedPersona;
    if (!state.personas.length) {
      choices.innerHTML = `<div class="persona-choice-empty" role="option" aria-disabled="true">${escapeHtml(i18n.personaEmpty)}</div>`;
    } else {
      choices.innerHTML = state.personas
        .map((persona, index) => {
          const isSelected = String(persona.id) === selectedPersona;
          return `<button type="button" class="persona-choice-card${isSelected ? " is-selected" : ""}" data-persona-id="${persona.id}" role="option" aria-selected="${isSelected ? "true" : "false"}" style="--choice-index:${index}">
            <span class="persona-choice-glow" aria-hidden="true"></span>
            <strong>${escapeHtml(persona.name)}</strong>
            <span>${escapeHtml(persona.birth_date)}</span>
            ${persona.birth_time || persona.birth_place ? `<small>${escapeHtml([persona.birth_time, persona.birth_place].filter(Boolean).join(" · "))}</small>` : ""}
          </button>`;
        })
        .join("");
    }
  }
  updatePersonaPreview(prefix);
}

function updatePersonaPreview(prefix) {
  const preview = element(`${prefix}-preview`);
  const select = element(`${prefix}-select`);
  const choices = element(`${prefix}-choices`);
  if (!preview || (!select && !choices)) {
    return;
  }
  const selectedId = select?.value || choices?.dataset.selectedPersonaId || "";
  const persona = state.personas.find((item) => String(item.id) === String(selectedId));
  preview.textContent = persona ? personaPreview(persona) : "";
}

function togglePersonaPanels(prefix) {
  const mode = personaModeValue(prefix);
  const savedPanel = element(`${prefix}-saved-persona-panel`);
  const manualPanel = element(`${prefix}-manual-persona-panel`);
  const setPanelActive = (panel, active) => {
    if (!panel) {
      return;
    }
    panel.hidden = !active;
    panel.querySelectorAll("input, select, textarea, button").forEach((control) => {
      control.disabled = !active;
    });
  };
  document.querySelectorAll(`input[name='${prefix}-mode']`).forEach((radio) => {
    radio.closest("label")?.classList.toggle("is-active", radio.checked);
  });
  setPanelActive(savedPanel, mode === "saved");
  setPanelActive(manualPanel, mode === "manual");
}

function wirePersonaPicker(prefix) {
  document.querySelectorAll(`input[name='${prefix}-mode']`).forEach((radio) => {
    radio.addEventListener("change", () => togglePersonaPanels(prefix));
  });
  element(`${prefix}-select`)?.addEventListener("change", () => updatePersonaPreview(prefix));
  element(`${prefix}-choices`)?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const button = target?.closest(".persona-choice-card");
    if (!button) {
      return;
    }
    element(`${prefix}-choices`).dataset.selectedPersonaId = button.dataset.personaId || "";
    element(`${prefix}-choices`)?.querySelectorAll(".persona-choice-card").forEach((item) => {
      const isSelected = item === button;
      item.classList.toggle("is-selected", isSelected);
      item.setAttribute("aria-selected", isSelected ? "true" : "false");
    });
    updatePersonaPreview(prefix);
  });
  togglePersonaPanels(prefix);
}

async function resolvePersonaForPrefix(prefix, options = {}) {
  const mode = personaModeValue(prefix);
  const manualPersona = personaPayloadFromPrefix(prefix);
  let personaId = mode === "saved"
    ? Number(element(`${prefix}-select`)?.value || element(`${prefix}-choices`)?.dataset.selectedPersonaId || 0)
    : 0;
  if (mode === "saved" && !personaId) {
    throw new Error(i18n.personaRequired);
  }
  if (mode === "manual" && (!manualPersona.name || !manualPersona.birth_date || !manualPersona.birth_time || !manualPersona.birth_place)) {
    throw new Error(i18n.personaRequired);
  }
  if (!options.skipSave && mode === "manual" && element(`${prefix}-save-persona`)?.checked && manualPersona.name && manualPersona.birth_date) {
    const persona = await createPersona(manualPersona);
    personaId = Number(persona?.id || 0);
    await loadPersonas();
    const select = element(`${prefix}-select`);
    if (select && personaId) {
      select.value = String(personaId);
      updatePersonaPreview(prefix);
    }
    const choices = element(`${prefix}-choices`);
    if (choices && personaId) {
      choices.dataset.selectedPersonaId = String(personaId);
      renderPersonaSelect(prefix);
    }
  }
  return {
    [`${options.idKey || "persona_id"}`]: personaId,
    [`${options.nameKey || "persona_name"}`]: mode === "manual" ? manualPersona.name : "",
    [`${options.birthDateKey || "persona_birth_date"}`]: mode === "manual" ? manualPersona.birth_date : "",
    [`${options.birthTimeKey || "persona_birth_time"}`]: mode === "manual" ? manualPersona.birth_time : "",
    [`${options.birthPlaceKey || "persona_birth_place"}`]: mode === "manual" ? manualPersona.birth_place : "",
    [`${options.noteKey || "persona_note"}`]: mode === "manual" ? manualPersona.note : "",
    resolvedPersona: mode === "manual"
      ? manualPersona
      : state.personas.find((persona) => Number(persona.id) === personaId),
  };
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
    ["numerology-persona", "compat-persona1", "compat-persona2"].forEach(renderPersonaSelect);
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
  ["numerology-persona", "compat-persona1", "compat-persona2"].forEach(renderPersonaSelect);
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
    .map((persona) => {
      const nameLabel = lang === "en" ? "Name" : "Имя";
      const birthDateLabel = lang === "en" ? "Birth date" : "Дата рождения";
      return `<article class="persona-list-row" data-persona-id="${persona.id}">
      <div class="persona-list-info">
        <span class="persona-info-line"><strong>${nameLabel}:</strong> ${escapeHtml(persona.name)}</span>
        <span class="persona-info-line muted"><strong>${birthDateLabel}:</strong> ${escapeHtml(persona.birth_date || "—")}</span>
      </div>
      <div class="persona-row-actions">
        <button type="button" class="secondary-btn persona-edit-btn" data-persona-id="${persona.id}">${lang === "en" ? "Edit" : "Редактировать"}</button>
        <button type="button" class="secondary-btn persona-delete-btn" data-persona-id="${persona.id}">${lang === "en" ? "Delete" : "Удалить"}</button>
      </div>
    </article>`;
    })
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
      resultNode.classList.remove("ai-result-enter");
      void resultNode.offsetWidth;
      resultNode.classList.add("ai-result-enter");
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
    const setPanelActive = (panel, active) => {
      if (!panel) {
        return;
      }
      panel.hidden = !active;
      panel.querySelectorAll("input, select, textarea, button").forEach((control) => {
        control.disabled = !active;
      });
    };
    setPanelActive(savedPanel, mode === "saved");
    setPanelActive(manualPanel, mode === "manual");
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
    restoreAiForm(form);
    form.hidden = false;
    setTarotFormStatus("");
    form.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  });
  togglePersonaMode();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setResult("tarot-result", "");
    setTarotFormStatus("");
    const personaMode = document.querySelector("input[name='tarot-persona-mode']:checked")?.value || "saved";
    const manualPersona = personaPayloadFromPrefix("tarot-persona");
    let personaId = personaMode === "saved" ? Number(element("tarot-persona-select")?.value || 0) : 0;
    if (personaMode === "saved" && !personaId) {
      setTarotFormStatus(i18n.personaRequired);
      return;
    }
    if (personaMode === "manual" && (!manualPersona.name || !manualPersona.birth_date || !manualPersona.birth_time || !manualPersona.birth_place)) {
      setTarotFormStatus(i18n.personaRequired);
      return;
    }
    await runReportFlow({
      form,
      resultId: "tarot-result",
      loadingLabel: i18n.readingTarot,
      requiredCost: serviceCostFromDataset("costTarot"),
      request: async () => {
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
      return apiRequest("/api/tarot/reading", "POST", {
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
      },
      onSuccess: (result) => {
      setTarotFormStatus("");
      showTarotReadingResult(result.result);
      setBalance(result.balance);
      },
      onError: (error) => {
      setTarotFormStatus(error.message);
      },
      scrollToResult: false,
    });
  });
}

let tarotCardsDeck = [];
let tarotCardsSpreads = [];
let selectedTarotCardIds = [];
let drawnTarotCards = [];
let tarotDrawToken = "";
const TAROT_REQUIRED_CARDS = 3;

function selectedTarotSpread() {
  return tarotCardsSpreads.find((spread) => spread.id === "three_cards") || { id: "three_cards", size: TAROT_REQUIRED_CARDS, title: lang === "en" ? "Three cards" : "Три карты" };
}

function tarotCardById(cardId) {
  return tarotCardsDeck.find((card) => card.id === cardId);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function renderTarotCardButton(card, isSelected = false, index = 0, extraClass = "") {
  const name = escapeHtml(card.name);
  const symbol = escapeHtml(card.symbol || "✦");
  const arcana = card.arcana === "major" ? (lang === "en" ? "Major Arcana" : "Старший аркан") : (lang === "en" ? "Minor Arcana" : "Младший аркан");
  return `<button
    type="button"
    class="tarot-card ${extraClass} ${isSelected ? "is-flipped is-selected" : ""}"
    data-card-id="${escapeHtml(card.id)}"
    style="--card-index:${index}"
    aria-pressed="${isSelected ? "true" : "false"}"
  >
    <span class="tarot-card-inner">
      <span class="tarot-card-face tarot-card-back">
        <span class="tarot-card-back-symbol">✦</span>
      </span>
      <span class="tarot-card-face tarot-card-front">
        <span class="tarot-card-corner">${symbol}</span>
        <span class="tarot-card-symbol">${symbol}</span>
        <span class="tarot-card-name">${name}</span>
        <span class="tarot-card-arcana">${escapeHtml(arcana)}</span>
      </span>
    </span>
  </button>`;
}

function renderTarotCardBack(card, index = 0, extraClass = "") {
  const cardId = escapeHtml(card?.id || `drawn-${index}`);
  return `<div
    class="tarot-card ${extraClass}"
    data-card-id="${cardId}"
    style="--card-index:${index}"
    role="button"
    tabindex="0"
    aria-label="${lang === "en" ? "Closed tarot card" : "Закрытая карта Таро"}"
  >
    <span class="tarot-card-inner">
      <span class="tarot-card-face tarot-card-back">
        <span class="tarot-card-back-symbol">✦</span>
      </span>
      <span class="tarot-card-face tarot-card-front"></span>
    </span>
  </div>`;
}

function renderTarotCardsDeck() {
  const deck = element("tarot-card-deck");
  if (!deck) {
    return;
  }
  deck.innerHTML = `<div class="tarot-deck-pile" aria-hidden="true">
    ${Array.from({ length: 9 }, (_item, index) => `<span class="tarot-deck-layer" style="--layer-index:${index}"></span>`).join("")}
  </div>`;
}

function setTarotStagePhase(phase) {
  const stage = element("tarot-stage");
  if (stage) {
    stage.dataset.phase = phase;
  }
}

function renderTarotCardsResult(result) {
  const container = element("tarot-cards-result");
  if (!container) {
    return;
  }
  const cards = result.cards || [];
  container.innerHTML = `<div class="tarot-result-cards">
    ${cards.map((card, index) => `<article class="tarot-result-card" style="--reveal-index:${index}">
      ${renderTarotCardButton(card, false, index)}
      <strong>${escapeHtml(card.position || "")}</strong>
      <span>${escapeHtml(card.name || "")}</span>
    </article>`).join("")}
  </div>
  <div class="tarot-interpretation">${renderMarkdownText(result.interpretation || "")}</div>`;
  container.hidden = false;
  container.querySelectorAll(".tarot-result-card .tarot-card").forEach((card, index) => {
    window.setTimeout(() => {
      card.classList.add("is-flipped", "is-selected");
      card.setAttribute("aria-pressed", "true");
    }, prefersReducedMotion() ? 0 : 260 + index * 260);
  });
}

function setTarotDrawStatus(message) {
  const status = element("tarot-draw-status");
  if (status) {
    status.textContent = message;
  }
}

function revealTarotCardsForm() {
  const form = element("tarot-cards-form");
  if (!form) {
    return;
  }
  form.hidden = false;
  form.classList.remove("is-collapsed");
  form.classList.add("is-revealed");
  form.removeAttribute("inert");
  form.querySelector("textarea")?.focus({ preventScroll: true });
}

function hideTarotCardsForm() {
  const form = element("tarot-cards-form");
  if (!form) {
    return;
  }
  form.classList.add("is-collapsed");
  form.classList.remove("is-revealed");
  form.setAttribute("inert", "");
}

async function requestTarotDraw() {
  const spread = selectedTarotSpread();
  const result = await apiRequest("/api/tarot-cards/draw", "POST", {
    spread: spread.id,
    language: lang,
  });
  const cards = result.cards || [];
  if (cards.length !== TAROT_REQUIRED_CARDS) {
    throw new Error(i18n.tarotCardsDrawFailed);
  }
  drawnTarotCards = cards;
  selectedTarotCardIds = cards.map((card) => card.id);
  tarotDrawToken = result.draw_token || "";
  if (!tarotDrawToken) {
    throw new Error(i18n.tarotCardsDrawFailed);
  }
}

async function placeTarotCardOnTable(card, index) {
  const slot = document.querySelector(`.tarot-spread-slot[data-slot="${index}"]`);
  if (!slot) {
    return;
  }
  slot.innerHTML = renderTarotCardBack(card, index, "is-dealing-to-table");
  slot.classList.add("is-filled");
  const cardNode = slot.querySelector(".tarot-card");
  if (prefersReducedMotion()) {
    cardNode?.classList.remove("is-dealing-to-table");
    return;
  }
  await wait(180 + index * 180);
  cardNode?.classList.add("is-arrived");
  await wait(460);
}

async function startTarotAutoDraw() {
  const deck = element("tarot-card-deck");
  const slots = document.querySelectorAll(".tarot-spread-slot");
  if (!deck || !slots.length) {
    return;
  }
  hideTarotCardsForm();
  setTarotStagePhase("dealing");
  setTarotDrawStatus(i18n.tarotCardsDrawing);
  tarotDrawToken = "";
  selectedTarotCardIds = [];
  drawnTarotCards = [];
  slots.forEach((slot) => {
    slot.innerHTML = "";
    slot.classList.remove("is-filled");
  });
  try {
    await requestTarotDraw();
    deck.classList.add("is-dealing");
    for (let index = 0; index < drawnTarotCards.length; index += 1) {
      await placeTarotCardOnTable(drawnTarotCards[index], index);
    }
    deck.classList.remove("is-dealing");
    setTarotStagePhase("ready");
    setTarotDrawStatus(i18n.tarotCardsDrawn);
    revealTarotCardsForm();
  } catch (error) {
    setTarotStagePhase("error");
    setTarotDrawStatus(error.message || i18n.tarotCardsDrawFailed);
  }
}

async function loadTarotCardsDeck() {
  if (!element("tarot-card-deck")) {
    return;
  }
  const result = await apiRequest(`/api/tarot-cards/deck?lang=${encodeURIComponent(lang)}`, "GET");
  tarotCardsDeck = result.deck || [];
  tarotCardsSpreads = result.spreads || [];
  renderTarotCardsDeck();
  await startTarotAutoDraw();
}

function wireTarotCardsForm() {
  const form = element("tarot-cards-form");
  const deck = element("tarot-card-deck");
  const spreadRow = element("tarot-spread-row");
  if (!form || !deck) {
    return;
  }
  const shakeLockedTableCard = (target) => {
    const card = target?.closest(".tarot-card");
    if (!card) {
      return;
    }
    if (prefersReducedMotion()) {
      return;
    }
    const inner = card.querySelector(".tarot-card-inner") || card;
    inner.classList.remove("is-locked-shake");
    void inner.offsetWidth;
    inner.classList.add("is-locked-shake");
    window.setTimeout(() => inner.classList.remove("is-locked-shake"), 520);
  };
  spreadRow?.addEventListener("pointerdown", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    shakeLockedTableCard(target);
  });
  spreadRow?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    const target = event.target instanceof HTMLElement ? event.target : null;
    shakeLockedTableCard(target);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const spread = selectedTarotSpread();
    if (selectedTarotCardIds.length !== TAROT_REQUIRED_CARDS || !tarotDrawToken) {
      setResult("tarot-cards-form-result", i18n.tarotCardsNeedExact);
      return;
    }
    setResult("tarot-cards-form-result", "");
    setResult("tarot-cards-result", "");
    deck.classList.add("is-reading");
    await runReportFlow({
      form,
      resultId: "tarot-cards-result",
      loadingLabel: i18n.readingTarotCards,
      requiredCost: serviceCostFromDataset("costTarotCards"),
      request: () => apiRequest("/api/tarot-cards/reading", "POST", {
        question: element("tarot-cards-question")?.value.trim() || "",
        spread: spread.id,
        selected_card_ids: selectedTarotCardIds,
        draw_token: tarotDrawToken,
        language: lang,
      }, { redirectOnUnauthorized: true }),
      onSuccess: (result) => {
        setResult("tarot-cards-form-result", "");
        renderTarotCardsResult(result);
        element("tarot-cards-result")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
        setBalance(result.balance);
      },
      onError: (error) => {
        setResult("tarot-cards-form-result", error.message);
        setResult("tarot-cards-result", "");
      },
    });
    deck.classList.remove("is-reading");
  });
}

function wireAstrologyForm() {
  const form = element("astrology-form");
  if (!form) {
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runReportFlow({
      form,
      resultId: "astrology-result",
      loadingLabel: i18n.buildingForecast,
      requiredCost: serviceCostFromDataset("costAstrology"),
      request: () => apiRequest("/api/astrology/forecast", "POST", {
        name: element("astrology-name").value.trim(),
        birth_date: element("astrology-birth-date").value.trim(),
        birth_time: element("astrology-birth-time").value.trim(),
        birth_place: element("astrology-birth-place").value.trim(),
        focus: element("astrology-focus").value.trim(),
        language: lang,
      }, { redirectOnUnauthorized: true }),
      onSuccess: (result, { revealResult }) => {
        revealResult(result.result);
        setBalance(result.balance);
      },
    });
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

function numerologyText(key) {
  const ru = {
    summary: "Ключевые числа",
    consciousness: "Число сознания",
    destiny: "Число судьбы",
    action: "Число действия",
    character: "Число характера",
    energy: "Число энергии",
    matrix: "Психоматрица",
    innate: "Врождённые энергии",
    missing: "Недостающие энергии",
    plus: "Плюс",
    minus: "Минус",
    comment: "Комментарий",
    actionFocus: "Действие",
    guidance: "Наставление",
    positiveActions: "Поступки (+)",
    negativeActions: "Поступки (-)",
    noData: "Нет данных для этого блока",
    repetitions: "повторений",
  };
  const en = {
    summary: "Key numbers",
    consciousness: "Consciousness number",
    destiny: "Destiny number",
    action: "Action number",
    character: "Character number",
    energy: "Energy number",
    matrix: "Psychomatrix",
    innate: "Innate energies",
    missing: "Missing energies",
    plus: "Strengths",
    minus: "Weaknesses",
    comment: "Comment",
    actionFocus: "Action focus",
    guidance: "Guidance",
    positiveActions: "Positive actions",
    negativeActions: "Negative actions",
    noData: "No data for this section",
    repetitions: "repetitions",
  };
  return (lang === "en" ? en : ru)[key] || key;
}

function numerologyIconMarkup(value, className = "numerology-number-icon") {
  const normalized = String(value ?? "").trim();
  const allowed = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9", "11", "22", "33"]);
  if (!allowed.has(normalized)) {
    return `<span class="${className} is-empty" aria-hidden="true">-</span>`;
  }
  return `<img class="${className}" src="/static/img/numerology/${encodeURIComponent(normalized)}.svg" alt="${escapeHtml(normalized)}" loading="lazy" />`;
}

function renderNumerologyNumberTile(id, value, index) {
  return `<article class="numerology-number-tile" style="--reveal-index:${index}">
    ${numerologyIconMarkup(value)}
    <div>
      <span>${escapeHtml(numerologyText(id))}</span>
    </div>
  </article>`;
}

function renderNumerologyInsight(label, value, variant = "") {
  if (!value) {
    return "";
  }
  return `<div class="numerology-insight ${variant}">
    <span>${escapeHtml(label)}</span>
    <div>${renderMarkdownText(value)}</div>
  </div>`;
}

function renderNumerologySectionCard(title, numberValue, body, index) {
  return `<article class="numerology-section-card" style="--section-index:${index}">
    <header>
      ${numerologyIconMarkup(numberValue, "numerology-section-icon")}
      <div>
        <h3>${escapeHtml(title)}</h3>
      </div>
    </header>
    <div class="numerology-section-body">${body || `<p>${escapeHtml(numerologyText("noData"))}</p>`}</div>
  </article>`;
}

function renderNumerologyMeaningSection(titleKey, section, numberValue, index) {
  const body = [
    renderNumerologyInsight(numerologyText("plus"), section?.plus || "", "is-plus"),
    renderNumerologyInsight(numerologyText("minus"), section?.minus || "", "is-minus"),
    renderNumerologyInsight(numerologyText("comment"), section?.comment || "", "is-comment"),
  ].join("");
  return renderNumerologySectionCard(numerologyText(titleKey), numberValue, body, index);
}

function renderNumerologyMatrix(matrix) {
  const order = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return `<section class="numerology-matrix-card numerology-section-card" style="--section-index:5">
    <header>
      <div class="numerology-mini-orb" aria-hidden="true">✦</div>
      <div>
        <h3>${escapeHtml(numerologyText("matrix"))}</h3>
        <span>${lang === "en" ? "1-9 code grid" : "кодовая сетка 1-9"}</span>
      </div>
    </header>
    <div class="numerology-matrix-grid">
      ${order.map((digit, index) => {
        const count = Number(matrix?.[digit] || 0);
        return `<div class="numerology-matrix-cell${count ? "" : " is-empty"}" style="--cell-index:${index}">
          ${numerologyIconMarkup(digit, "numerology-matrix-icon")}
          <span>${count} ${escapeHtml(numerologyText("repetitions"))}</span>
        </div>`;
      }).join("")}
    </div>
  </section>`;
}

function renderNumerologyEnergyList(titleKey, items, variant, sectionIndex) {
  const cards = Array.isArray(items) && items.length
    ? items.map((item, index) => `<article class="numerology-energy-card ${variant}" style="--energy-index:${index}">
        ${numerologyIconMarkup(item.number, "numerology-energy-icon")}
        <div>
          <strong>${escapeHtml(item.title || "")}</strong>
          ${item.description ? `<div>${renderMarkdownText(item.description)}</div>` : ""}
        </div>
      </article>`).join("")
    : `<div class="numerology-energy-empty">${escapeHtml(numerologyText("noData"))}</div>`;
  return `<section class="numerology-energy-section" style="--section-index:${sectionIndex}">
    <h3>${escapeHtml(numerologyText(titleKey))}</h3>
    <div class="numerology-energy-grid">${cards}</div>
  </section>`;
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
  const numberOrder = ["consciousness", "destiny", "action", "character", "energy"];
  const actionBody = [
    renderNumerologyInsight(numerologyText("actionFocus"), actionFocus, "is-comment"),
    renderNumerologyInsight(numerologyText("comment"), actionComment, "is-comment"),
    renderNumerologyInsight(numerologyText("guidance"), actionGuidance, "is-plus"),
    renderNumerologyInsight(numerologyText("positiveActions"), actionPlus, "is-plus"),
    renderNumerologyInsight(numerologyText("negativeActions"), actionMinus, "is-minus"),
  ].join("");
  container.innerHTML = `
    <section class="numerology-report-intro ai-result-enter">
      <div>
        <span>${escapeHtml(numerologyText("summary"))}</span>
        <h3>${escapeHtml(report.full_name || "")}</h3>
        <p>${escapeHtml(report.birth_date || "")}</p>
      </div>
      <img src="/static/img/icons/numerology-neon.svg" alt="" loading="lazy" />
    </section>
    <section class="numerology-summary-grid">
      ${numberOrder.map((key, index) => renderNumerologyNumberTile(key, numbers[key], index)).join("")}
    </section>
    <section class="numerology-sections">
      ${renderNumerologyMeaningSection("consciousness", sections.consciousness || {}, numbers.consciousness, 0)}
      ${renderNumerologyMeaningSection("destiny", sections.destiny || {}, numbers.destiny, 1)}
      ${renderNumerologySectionCard(numerologyText("action"), numbers.action, actionBody, 2)}
      ${renderNumerologySectionCard(numerologyText("character"), numbers.character, renderNumerologyInsight(numerologyText("comment"), sections.character_text || "", "is-comment"), 3)}
      ${renderNumerologySectionCard(numerologyText("energy"), numbers.energy, renderNumerologyInsight(numerologyText("comment"), sections.energy_text || "", "is-comment"), 4)}
      ${renderNumerologyMatrix(matrix)}
      ${renderNumerologyEnergyList("innate", innate, "is-innate", 6)}
      ${renderNumerologyEnergyList("missing", missing, "is-missing", 7)}
    </section>
  `;
  container.hidden = false;
  container.classList.remove("ai-result-enter");
  void container.offsetWidth;
  container.classList.add("ai-result-enter");
}

async function loadNumerologyReport() {
  if (!element("numerology-report-view") || !currentReportId) {
    return;
  }
  showSparkLoading("numerology-report-view", i18n.loading);
  try {
    const result = await apiRequest(`/api/numerology/report/${currentReportId}?lang=${encodeURIComponent(lang)}`, "GET", undefined, { redirectOnUnauthorized: true });
    renderNumerologyReport(result.report || {});
    setResult("numerology-result", "");
  } catch (error) {
    const reportView = element("numerology-report-view");
    if (reportView) {
      reportView.innerHTML = "";
      reportView.hidden = true;
    }
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
  const namesDatesForm = element("compat-names-dates-form");
  wirePersonaPicker("compat-persona1");
  wirePersonaPicker("compat-persona2");

  if (namesDatesForm) {
    const stepTitle = element("compat-step-title");
    const firstStep = element("compat-step-1");
    const secondStep = element("compat-step-2");
    const nextButton = element("compat-next-btn");
    const submitButton = element("compat-submit-btn");
    const firstLabel = namesDatesForm.dataset.stepFirstLabel || (lang === "en" ? "Enter the first person" : "Введите первую личность");
    const secondLabel = namesDatesForm.dataset.stepSecondLabel || (lang === "en" ? "Enter the second person" : "Введите вторую личность");
    let currentStep = 1;

    const renderStep = () => {
      const isSecond = currentStep === 2;
      if (firstStep) {
        firstStep.hidden = isSecond;
      }
      if (secondStep) {
        secondStep.hidden = !isSecond;
      }
      if (nextButton) {
        nextButton.hidden = isSecond;
      }
      if (submitButton) {
        submitButton.hidden = !isSecond;
      }
      if (stepTitle) {
        stepTitle.textContent = isSecond ? secondLabel : firstLabel;
      }
    };

    renderStep();

    if (nextButton) {
      nextButton.addEventListener("click", async () => {
        setResult("compat-result", "");
        try {
          await resolvePersonaForPrefix("compat-persona1", {
            idKey: "persona1_id",
            nameKey: "persona1_name",
            birthDateKey: "persona1_birth_date",
            birthTimeKey: "persona1_birth_time",
            birthPlaceKey: "persona1_birth_place",
            noteKey: "persona1_note",
            skipSave: true,
          });
        } catch (error) {
          setResult("compat-result", error.message);
          return;
        }
        currentStep = 2;
        renderStep();
      });
    }

    namesDatesForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (currentStep !== 2) {
        return;
      }
      let firstPersona;
      let secondPersona;
      try {
        firstPersona = await resolvePersonaForPrefix("compat-persona1", {
          idKey: "persona1_id",
          nameKey: "persona1_name",
          birthDateKey: "persona1_birth_date",
          birthTimeKey: "persona1_birth_time",
          birthPlaceKey: "persona1_birth_place",
          noteKey: "persona1_note",
        });
        secondPersona = await resolvePersonaForPrefix("compat-persona2", {
          idKey: "persona2_id",
          nameKey: "persona2_name",
          birthDateKey: "persona2_birth_date",
          birthTimeKey: "persona2_birth_time",
          birthPlaceKey: "persona2_birth_place",
          noteKey: "persona2_note",
        });
      } catch (error) {
        setResult("compat-result", error.message);
        return;
      }
      const firstResolved = firstPersona.resolvedPersona || {};
      const secondResolved = secondPersona.resolvedPersona || {};
      delete firstPersona.resolvedPersona;
      delete secondPersona.resolvedPersona;
      await runReportFlow({
        form: namesDatesForm,
        resultId: "compat-result",
        loadingLabel: i18n.calculating,
        requiredCost: serviceCostFromDataset("costSovmestimost"),
        request: () => apiRequest("/api/sovmestimost/by-names-dates", "POST", {
          name1: firstPersona.persona1_name || firstResolved.name || "",
          date1: firstPersona.persona1_birth_date || firstResolved.birth_date || "",
          name2: secondPersona.persona2_name || secondResolved.name || "",
          date2: secondPersona.persona2_birth_date || secondResolved.birth_date || "",
          ...firstPersona,
          ...secondPersona,
          language: lang,
        }, { redirectOnUnauthorized: true }),
        onSuccess: (result, { revealResult }) => {
          revealResult(result.result);
          setBalance(result.balance);
        },
      });
    });
  }
}

function wireDashboardCarousel() {
  const carousel = element("dashboard-carousel");
  if (!carousel) {
    return;
  }
  const track = carousel.querySelector(".dashboard-carousel-track");
  const slides = Array.from(carousel.querySelectorAll(".dashboard-slide"));
  const dots = Array.from(carousel.querySelectorAll(".dashboard-carousel-dot"));
  if (!track || !slides.length || !dots.length) {
    return;
  }

  const slideQueryRaw = Number(new URLSearchParams(window.location.search).get("slide"));
  const slideQuery = Number.isFinite(slideQueryRaw) ? Math.trunc(slideQueryRaw) : 0;
  let currentSlide = Math.max(
    0,
    Math.min(slides.length - 1, Number.isFinite(slideQuery) && slideQuery > 0 ? slideQuery : Number(carousel.dataset.slide || 0)),
  );
  let touchStartX = 0;
  let touchStartY = 0;
  let isAnimating = false;
  let wheelLockUntil = 0;
  const transitionMs = prefersReducedMotion() ? 0 : 820;
  const transitionSafetyMs = transitionMs + 80;
  const goServicesButton = element("dashboard-go-services");

  const goToServicesSlide = () => {
    applySlide(Math.min(slides.length - 1, 1));
  };

  const clearTransitionState = (slide) => {
    slide.classList.remove(
      "is-entering",
      "is-leaving",
      "from-bottom",
      "from-top",
      "to-top",
      "to-bottom",
    );
  };

  const canScrollInsideActiveSlide = (deltaY) => {
    const activeSlide = slides[currentSlide];
    if (!activeSlide) {
      return false;
    }
    const maxScroll = activeSlide.scrollHeight - activeSlide.clientHeight;
    if (maxScroll <= 1) {
      return false;
    }
    if (deltaY > 0) {
      return activeSlide.scrollTop < maxScroll - 1;
    }
    return activeSlide.scrollTop > 1;
  };

  const applySlide = (index, options = {}) => {
    const force = Boolean(options.force);
    const next = Math.max(0, Math.min(slides.length - 1, index));
    if (next === currentSlide && !force) {
      return false;
    }
    if (isAnimating && !force) {
      return false;
    }
    const previous = currentSlide;
    isAnimating = !force;
    currentSlide = next;
    carousel.dataset.slide = String(next);
    track.style.transform = `translateY(-${next * 100}%)`;
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === next;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", active ? "false" : "true");
    });
    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === next;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (previous !== next) {
      const previousSlide = slides[previous];
      const nextSlide = slides[next];
      clearTransitionState(previousSlide);
      clearTransitionState(nextSlide);
      if (next > previous) {
        nextSlide.classList.add("is-entering", "from-bottom");
        previousSlide.classList.add("is-leaving", "to-top");
      } else {
        nextSlide.classList.add("is-entering", "from-top");
        previousSlide.classList.add("is-leaving", "to-bottom");
      }
      if (transitionMs === 0) {
        clearTransitionState(previousSlide);
        clearTransitionState(nextSlide);
      } else {
        setTimeout(() => {
          clearTransitionState(previousSlide);
          clearTransitionState(nextSlide);
        }, transitionSafetyMs);
      }
    }

    if (transitionMs === 0 || force) {
      isAnimating = false;
    } else {
      setTimeout(() => {
        isAnimating = false;
      }, transitionMs);
    }
    return true;
  };

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      applySlide(Number(dot.dataset.slideIndex || 0));
    });
  });

  if (goServicesButton) {
    goServicesButton.addEventListener("click", goToServicesSlide);
  }

  carousel.querySelectorAll(".dashboard-go-services-card").forEach((card) => {
    card.addEventListener("click", goToServicesSlide);
  });

  carousel.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch) {
      return;
    }
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }, { passive: true });

  carousel.addEventListener("touchend", (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch) {
      return;
    }
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    if (Math.abs(deltaY) < 48 || Math.abs(deltaY) <= Math.abs(deltaX)) {
      return;
    }
    applySlide(currentSlide + (deltaY < 0 ? 1 : -1));
  }, { passive: true });

  carousel.addEventListener("wheel", (event) => {
    const deltaY = event.deltaY || 0;
    if (!deltaY || Math.abs(deltaY) < 18) {
      return;
    }
    if (Date.now() < wheelLockUntil) {
      event.preventDefault();
      return;
    }
    if (canScrollInsideActiveSlide(deltaY)) {
      return;
    }
    if (deltaY > 0) {
      if (currentSlide < slides.length - 1) {
        event.preventDefault();
        if (applySlide(currentSlide + 1)) {
          wheelLockUntil = Date.now() + Math.max(360, transitionMs - 80);
        }
      }
      return;
    }
    if (currentSlide > 0) {
      event.preventDefault();
      if (applySlide(currentSlide - 1)) {
        wheelLockUntil = Date.now() + Math.max(360, transitionMs - 80);
      }
    }
  }, { passive: false });

  carousel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      applySlide(currentSlide + 1);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      applySlide(currentSlide - 1);
    }
  });

  applySlide(currentSlide, { force: true });
}

function wireLangSwitch() {
  document.querySelectorAll(".lang-switch-item[data-lang]").forEach((node) => {
    node.addEventListener("click", async (event) => {
      event.preventDefault();
      const targetLang = node.dataset.lang === "en" ? "en" : "ru";
      if (targetLang === lang) {
        return;
      }
      try {
        await fetch(resolveApiUrl("/api/profile/language"), {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          credentials: "same-origin",
          body: JSON.stringify({ language: targetLang }),
        });
      } catch (_error) {
        // Cookie may still be set server-side on the next page load.
      }
      window.location.href = stripLangFromUrl(window.location.href);
    });
  });
}

async function boot() {
  initPageEntranceAnimation();
  await initAuthStaticPage();
  toggleHeaderAuthLinks();
  syncAuthRequiredSections(!isLoggedIn());
  wirePaymentForms();
  wirePlusSubscriptionForm();
  wireTopupPage();
  wireAuthPages();
  wireAuthRequiredLinks();
  wireLogoutButton();
  wirePasswordResetForm();
  wireRequestHistory();
  wirePaymentsHistoryActions();
  wireSupportForms();
  wireAdminEvents();
  wireProfilePersonas();
  wireBirthDateMasks();
  wireBirthTimeMasks();
  wireSonnikForm();
  wireNumerologyForm();
  wireTarotForm();
  wireTarotCardsForm();
  wireAstrologyForm();
  wireCompatibilityForms();
  wireLangSwitch();
  wireDashboardCarousel();
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
  await loadTarotCardsDeck().catch(() => {});
  await Promise.all([loadPaymentPackages(), refreshBalance().catch(() => {})]);
  await loadPaymentsHistory();
  await loadRequestHistory();
  await loadHistoryRequestDetail();
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

