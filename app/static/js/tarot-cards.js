/**
 * Astrolhub client — tarot-cards.js
 * Rider-Waite tarot cards flow, modal, draw/reading
 * Split from monolithic app.js for maintainability.
 * Load order: core → cabinet → services → tarot-cards → admin → ui → main.
 */

let tarotCardsDeck = [];
let tarotCardsTopics = [];
let selectedTarotTopic = null;
let selectedTarotSubtopic = "";
let selectedTarotCardIds = [];
let drawnTarotCards = [];
let tarotDrawToken = "";
let tarotLastReportUrl = "";
let tarotResultView = { cards: [], interpretation: "", sections: [], outro: "" };

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function tarotFlowStep(stepId) {
  return element(`tarot-step-${stepId}`);
}

let tarotPageDefaultTitle = "";

function syncTarotFlowChrome(stepId) {
  const backBtn = element("tarot-back-topics");
  const titleEl = element("tarot-page-title");
  if (titleEl && !tarotPageDefaultTitle) {
    tarotPageDefaultTitle = titleEl.textContent.trim();
  }
  // Back arrow only on the details step — never during shuffle/result spreads.
  if (backBtn) {
    backBtn.hidden = stepId !== "details";
  }
  if (titleEl) {
    if (selectedTarotTopic && stepId !== "topics") {
      titleEl.textContent = selectedTarotTopic.title;
    } else {
      titleEl.textContent = tarotPageDefaultTitle || titleEl.textContent;
    }
  }
}

function showTarotStep(stepId) {
  ["topics", "details", "shuffle", "result"].forEach((id) => {
    const step = tarotFlowStep(id);
    if (!step) {
      return;
    }
    const active = id === stepId;
    step.hidden = !active;
    step.classList.toggle("is-active", active);
  });
  syncTarotFlowChrome(stepId);
}

function tarotCardImageUrl(card) {
  if (card?.image_url) {
    return card.image_url;
  }
  if (card?.id) {
    return `/static/img/tarot/cards/${card.id}.webp`;
  }
  return "";
}

function renderTarotCardButton(card, isSelected = false, index = 0, extraClass = "", options = {}) {
  const name = escapeHtml(card.name);
  const symbol = escapeHtml(card.symbol || "✦");
  const imageUrl = escapeHtml(tarotCardImageUrl(card));
  const arcana = card.arcana === "major" ? (lang === "en" ? "Major Arcana" : "Старший аркан") : (lang === "en" ? "Minor Arcana" : "Младший аркан");
  const tag = options.asButton === false ? "div" : "button";
  const interactiveAttrs = options.asButton === false
    ? `role="img" aria-hidden="true"`
    : `type="button" aria-pressed="${isSelected ? "true" : "false"}" aria-label="${name}"`;
  return `<${tag}
    class="tarot-card ${extraClass} ${isSelected ? "is-flipped is-selected" : ""}"
    data-card-id="${escapeHtml(card.id || "")}"
    style="--card-index:${index}"
    ${interactiveAttrs}
  >
    <span class="tarot-card-inner">
      <span class="tarot-card-face tarot-card-back">
        <span class="tarot-card-back-symbol">✦</span>
      </span>
      <span class="tarot-card-face tarot-card-front ${imageUrl ? "has-art" : ""}">
        ${imageUrl ? `<img class="tarot-card-art" src="${imageUrl}" alt="" width="512" height="768" loading="lazy" decoding="async" onerror="if(this.dataset.fb!=='1'){this.dataset.fb='1';this.src=this.src.replace(/\\.webp(\\?.*)?\$/,'.jpg\$1');}else{this.closest('.tarot-card-front')?.classList.remove('has-art');this.remove();}" />` : ""}
        <span class="tarot-card-fallback">
          <span class="tarot-card-corner">${symbol}</span>
          <span class="tarot-card-symbol">${symbol}</span>
          <span class="tarot-card-name">${name}</span>
          <span class="tarot-card-arcana">${escapeHtml(arcana)}</span>
        </span>
      </span>
    </span>
  </${tag}>`;
}

