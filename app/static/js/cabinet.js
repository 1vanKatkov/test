/**
 * Astrolhub client — cabinet.js
 * Payments, topup, history, support, lunar
 * Split from monolithic app.js for maintainability.
 * Load order: core → cabinet → services → tarot-cards → admin → ui → main.
 */

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

