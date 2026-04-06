const state = {
  authProvider: "guest",
  telegramInitData: "",
  lastPaymentId: "",
};

function setResult(id, text) {
  const node = document.getElementById(id);
  if (!node) {
    return;
  }
  node.textContent = text || "";
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
    throw new Error(data.error || data.detail || "Ошибка запроса");
  }
  return data;
}

async function refreshBalance() {
  const result = await apiRequest("/api/balance", "GET");
  document.getElementById("balance-view").textContent = String(result.balance);
}

function setAuthBadge(text) {
  const node = document.getElementById("auth-provider");
  if (!node) {
    return;
  }
  node.textContent = text;
}

async function autoVerifyTelegram() {
  if (!window.Telegram || !window.Telegram.WebApp) {
    setAuthBadge("Гость");
    return;
  }
  const tg = window.Telegram.WebApp;
  tg.ready();
  const initData = tg.initData || "";
  if (!initData) {
    setAuthBadge("Гость");
    return;
  }

  try {
    const result = await fetch("/api/auth/telegram/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: initData }),
    }).then((res) => res.json().then((data) => ({ ok: res.ok, data })));
    if (!result.ok) {
      throw new Error(result.data.error || result.data.detail || "Не удалось авторизоваться через Telegram");
    }
    state.telegramInitData = initData;
    state.authProvider = "telegram";
    setAuthBadge(`Telegram: ${result.data.profile.username}`);
    document.getElementById("balance-view").textContent = String(result.data.balance);
  } catch (error) {
    setAuthBadge("Гость");
    setResult("payment-result", error.message);
  }
}

async function loadPaymentPackages() {
  const select = document.getElementById("payment-package");
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

document.getElementById("payment-create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setResult("payment-result", "Создаем платеж...");
  try {
    const packageId = document.getElementById("payment-package").value;
    const result = await apiRequest("/api/payments/yookassa/create", "POST", { package_id: packageId });
    state.lastPaymentId = result.payment_id;
    document.getElementById("payment-id").value = result.payment_id;
    setResult("payment-result", `Платеж создан: ${result.payment_id}`);
    if (result.confirmation_url) {
      window.open(result.confirmation_url, "_blank");
    }
  } catch (error) {
    setResult("payment-result", error.message);
  }
});

document.getElementById("payment-check-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setResult("payment-result", "Проверяем платеж...");
  try {
    const paymentId = document.getElementById("payment-id").value.trim() || state.lastPaymentId;
    if (!paymentId) {
      throw new Error("Укажите payment_id");
    }
    const result = await apiRequest(`/api/payments/yookassa/${paymentId}/check`, "POST");
    const paidStatus = result.credited ? "Зачислено" : `Статус: ${result.status}`;
    setResult("payment-result", `${paidStatus}. Баланс: ${result.balance}`);
    document.getElementById("balance-view").textContent = String(result.balance);
  } catch (error) {
    setResult("payment-result", error.message);
  }
});

document.getElementById("refresh-balance").addEventListener("click", async () => {
  try {
    await refreshBalance();
  } catch (error) {
    setResult("compat-result", error.message);
  }
});

document.getElementById("sonnik-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setResult("sonnik-result", "Выполняется анализ...");
  try {
    const result = await apiRequest("/api/sonnik/interpret", "POST", {
      dream_text: document.getElementById("dream-text").value.trim(),
    });
    setResult("sonnik-result", result.interpretation);
    document.getElementById("balance-view").textContent = String(result.balance);
  } catch (error) {
    setResult("sonnik-result", error.message);
  }
});

document.getElementById("numerology-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setResult("numerology-result", "Генерация отчета...");
  try {
    const result = await apiRequest("/api/numerology/generate", "POST", {
      full_name: document.getElementById("full-name").value.trim(),
      birth_date: document.getElementById("birth-date").value.trim(),
    });
    document.getElementById(
      "numerology-result",
    ).innerHTML = `Отчет готов: <a href="${result.file_url}" target="_blank">${result.file_name}</a>`;
    document.getElementById("balance-view").textContent = String(result.balance);
  } catch (error) {
    setResult("numerology-result", error.message);
  }
});

document.getElementById("compat-names-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setResult("compat-result", "Выполняется расчет...");
  try {
    const result = await apiRequest("/api/sovmestimost/by-names", "POST", {
      name1: document.getElementById("compat-name1").value.trim(),
      name2: document.getElementById("compat-name2").value.trim(),
    });
    setResult("compat-result", result.result);
    document.getElementById("balance-view").textContent = String(result.balance);
  } catch (error) {
    setResult("compat-result", error.message);
  }
});

document.getElementById("compat-names-dates-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setResult("compat-result", "Выполняется расчет...");
  try {
    const result = await apiRequest("/api/sovmestimost/by-names-dates", "POST", {
      name1: document.getElementById("compat-nd-name1").value.trim(),
      date1: document.getElementById("compat-date1").value.trim(),
      name2: document.getElementById("compat-nd-name2").value.trim(),
      date2: document.getElementById("compat-date2").value.trim(),
    });
    setResult("compat-result", result.result);
    document.getElementById("balance-view").textContent = String(result.balance);
  } catch (error) {
    setResult("compat-result", error.message);
  }
});

document.querySelectorAll(".tab-btn").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    if (button.dataset.tab === "names-only") {
      document.getElementById("compat-names-form").classList.add("active");
    } else {
      document.getElementById("compat-names-dates-form").classList.add("active");
    }
  });
});

async function boot() {
  await autoVerifyTelegram();
  await loadPaymentPackages();
  await refreshBalance();
}

boot().catch(() => {});

