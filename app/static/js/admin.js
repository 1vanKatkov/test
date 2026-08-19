/**
 * Astrolhub client — admin.js
 * Admin dashboard
 * Split from monolithic app.js for maintainability.
 * Load order: core → cabinet → services → tarot-cards → admin → ui → main.
 */

function adminFormatNumber(value) {
  return Number(value || 0).toLocaleString(lang === "en" ? "en-US" : "ru-RU");
}

function adminText(key) {
  const ru = {
    usersTotal: "Всего пользователей",
    newUsers: "Новые пользователи",
    activeUsers: "Активные пользователи",
    uniqueVisitorsTotal: "Уникальные посетители",
    uniqueVisitorsPeriod: "Уникальные заходы за период",
    requests: "Запросы",
    successfulPayments: "Успешные платежи",
    revenue: "Выручка",
    sparksCharged: "Списано искр",
    sparksAdded: "Начислено искр",
    openTickets: "Открытые обращения",
    newUsersByDay: "Новые пользователи по дням",
    uniqueVisitsByDay: "Уникальные заходы по дням",
    requestsByDay: "Запросы по дням",
    revenueByDay: "Выручка по дням",
    supportTicketsByDay: "Обращения в поддержку по дням",
    dateAxis: "Дата",
    usersAxis: "Пользователи",
    visitsAxis: "Заходы",
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
    uniqueVisitorsTotal: "Unique visitors",
    uniqueVisitorsPeriod: "Unique visits in period",
    requests: "Requests",
    successfulPayments: "Successful payments",
    revenue: "Revenue",
    sparksCharged: "Sparks charged",
    sparksAdded: "Sparks added",
    openTickets: "Open tickets",
    newUsersByDay: "New users by day",
    uniqueVisitsByDay: "Unique visits by day",
    requestsByDay: "Requests by day",
    revenueByDay: "Revenue by day",
    supportTicketsByDay: "Support tickets by day",
    dateAxis: "Date",
    usersAxis: "Users",
    visitsAxis: "Visits",
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
    [adminText("uniqueVisitorsTotal"), overview.unique_visitors_total],
    [adminText("uniqueVisitorsPeriod"), overview.unique_visitors_period],
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
  renderAdminLineChart("admin-daily-charts", adminText("uniqueVisitsByDay"), days, "unique_visits", adminText("visitsAxis"));
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

