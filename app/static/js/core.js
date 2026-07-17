/**
 * Astrolhub client — core.js
 * Shared state, i18n, API, auth, sparks modal
 * Split from monolithic app.js for maintainability.
 * Load order: core → cabinet → services → tarot-cards → admin → ui → main.
 */

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
    invalidVerificationCode: "Enter the 6-digit code from email",
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
    tarotCardsNeedExact: "Choose a topic and complete the required fields.",
    tarotCardsDrawing: "Selecting cards for your situation...",
    tarotCardsDrawn: "Your cards are ready.",
    tarotCardsDrawFailed: "Could not draw cards. Try again.",
    tarotQuestionRequired: "Please enter your question.",
    tarotSubtopicRequired: "Choose what interests you.",
    tarotBackToReading: "Back to reading",
    tarotSaved: "Spread saved",
    insufficientSparksTitle: "Not enough sparks",
    insufficientSparksText: "This reading costs {cost} ✦. Your balance is {balance} ✦.",
    insufficientSparksHint: "Top up your balance to continue.",
    insufficientSparksAction: "Top up balance",
    insufficientSparksClose: "Close",
    tarotConfirmReady: "Ready for your reading",
    tarotConfirmHint: "Press the button below to draw the cards.",
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
    invalidVerificationCode: "Введите 6-значный код из письма",
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
    tarotCardsNeedExact: "Выберите тему и заполните нужные поля.",
    tarotCardsDrawing: "Подбираем карты для вашей ситуации…",
    tarotCardsDrawn: "Карты готовы.",
    tarotCardsDrawFailed: "Не удалось вытянуть карты. Попробуйте ещё раз.",
    tarotQuestionRequired: "Введите свой вопрос.",
    tarotSubtopicRequired: "Выберите, что вас интересует.",
    tarotBackToReading: "К разбору",
    tarotSaved: "Расклад сохранён",
    insufficientSparksTitle: "Недостаточно искр",
    insufficientSparksText: "Этот разбор стоит {cost} ✦. На балансе {balance} ✦.",
    insufficientSparksHint: "Пополните баланс, чтобы продолжить.",
    insufficientSparksAction: "Пополнить баланс",
    insufficientSparksClose: "Закрыть",
    tarotConfirmReady: "Готово к разбору",
    tarotConfirmHint: "Нажмите кнопку ниже, чтобы вытянуть карты.",
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
    orDivider: "or",
    loginWithTelegram: "Log in with Telegram",
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
    orDivider: "или",
    loginWithTelegram: "Войти через Telegram",
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
    const submitBtn = element("register-submit-btn");
    if (submitBtn) {
      const skip = document.body.dataset.emailSkipVerification === "true";
      submitBtn.textContent = skip ? copy.registerSubmit : copy.registerSubmitCode;
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
  return (
    text.includes("insufficient credits")
    || text.includes("недостаточно")
    || text.includes("spark")
    || text.includes("искр")
  );
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

function formatInsufficientSparksText(requiredCost) {
  const cost = Number(requiredCost) || 0;
  const balance = readCachedBalance();
  const balanceLabel = balance === null ? "—" : String(balance);
  return String(i18n.insufficientSparksText || "")
    .replace("{cost}", String(cost))
    .replace("{balance}", balanceLabel);
}

function ensureInsufficientSparksModal() {
  let modal = element("insufficient-sparks-modal");
  if (modal) {
    return modal;
  }
  modal = document.createElement("div");
  modal.id = "insufficient-sparks-modal";
  modal.className = "modal-overlay insufficient-sparks-overlay";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-card insufficient-sparks-modal" role="dialog" aria-modal="true" aria-labelledby="insufficient-sparks-title">
      <div class="insufficient-sparks-glow" aria-hidden="true"></div>
      <div class="insufficient-sparks-icon" aria-hidden="true">✦</div>
      <h2 id="insufficient-sparks-title">${escapeHtml(i18n.insufficientSparksTitle)}</h2>
      <p id="insufficient-sparks-text" class="insufficient-sparks-text"></p>
      <p class="insufficient-sparks-hint muted">${escapeHtml(i18n.insufficientSparksHint)}</p>
      <div class="insufficient-sparks-actions">
        <button type="button" id="insufficient-sparks-topup" class="primary-btn">${escapeHtml(i18n.insufficientSparksAction)}</button>
        <button type="button" id="insufficient-sparks-close" class="secondary-btn" data-insufficient-close>${escapeHtml(i18n.insufficientSparksClose)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-insufficient-close]")) {
      closeInsufficientSparksModal();
    }
  });
  element("insufficient-sparks-topup")?.addEventListener("click", async () => {
    const cost = Number(modal.dataset.requiredCost || 0);
    const btn = element("insufficient-sparks-topup");
    if (btn) {
      btn.disabled = true;
    }
    try {
      await redirectToTopupForRequiredCost(cost);
    } finally {
      if (btn) {
        btn.disabled = false;
      }
    }
  });
  if (!window.__insufficientSparksEscapeWired) {
    window.__insufficientSparksEscapeWired = true;
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const openModal = element("insufficient-sparks-modal");
        if (openModal && !openModal.hidden) {
          closeInsufficientSparksModal();
        }
      }
    });
  }
  return modal;
}