function parseTarotInterpretationSections(interpretation, cardCount) {
  const source = String(interpretation || "").trim();
  const sections = Array.from({ length: cardCount }, () => "");
  let outro = "";
  if (!source || !cardCount) {
    return { sections, outro };
  }

  const cardHeaderRe = /^###\s+(?:Карта|Card)\s+(\d+)\b[^\n]*/gim;
  const matches = [...source.matchAll(cardHeaderRe)];
  if (!matches.length) {
    sections[0] = source;
    return { sections, outro };
  }

  const intro = source.slice(0, matches[0].index).trim();
  matches.forEach((match, matchIndex) => {
    const cardNumber = Number(match[1]);
    const start = match.index + match[0].length;
    const end = matchIndex + 1 < matches.length ? matches[matchIndex + 1].index : source.length;
    let body = source.slice(start, end).trim();
    const parts = body.split(/^##\s+/m);
    if (parts.length > 1) {
      body = parts[0].trim();
      if (!outro) {
        outro = `## ${parts.slice(1).join("## ")}`.trim();
      }
    }
    const targetIndex = Number.isFinite(cardNumber) && cardNumber >= 1 ? cardNumber - 1 : matchIndex;
    if (targetIndex >= 0 && targetIndex < cardCount) {
      sections[targetIndex] = body;
    }
  });
  if (intro) {
    outro = outro ? `${intro}\n\n${outro}` : intro;
  }

  return { sections, outro };
}

function ensureTarotCardModal() {
  let modal = element("tarot-card-modal");
  if (modal) {
    return modal;
  }
  modal = document.createElement("div");
  modal.id = "tarot-card-modal";
  modal.className = "tarot-card-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="tarot-card-modal-backdrop" data-tarot-modal-close></div>
    <div class="tarot-card-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="tarot-card-modal-title">
      <div class="tarot-card-modal-toolbar">
        <button
          type="button"
          id="tarot-card-modal-back"
          class="page-back-arrow"
          aria-label="${escapeHtml(i18n.tarotBackToReading)}"
          title="${escapeHtml(i18n.tarotBackToReading)}"
        ></button>
      </div>
      <div id="tarot-card-modal-visual" class="tarot-card-modal-visual"></div>
      <h3 id="tarot-card-modal-title" class="tarot-card-modal-title"></h3>
      <p id="tarot-card-modal-position" class="tarot-card-modal-position muted" hidden></p>
      <div id="tarot-card-modal-text" class="tarot-card-modal-text rich-result"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-tarot-modal-close]")) {
      closeTarotCardModal();
    }
  });
  element("tarot-card-modal-back")?.addEventListener("click", () => closeTarotCardModal());
  if (!window.__tarotCardModalEscapeWired) {
    window.__tarotCardModalEscapeWired = true;
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const openModal = element("tarot-card-modal");
        if (openModal && !openModal.hidden) {
          closeTarotCardModal();
        }
      }
    });
  }
  return modal;
}

function closeTarotCardModal() {
  const modal = element("tarot-card-modal");
  if (!modal) {
    return;
  }
  modal.hidden = true;
  document.body.classList.remove("tarot-card-modal-open");
}

function openTarotCardModal(index) {
  const card = tarotResultView.cards[index];
  if (!card) {
    return;
  }
  const modal = ensureTarotCardModal();
  const visual = element("tarot-card-modal-visual");
  const title = element("tarot-card-modal-title");
  const position = element("tarot-card-modal-position");
  const text = element("tarot-card-modal-text");
  if (visual) {
    visual.innerHTML = renderTarotCardButton(card, true, index, "tarot-card-modal-face", { asButton: false });
  }
  if (title) {
    title.textContent = card.name || "";
  }
  if (position) {
    const label = card.position || "";
    position.textContent = label;
    position.hidden = !label;
  }
  // AI interpretation stays under the spread; modal only enlarges the card.
  if (text) {
    text.innerHTML = "";
    text.hidden = true;
  }
  modal.hidden = false;
  document.body.classList.add("tarot-card-modal-open");
  element("tarot-card-modal-back")?.focus();
}

