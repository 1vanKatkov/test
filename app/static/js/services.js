/**
 * Astrolhub client — services.js
 * Sonnik, numerology, personas, natal tarot, astrology, numerology report
 * Split from monolithic app.js for maintainability.
 * Load order: core → cabinet → services → tarot-cards → admin → ui → main.
 */

function wireSonnikForm() {
  const form = element("sonnik-form");
  if (!form) {
    return;
  }
  wirePersonaPicker("sonnik-persona");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    let personaPayload = emptyPersonaApiPayload();
    try {
      personaPayload = await resolvePersonaForPrefix("sonnik-persona", { optional: true });
    } catch (error) {
      setResult("sonnik-result", error.message);
      return;
    }
    const { resolvedPersona: _resolvedPersona, ...personaFields } = personaPayload;
    await runReportFlow({
      form,
      resultId: "sonnik-result",
      loadingLabel: i18n.analyzingDream,
      requiredCost: serviceCostFromDataset("costSonnik"),
      request: () => apiRequest("/api/sonnik/interpret", "POST", {
        dream_text: element("dream-text").value.trim(),
        language: lang,
        ...personaFields,
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
      personaPayload = await resolvePersonaForPrefix("numerology-persona", { requireBirthDetails: false });
    } catch (error) {
      setResult("numerology-result", error.message);
      return;
    }
    const { resolvedPersona: _resolvedPersona, ...personaFields } = personaPayload;
    const resolvedPersona = personaPayload.resolvedPersona || {};
    await runReportFlow({
      form,
      resultId: "numerology-result",
      loadingLabel: i18n.generatingReport,
      requiredCost: serviceCostFromDataset("costNumerology"),
      request: () => apiRequest("/api/numerology/generate", "POST", {
        full_name: personaFields.persona_name || resolvedPersona.name || "",
        birth_date: personaFields.persona_birth_date || resolvedPersona.birth_date || "",
        language: lang,
        ...personaFields,
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

function setPersonaPanelActive(panel, active) {
  if (!panel) {
    return;
  }
  panel.hidden = !active;
  panel.querySelectorAll("input, select, textarea, button").forEach((control) => {
    control.disabled = !active;
    if (
      control instanceof HTMLInputElement
      || control instanceof HTMLTextAreaElement
      || control instanceof HTMLSelectElement
    ) {
      if (!active) {
        if (control.required) {
          control.dataset.wasRequired = "true";
        }
        control.required = false;
      } else if (control.dataset.wasRequired === "true") {
        control.required = true;
      }
    }
  });
}

function togglePersonaPanels(prefix) {
  const mode = personaModeValue(prefix);
  const savedPanel = element(`${prefix}-saved-persona-panel`);
  const manualPanel = element(`${prefix}-manual-persona-panel`);
  document.querySelectorAll(`input[name='${prefix}-mode']`).forEach((radio) => {
    radio.closest("label")?.classList.toggle("is-active", radio.checked);
  });
  setPersonaPanelActive(savedPanel, mode === "saved");
  setPersonaPanelActive(manualPanel, mode === "manual");
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

function emptyPersonaApiPayload(options = {}) {
  return {
    [`${options.idKey || "persona_id"}`]: 0,
    [`${options.nameKey || "persona_name"}`]: "",
    [`${options.birthDateKey || "persona_birth_date"}`]: "",
    [`${options.birthTimeKey || "persona_birth_time"}`]: "",
    [`${options.birthPlaceKey || "persona_birth_place"}`]: "",
    [`${options.noteKey || "persona_note"}`]: "",
    resolvedPersona: null,
  };
}

async function resolvePersonaForPrefix(prefix, options = {}) {
  const mode = personaModeValue(prefix);
  const manualPersona = personaPayloadFromPrefix(prefix);
  let personaId = mode === "saved"
    ? Number(element(`${prefix}-select`)?.value || element(`${prefix}-choices`)?.dataset.selectedPersonaId || 0)
    : 0;
  const hasManualData = Boolean(
    manualPersona.name || manualPersona.birth_date || manualPersona.birth_time || manualPersona.birth_place || manualPersona.note,
  );
  if (options.optional) {
    if (mode === "saved" && !personaId) {
      return emptyPersonaApiPayload(options);
    }
    if (mode === "manual" && !hasManualData) {
      return emptyPersonaApiPayload(options);
    }
  }
  if (mode === "saved" && !personaId) {
    throw new Error(i18n.personaRequired);
  }
  if (mode === "manual" && !options.optional) {
    if (!manualPersona.name || !manualPersona.birth_date) {
      throw new Error(i18n.personaRequired);
    }
  }
  if (!options.skipSave && mode === "manual" && element(`${prefix}-save-persona`)?.checked) {
    if (!isLoggedIn()) {
      throw new Error(i18n.personaSaveNeedsAuth || i18n.signInRequiredTitle || i18n.personaRequired);
    }
    if (manualPersona.name && manualPersona.birth_date) {
      const persona = await createPersona({
        ...manualPersona,
        birth_time: manualPersona.birth_time || "",
        birth_place: manualPersona.birth_place || "",
      });
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
  if (!isLoggedIn()) {
    throw new Error(i18n.personaSaveNeedsAuth || (lang === "en"
      ? "Sign in to save personas"
      : "Войдите, чтобы сохранять персоны"));
  }
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

const PERSONA_SELECT_PREFIXES = [
  "numerology-persona",
  "compat-persona1",
  "compat-persona2",
  "sonnik-persona",
  "astrology-persona",
  "tarot-cards-persona",
];

async function loadPersonas() {
  if (!isLoggedIn()) {
    state.personas = [];
    renderTarotPersonaSelect();
    PERSONA_SELECT_PREFIXES.forEach(renderPersonaSelect);
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
  PERSONA_SELECT_PREFIXES.forEach(renderPersonaSelect);
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
    if (!isLoggedIn()) {
      setResult("profile-persona-result", i18n.personaSaveNeedsAuth || (lang === "en"
        ? "Sign in to save personas"
        : "Войдите, чтобы сохранять персоны"));
      window.location.href = loginRedirectUrl();
      return;
    }
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
    document.querySelectorAll("input[name='tarot-persona-mode']").forEach((radio) => {
      radio.closest("label")?.classList.toggle("is-active", radio.checked);
    });
    setPersonaPanelActive(element("tarot-saved-persona-panel"), mode === "saved");
    setPersonaPanelActive(element("tarot-manual-persona-panel"), mode === "manual");
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
    togglePersonaMode();
    const personaMode = document.querySelector("input[name='tarot-persona-mode']:checked")?.value || "saved";
    const manualPersona = personaPayloadFromPrefix("tarot-persona");
    let personaId = personaMode === "saved" ? Number(element("tarot-persona-select")?.value || 0) : 0;
    if (personaMode === "saved" && !personaId) {
      setTarotFormStatus(i18n.personaRequired);
      element("tarot-form-result")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
      element("tarot-persona-select")?.focus();
      return;
    }
    if (personaMode === "manual" && (!manualPersona.name || !manualPersona.birth_date)) {
      setTarotFormStatus(i18n.personaRequired);
      element("tarot-form-result")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
      return;
    }
    await runReportFlow({
      form,
      resultId: "tarot-result",
      loadingLabel: i18n.readingTarot,
      requiredCost: serviceCostFromDataset("costTarot"),
      request: async () => {
      if (personaMode === "manual" && element("tarot-save-persona")?.checked && manualPersona.name && manualPersona.birth_date) {
        if (!isLoggedIn()) {
          throw new Error(i18n.personaSaveNeedsAuth || (lang === "en"
            ? "Sign in to save personas"
            : "Войдите, чтобы сохранять персоны"));
        }
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

function wireAstrologyForm() {
  const form = element("astrology-form");
  if (!form) {
    return;
  }
  wirePersonaPicker("astrology-persona");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    let personaPayload;
    try {
      personaPayload = await resolvePersonaForPrefix("astrology-persona");
    } catch (error) {
      setResult("astrology-result", error.message);
      return;
    }
    const { resolvedPersona, ...personaFields } = personaPayload;
    const persona = resolvedPersona || {};
    await runReportFlow({
      form,
      resultId: "astrology-result",
      loadingLabel: i18n.buildingForecast,
      requiredCost: serviceCostFromDataset("costAstrology"),
      request: () => apiRequest("/api/astrology/forecast", "POST", {
        name: personaFields.persona_name || persona.name || "",
        birth_date: personaFields.persona_birth_date || persona.birth_date || "",
        birth_time: personaFields.persona_birth_time || persona.birth_time || "",
        birth_place: personaFields.persona_birth_place || persona.birth_place || "",
        focus: element("astrology-focus")?.value.trim() || "",
        language: lang,
        ...personaFields,
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