function closeInsufficientSparksModal() {
  const modal = element("insufficient-sparks-modal");
  if (!modal) {
    return;
  }
  modal.hidden = true;
  modal.classList.remove("is-open");
  document.body.classList.remove("insufficient-sparks-modal-open");
}

async function showInsufficientSparksModal(requiredCost) {
  const modal = ensureInsufficientSparksModal();
  const cost = Number(requiredCost) || 0;
  modal.dataset.requiredCost = String(cost);
  const text = element("insufficient-sparks-text");
  if (text) {
    text.textContent = formatInsufficientSparksText(cost);
  }
  modal.hidden = false;
  modal.classList.add("is-open");
  document.body.classList.add("insufficient-sparks-modal-open");
  element("insufficient-sparks-topup")?.focus();
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
      await showInsufficientSparksModal(cost);
      return null;
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
      await showInsufficientSparksModal(cost);
      return null;
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
    plusResult.hidden = false;
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
  if (isVisible) {
    setPasswordResetStep("start");
  }
}

function setPasswordResetStep(step) {
  const start = element("password-reset-step-start");
  const code = element("password-reset-step-code");
  const password = element("password-reset-step-password");
  if (start) {
    start.hidden = step !== "start";
  }
  if (code) {
    code.hidden = step !== "code";
  }
  if (password) {
    password.hidden = step !== "password";
  }
}

function resetPasswordResetFormFields() {
  const codeInput = element("password-reset-code");
  const newPassword = element("password-reset-new");
  const confirmPassword = element("password-reset-confirm");
  if (codeInput) {
    codeInput.value = "";
  }
  if (newPassword) {
    newPassword.value = "";
  }
  if (confirmPassword) {
    confirmPassword.value = "";
  }
  setResult("password-reset-result", "");
}

async function requestPasswordResetCode() {
  setResult("password-reset-result", i18n.loading);
  await apiRequest("/api/auth/email/password-reset/request", "POST", undefined, { redirectOnUnauthorized: true });
  setResult("password-reset-result", i18n.codeSent);
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
  const panel = element("email-password-reset-panel");
  if (!panel) {
    return;
  }

  const startBtn = element("password-reset-start-btn");
  const requestBtn = element("password-reset-request-btn");
  const nextBtn = element("password-reset-code-next-btn");
  const form = element("email-password-reset-form");

  if (startBtn) {
    startBtn.addEventListener("click", async () => {
      setPasswordResetStep("code");
      resetPasswordResetFormFields();
      try {
        await requestPasswordResetCode();
      } catch (error) {
        setResult("password-reset-result", error.message);
      }
    });
  }

  if (requestBtn) {
    requestBtn.addEventListener("click", async () => {
      try {
        await requestPasswordResetCode();
      } catch (error) {
        setResult("password-reset-result", error.message);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const code = (element("password-reset-code")?.value || "").trim();
      if (!/^\d{6}$/.test(code)) {
        setResult("password-reset-result", i18n.invalidVerificationCode);
        return;
      }
      setResult("password-reset-result", "");
      setPasswordResetStep("password");
    });
  }

  panel.querySelectorAll("[data-password-reset-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      resetPasswordResetFormFields();
      setPasswordResetStep("start");
    });
  });

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setResult("password-reset-result", i18n.loading);
      try {
        const code = (element("password-reset-code")?.value || "").trim();
        const newPassword = element("password-reset-new")?.value || "";
        const passwordConfirm = element("password-reset-confirm")?.value || "";
        if (!/^\d{6}$/.test(code)) {
          throw new Error(i18n.invalidVerificationCode);
        }
        if (newPassword !== passwordConfirm) {
          throw new Error(i18n.passwordsMismatch);
        }
        await apiRequest(
          "/api/auth/email/password-reset/confirm",
          "POST",
          {
            code,
            new_password: newPassword,
            password_confirm: passwordConfirm,
          },
          { redirectOnUnauthorized: true },
        );
        resetPasswordResetFormFields();
        setPasswordResetStep("start");
        setResult("password-reset-result", i18n.passwordResetSuccess);
      } catch (error) {
        setResult("password-reset-result", error.message);
      }
    });
  }
}