function renderTarotCardsResult(result) {
  const container = element("tarot-cards-result");
  if (!container) {
    return;
  }
  const cards = result.cards || [];
  const interpretation = result.interpretation || "";
  const parsed = parseTarotInterpretationSections(interpretation, cards.length);
  tarotResultView = {
    cards,
    interpretation,
    sections: parsed.sections,
    outro: parsed.outro,
  };
  ensureTarotCardModal();
  const interpretationHtml = interpretation
    ? `<div class="tarot-interpretation rich-result">${renderMarkdownText(interpretation)}</div>`
    : "";
  container.innerHTML = `<div class="tarot-result-cards" role="list">
    ${cards.map((card, index) => `<button
      type="button"
      class="tarot-result-card"
      style="--reveal-index:${index}"
      data-result-card-index="${index}"
      role="listitem"
      aria-label="${escapeHtml(card.name || "")}"
    >
      ${renderTarotCardButton(card, true, index, "tarot-result-card-face", { asButton: false })}
      <span class="tarot-result-card-name">${escapeHtml(card.name || "")}</span>
    </button>`).join("")}
  </div>
  ${interpretationHtml}`;
  if (!container.dataset.tarotResultWired) {
    container.dataset.tarotResultWired = "1";
    container.addEventListener("click", (event) => {
      const cardBtn = event.target.closest("[data-result-card-index]");
      if (!cardBtn || !container.contains(cardBtn)) {
        return;
      }
      openTarotCardModal(Number(cardBtn.dataset.resultCardIndex));
    });
  }
  container.hidden = false;
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

function setTarotDrawStatus(message) {
  const status = element("tarot-draw-status");
  if (status) {
    status.textContent = message;
  }
}

function renderTarotTopicGrid() {
  const grid = element("tarot-topic-grid");
  if (!grid) {
    return;
  }
  grid.innerHTML = tarotCardsTopics.map((topic) => `
    <button type="button" class="tarot-topic-card" data-topic-id="${escapeHtml(topic.id)}" role="listitem">
      <span class="tarot-topic-icon" aria-hidden="true">
        <img class="tarot-topic-icon-img" src="${escapeHtml(topic.icon || "")}" alt="" width="44" height="44" loading="lazy" decoding="async" />
      </span>
      <strong>${escapeHtml(topic.title)}</strong>
      <small>${topic.size} ${lang === "en" ? "cards" : "карт"}</small>
    </button>
  `).join("");
}

function renderTarotSubtopics(topic) {
  const grid = element("tarot-subtopic-grid");
  if (!grid) {
    return;
  }
  const items = topic.subtopics || [];
  grid.innerHTML = items.map((item) => `
    <button type="button" class="tarot-subtopic-chip ${selectedTarotSubtopic === item.id ? "is-active" : ""}" data-subtopic-id="${escapeHtml(item.id)}">
      ${escapeHtml(item.title)}
    </button>
  `).join("");
}

function renderTarotQuestionExamples(topic) {
  const box = element("tarot-question-examples");
  if (!box) {
    return;
  }
  const examples = topic.question_examples || [];
  if (!examples.length) {
    box.innerHTML = "";
    return;
  }
  const label = lang === "en" ? "Examples" : "Примеры";
  box.innerHTML = `<p class="muted">${escapeHtml(label)}</p>
    <div class="tarot-example-list">
      ${examples.map((example) => `<button type="button" class="tarot-example-chip">${escapeHtml(example)}</button>`).join("")}
    </div>`;
}

function tarotTopicNeedsInput(topic) {
  if (!topic) {
    return false;
  }
  return Boolean(
    topic.needs_question
    || topic.needs_partner_name
    || (topic.subtopics || []).length
  );
}

function openTarotTopic(topicId) {
  selectedTarotTopic = tarotCardsTopics.find((topic) => topic.id === topicId) || null;
  selectedTarotSubtopic = "";
  tarotDrawToken = "";
  selectedTarotCardIds = [];
  drawnTarotCards = [];
  if (!selectedTarotTopic) {
    return;
  }
  const needsInput = tarotTopicNeedsInput(selectedTarotTopic);
  const partnerPanel = element("tarot-partner-panel");
  const subtopicPanel = element("tarot-subtopic-panel");
  const questionPanel = element("tarot-question-panel");
  const confirmPanel = element("tarot-confirm-panel");
  if (partnerPanel) {
    partnerPanel.hidden = !selectedTarotTopic.needs_partner_name;
  }
  if (subtopicPanel) {
    const hasSubtopics = (selectedTarotTopic.subtopics || []).length > 0;
    subtopicPanel.hidden = !hasSubtopics;
    if (hasSubtopics) {
      renderTarotSubtopics(selectedTarotTopic);
    }
  }
  if (questionPanel) {
    questionPanel.hidden = !selectedTarotTopic.needs_question;
    if (selectedTarotTopic.needs_question) {
      renderTarotQuestionExamples(selectedTarotTopic);
    }
  }
  if (confirmPanel) {
    confirmPanel.hidden = needsInput;
    if (!needsInput) {
      const icon = element("tarot-confirm-icon-img");
      const title = element("tarot-confirm-title");
      const meta = element("tarot-confirm-meta");
      if (icon) {
        icon.src = selectedTarotTopic.icon || "";
        icon.hidden = !selectedTarotTopic.icon;
      }
      if (title) {
        title.textContent = selectedTarotTopic.title || "";
      }
      if (meta) {
        const cardsLabel = lang === "en" ? "cards" : "карт";
        meta.textContent = `${selectedTarotTopic.size} ${cardsLabel}`;
      }
    }
  }
  setResult("tarot-cards-form-result", "");
  showTarotStep("details");
}

function prepareTarotSpreadSlots(size) {
  const row = element("tarot-spread-row");
  if (!row) {
    return;
  }
  row.innerHTML = Array.from({ length: size }, (_item, index) => (
    `<div class="tarot-spread-slot" data-slot="${index}" role="listitem"></div>`
  )).join("");
}

async function placeTarotCardOnTable(card, index) {
  const slot = document.querySelector(`.tarot-spread-slot[data-slot="${index}"]`);
  const deck = element("tarot-card-deck");
  if (!slot) {
    return;
  }
  slot.innerHTML = renderTarotCardButton(card, false, index, "is-dealing-from-deck");
  slot.classList.add("is-filled");
  const cardNode = slot.querySelector(".tarot-card");
  if (!cardNode) {
    return;
  }
  if (prefersReducedMotion()) {
    cardNode.classList.add("is-flipped", "is-selected", "is-arrived");
    return;
  }

  const deckRect = deck?.getBoundingClientRect();
  const slotRect = slot.getBoundingClientRect();
  const cardRect = cardNode.getBoundingClientRect();
  if (deckRect && cardRect.width) {
    const fromX = deckRect.left + deckRect.width / 2 - (cardRect.left + cardRect.width / 2);
    const fromY = deckRect.top + deckRect.height / 2 - (cardRect.top + cardRect.height / 2);
    cardNode.style.setProperty("--deal-from-x", `${fromX}px`);
    cardNode.style.setProperty("--deal-from-y", `${fromY}px`);
  } else {
    cardNode.style.setProperty("--deal-from-x", "0px");
    cardNode.style.setProperty("--deal-from-y", "-120px");
  }

  // Force reflow so the starting transform is applied before animation.
  void cardNode.offsetWidth;
  cardNode.classList.add("is-flying");
  await wait(520);
  cardNode.classList.add("is-arrived");
  cardNode.classList.remove("is-flying", "is-dealing-from-deck");
  await wait(160);
  cardNode.classList.add("is-flipped", "is-selected");
  await wait(280);
}

async function requestTarotDraw(topicId) {
  const result = await apiRequest("/api/tarot-cards/draw", "POST", {
    topic: topicId,
    language: lang,
  });
  const cards = result.cards || [];
  const expected = Number(selectedTarotTopic?.size || cards.length);
  if (!cards.length || cards.length !== expected) {
    throw new Error(i18n.tarotCardsDrawFailed);
  }
  drawnTarotCards = cards;
  selectedTarotCardIds = cards.map((card) => card.id);
  tarotDrawToken = result.draw_token || "";
  if (!tarotDrawToken) {
    throw new Error(i18n.tarotCardsDrawFailed);
  }
}

async function startTarotReadingFlow() {
  if (!isLoggedIn() && !canUseGuestFreeReading()) {
    window.location.href = loginRedirectUrl();
    return;
  }
  if (!selectedTarotTopic) {
    setResult("tarot-cards-form-result", i18n.tarotCardsNeedExact);
    return;
  }
  if (selectedTarotTopic.needs_question) {
    const question = element("tarot-cards-question")?.value.trim() || "";
    if (!question) {
      setResult("tarot-cards-form-result", i18n.tarotQuestionRequired);
      showTarotStep("details");
      return;
    }
  }
  if ((selectedTarotTopic.subtopics || []).length && !selectedTarotSubtopic) {
    setResult("tarot-cards-form-result", i18n.tarotSubtopicRequired);
    showTarotStep("details");
    return;
  }

  const requiredCost = canUseGuestFreeReading() ? 0 : serviceCostFromDataset("costTarotCards");
  const balance = readCachedBalance();
  if (Number.isFinite(requiredCost) && requiredCost > 0 && balance !== null && balance < requiredCost) {
    showTarotStep("details");
    await showInsufficientSparksModal(requiredCost);
    return;
  }

  setResult("tarot-cards-form-result", "");
  showTarotStep("shuffle");
  renderTarotCardsDeck();
  prepareTarotSpreadSlots(selectedTarotTopic.size);
  setTarotDrawStatus(i18n.tarotCardsDrawing);
  const deck = element("tarot-card-deck");
  deck?.classList.add("is-shuffling", "is-dealing");

  const shuffleStarted = Date.now();
  try {
    await requestTarotDraw(selectedTarotTopic.id);
    const elapsed = Date.now() - shuffleStarted;
    const minShuffleMs = prefersReducedMotion() ? 0 : 3200;
    if (elapsed < minShuffleMs) {
      await wait(minShuffleMs - elapsed);
    }
    for (let index = 0; index < drawnTarotCards.length; index += 1) {
      await placeTarotCardOnTable(drawnTarotCards[index], index);
    }
    deck?.classList.remove("is-shuffling");
    setTarotDrawStatus(i18n.readingTarotCards);

    const subtopicTitle = (selectedTarotTopic.subtopics || []).find((item) => item.id === selectedTarotSubtopic)?.title || selectedTarotSubtopic;
    const result = await apiRequest("/api/tarot-cards/reading", "POST", {
      topic: selectedTarotTopic.id,
      question: element("tarot-cards-question")?.value.trim() || "",
      partner_name: element("tarot-partner-name")?.value.trim() || "",
      subtopic: subtopicTitle,
      selected_card_ids: selectedTarotCardIds,
      draw_token: tarotDrawToken,
      language: lang,
    }, { redirectOnUnauthorized: true });

    setBalance(result.balance);
    if (typeof result.balance === "number") {
      saveTimedCache(BALANCE_CACHE_KEY, result.balance);
    }
    if (typeof result.guest_free_remaining === "number") {
      applyGuestFreeRemaining(result.guest_free_remaining);
      syncAuthRequiredSections(!isLoggedIn());
      syncGuestFreeBanner();
    }
    tarotLastReportUrl = result.report_url || "";
    showTarotStep("result");
    renderTarotCardsResult(result);
    element("tarot-step-result")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  } catch (error) {
    deck?.classList.remove("is-shuffling", "is-dealing");
    showTarotStep("details");
    const message = error?.message || i18n.tarotCardsDrawFailed;
    if (isGuestQuotaExceededError(message)) {
      applyGuestFreeRemaining(0);
      syncAuthRequiredSections(true);
      window.location.href = loginRedirectUrl();
      return;
    }
    if (requiredCost > 0 && (isInsufficientCreditsError(message) || String(message).toLowerCase().includes("spark") || String(message).includes("искр"))) {
      await showInsufficientSparksModal(requiredCost);
      return;
    }
    setResult("tarot-cards-form-result", message);
  }
}

function resetTarotFlow(topicId = "") {
  closeTarotCardModal();
  selectedTarotSubtopic = "";
  selectedTarotCardIds = [];
  drawnTarotCards = [];
  tarotDrawToken = "";
  tarotLastReportUrl = "";
  tarotResultView = { cards: [], interpretation: "", sections: [], outro: "" };
  const question = element("tarot-cards-question");
  const partner = element("tarot-partner-name");
  if (question) {
    question.value = "";
  }
  if (partner) {
    partner.value = "";
  }
  setResult("tarot-cards-form-result", "");
  if (topicId) {
    openTarotTopic(topicId);
    return;
  }
  selectedTarotTopic = null;
  showTarotStep("topics");
}

async function loadTarotCardsDeck() {
  if (!element("tarot-topic-grid") && !document.body.dataset.reportModule) {
    return;
  }
  if (element("tarot-topic-grid")) {
    const result = await apiRequest(`/api/tarot-cards/deck?lang=${encodeURIComponent(lang)}`, "GET");
    tarotCardsDeck = result.deck || [];
    tarotCardsTopics = result.topics || [];
    renderTarotTopicGrid();
    showTarotStep("topics");
  }
}

async function loadTarotCardsReport() {
  const reportId = Number(document.body.dataset.reportId || 0);
  if (!reportId || document.body.dataset.reportModule !== "tarot_cards") {
    return;
  }
  const container = element("tarot-cards-result");
  if (!container) {
    return;
  }
  showSparkLoading("tarot-cards-result", i18n.loading);
  try {
    const result = await apiRequest(`/api/tarot-cards/report/${reportId}`, "GET", undefined, { redirectOnUnauthorized: true });
    renderTarotCardsResult(result);
  } catch (error) {
    setResult("tarot-cards-result", error.message || i18n.requestError);
  }
}

function wireTarotCardsForm() {
  const topicGrid = element("tarot-topic-grid");
  if (!topicGrid && !document.body.dataset.reportModule) {
    return;
  }
  topicGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-topic-id]");
    if (!button) {
      return;
    }
    openTarotTopic(button.dataset.topicId);
  });
  element("tarot-back-topics")?.addEventListener("click", () => resetTarotFlow());
  element("tarot-start-reading")?.addEventListener("click", () => startTarotReadingFlow());
  element("tarot-another-spread")?.addEventListener("click", () => resetTarotFlow());
  element("tarot-subtopic-grid")?.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-subtopic-id]");
    if (!chip || !selectedTarotTopic) {
      return;
    }
    selectedTarotSubtopic = chip.dataset.subtopicId || "";
    renderTarotSubtopics(selectedTarotTopic);
  });
  element("tarot-question-examples")?.addEventListener("click", (event) => {
    const chip = event.target.closest(".tarot-example-chip");
    const textarea = element("tarot-cards-question");
    if (!chip || !textarea) {
      return;
    }
    textarea.value = chip.textContent || "";
    textarea.focus();
  });
}

