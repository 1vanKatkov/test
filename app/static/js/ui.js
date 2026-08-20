/**
 * Astrolhub client — ui.js
 * Compatibility, dashboard scroll reveal, language switch
 * Split from monolithic app.js for maintainability.
 * Load order: core → cabinet → services → tarot-cards → admin → ui → main.
 */

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
    const resultNode = element("compat-result");
    const firstLabel = namesDatesForm.dataset.stepFirstLabel || (lang === "en" ? "Enter the first person" : "Введите первую личность");
    const secondLabel = namesDatesForm.dataset.stepSecondLabel || (lang === "en" ? "Enter the second person" : "Введите вторую личность");
    let currentStep = 1;

    const showCompatError = (message) => {
      setResult("compat-result", message);
      resultNode?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    };

    const setStepFieldsActive = (stepNode, active) => {
      if (!stepNode) {
        return;
      }
      stepNode.querySelectorAll("input, select, textarea, button").forEach((control) => {
        if (!(control instanceof HTMLElement)) {
          return;
        }
        if (control.matches("input[type='radio']")) {
          control.disabled = !active;
          return;
        }
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
            control.disabled = true;
            return;
          }
          control.disabled = false;
          if (control.dataset.wasRequired === "true") {
            control.required = true;
          }
        } else {
          control.disabled = !active;
        }
      });
    };

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
      setStepFieldsActive(firstStep, !isSecond);
      setStepFieldsActive(secondStep, isSecond);
      togglePersonaPanels(isSecond ? "compat-persona2" : "compat-persona1");
      if (isSecond) {
        renderPersonaSelect("compat-persona2");
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
            requireBirthDetails: false,
          });
        } catch (error) {
          showCompatError(error.message);
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
          requireBirthDetails: false,
        });
        secondPersona = await resolvePersonaForPrefix("compat-persona2", {
          idKey: "persona2_id",
          nameKey: "persona2_name",
          birthDateKey: "persona2_birth_date",
          birthTimeKey: "persona2_birth_time",
          birthPlaceKey: "persona2_birth_place",
          noteKey: "persona2_note",
          requireBirthDetails: false,
        });
      } catch (error) {
        showCompatError(error.message);
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

function wireDashboardScroll() {
  const root = element("dashboard-scroll");
  if (!root) {
    return;
  }

  const services = element("dashboard-services");
  const scrollToServices = () => {
    if (!services) {
      return;
    }
    services.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  };

  if (window.location.hash === "#dashboard-services") {
    window.requestAnimationFrame(() => {
      window.setTimeout(scrollToServices, prefersReducedMotion() ? 0 : 80);
    });
  }

  element("dashboard-go-services")?.addEventListener("click", scrollToServices);
  root.querySelectorAll(".dashboard-go-services-card").forEach((card) => {
    card.addEventListener("click", scrollToServices);
  });

  const revealNodes = Array.from(root.querySelectorAll(".reveal-on-scroll"));
  if (!revealNodes.length) {
    return;
  }

  if (prefersReducedMotion()) {
    revealNodes.forEach((node) => node.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );

  revealNodes.forEach((node, index) => {
    if (node.classList.contains("is-visible")) {
      return;
    }
    node.style.setProperty("--reveal-delay", `${Math.min(index % 5, 4) * 60}ms`);
    observer.observe(node);
  });
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

