const state = {
  telegramInitData: sessionStorage.getItem("astrolhub.telegramInitData") || "",
  lastPaymentId: sessionStorage.getItem("astrolhub.lastPaymentId") || "",
};
const devAuthBypass = document.body.dataset.devAuthBypass === "true";
const devAuthMockUsername = document.body.dataset.devAuthMockUsername || "Dev Tester";
const lang = document.body.dataset.lang === "en" ? "en" : "ru";
const PROFILE_CACHE_KEY = "astrolhub.profileCache";
const BALANCE_CACHE_KEY = "astrolhub.balanceCache";
const CACHE_TTL_MS = 30000;
const i18n = lang === "en"
  ? {
    guest: "Guest",
    requestError: "Request failed",
    creatingPayment: "Creating payment...",
    paymentCreated: "Payment created",
    checkingPayment: "Checking payment...",
    enterPaymentId: "Enter payment_id",
    needCreatePaymentFirst: "Create a payment first",
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
  }
  : {
    guest: "Гость",
    requestError: "Ошибка запроса",
    creatingPayment: "Создаем платеж...",
    paymentCreated: "Платеж создан",
    checkingPayment: "Проверяем платеж...",
    enterPaymentId: "Укажите payment_id",
    needCreatePaymentFirst: "Сначала создайте платеж",
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

function hydrateUiFromCache() {
  const profile = readTimedCache(PROFILE_CACHE_KEY);
  if (profile?.provider === "max") {
    setAuthBadge(`${i18n.maxPrefix}: ${profile.username}`);
    setAuthUsername(profile.username);
  } else if (profile?.provider === "telegram") {
    setAuthBadge(`${i18n.tgPrefix}: ${profile.username}`);
    setAuthUsername(profile.username);
  } else {
    setAuthUsername(i18n.guest);
  }
  const balance = readTimedCache(BALANCE_CACHE_KEY);
  if (typeof balance === "number") {
    setBalance(balance);
  }
}

function getAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (state.telegramInitData) {
    headers["X-Telegram-Init-Data"] = state.telegramInitData;
  }
  return headers;
}

async function apiRequest(url, method, bodyObj) {
  const response = await fetch(url, {
    method,
    headers: getAuthHeaders(),
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.detail || i18n.requestError);
  }
  return data;
}

async function autoVerifyTelegram() {
  if (devAuthBypass) {
    setAuthBadge(`${i18n.devBypassPrefix}: ${devAuthMockUsername}`);
    setAuthUsername(devAuthMockUsername);
    return;
  }
  if (state.telegramInitData) {
    return;
  }
  if (!window.Telegram || !window.Telegram.WebApp) {
    return;
  }
  const tg = window.Telegram.WebApp;
  tg.ready();
  const initData = tg.initData || "";
  if (!initData) {
    return;
  }
  state.telegramInitData = initData;
  sessionStorage.setItem("astrolhub.telegramInitData", initData);
}

async function loadProfile() {
  try {
    const profile = await apiRequest("/api/profile", "GET");
    saveTimedCache(PROFILE_CACHE_KEY, profile);
    if (profile.provider === "max") {
      setAuthBadge(`${i18n.maxPrefix}: ${profile.username}`);
      setAuthUsername(profile.username);
      return;
    }
    if (profile.provider === "telegram") {
      setAuthBadge(`${i18n.tgPrefix}: ${profile.username}`);
      setAuthUsername(profile.username);
      return;
    }
    setAuthBadge(i18n.guest);
    setAuthUsername(i18n.guest);
  } catch {
    setAuthBadge(i18n.guest);
    setAuthUsername(i18n.guest);
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
        const result = await apiRequest("/api/payments/yookassa/create", "POST", { package_id: packageId });
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

  const checkForm = element("payment-check-form");
  if (checkForm) {
    checkForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setResult("payment-result", i18n.checkingPayment);
      try {
        const paymentIdValue = state.lastPaymentId || sessionStorage.getItem("astrolhub.lastPaymentId") || "";
        if (!paymentIdValue) {
          throw new Error(i18n.needCreatePaymentFirst);
        }
        const result = await apiRequest(`/api/payments/yookassa/${paymentIdValue}/check`, "POST");
        const paidStatus = result.credited ? i18n.credited : `${i18n.status}: ${result.status}`;
        setResult("payment-result", `${paidStatus}. ${i18n.balance}: ${result.balance}`);
        setBalance(result.balance);
      } catch (error) {
        setResult("payment-result", error.message);
      }
    });
  }
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
        resultNode.innerHTML = `${i18n.reportReady}: <a href="${result.file_url}" target="_blank">${result.file_name}</a>`;
      }
      setBalance(result.balance);
    } catch (error) {
      setResult("numerology-result", error.message);
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
  wireSonnikForm();
  wireNumerologyForm();
  wireCompatibilityForms();
  hydrateUiFromCache();
  await autoVerifyTelegram();
  await Promise.all([loadProfile(), loadPaymentPackages(), refreshBalance().catch(() => {})]);
}

boot().catch(() => {});

