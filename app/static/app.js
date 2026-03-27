const state = {
  auth: null,
};

function setResult(id, text) {
  document.getElementById(id).textContent = text || "";
}

function getAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (!state.auth) {
    return headers;
  }
  headers["X-Max-User-Id"] = state.auth.userId;
  headers["X-Max-Username"] = state.auth.username;
  headers["X-Max-Language"] = state.auth.language;
  headers["X-Max-Timestamp"] = state.auth.timestamp;
  headers["X-Max-Nonce"] = state.auth.nonce;
  headers["X-Max-Signature"] = state.auth.signature;
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

document.getElementById("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const timestamp = document.getElementById("max-timestamp").value.trim();
  const userId = document.getElementById("max-user-id").value.trim();
  const signature = document.getElementById("max-signature").value.trim();
  const nonce = document.getElementById("max-nonce").value.trim();
  const username = document.getElementById("max-username").value.trim();
  const language = document.getElementById("max-language").value.trim() || "ru";

  state.auth = { timestamp, userId, signature, nonce, username, language };
  try {
    const result = await apiRequest("/api/auth/max/verify", "POST", {});
    localStorage.setItem("astrolhub.maxVerified", "true");
    localStorage.setItem("astrolhub.lastAuthPlatform", "max");
    localStorage.setItem("astrolhub.lastAuthUser", result.profile.username || "");
    setResult("auth-result", `Пользователь: ${result.profile.username}\nБаланс: ${result.balance}`);
    document.getElementById("balance-view").textContent = String(result.balance);
  } catch (error) {
    localStorage.removeItem("astrolhub.maxVerified");
    setResult("auth-result", error.message);
  }
});

document.getElementById("refresh-balance").addEventListener("click", async () => {
  try {
    await refreshBalance();
  } catch (error) {
    setResult("auth-result", error.message);
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

document.getElementById("max-timestamp").value = String(Math.floor(Date.now() / 1000));

