/**
 * Astrolhub client — ui.js
 * Compatibility, dashboard carousel, language switch
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

function wireDashboardCarousel() {
  const carousel = element("dashboard-carousel");
  if (!carousel) {
    return;
  }
  const track = carousel.querySelector(".dashboard-carousel-track");
  const slides = Array.from(carousel.querySelectorAll(".dashboard-slide"));
  if (!track || !slides.length) {
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
  let touchStartScrollTop = 0;
  let isAnimating = false;
  let wheelLockUntil = 0;
  let fitFrame = 0;
  const transitionMs = prefersReducedMotion() ? 0 : 560;
  const transitionSafetyMs = transitionMs + 80;
  const goServicesButton = element("dashboard-go-services");
  const mobileFitMq = window.matchMedia("(max-width: 767px)");
  const supportsZoom = typeof CSS !== "undefined" && typeof CSS.supports === "function"
    ? CSS.supports("zoom", "0.5")
    : "zoom" in document.documentElement.style;

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

  const resetSlideFit = (body) => {
    body.style.zoom = "";
    body.style.transform = "";
    body.style.width = "";
    body.style.marginBottom = "";
    body.style.maxHeight = "";
  };

  const applyBodyScale = (body, scale) => {
    if (scale >= 0.999) {
      resetSlideFit(body);
      return;
    }
    if (supportsZoom) {
      body.style.zoom = String(scale);
      body.style.transform = "";
      body.style.width = "";
      body.style.marginBottom = "";
      return;
    }
    body.style.zoom = "";
    body.style.transformOrigin = "top center";
    body.style.transform = `scale(${scale})`;
    body.style.width = `${100 / scale}%`;
    body.style.marginBottom = `${-(body.scrollHeight * (1 - scale))}px`;
  };

  const measureScaledHeight = (body, scale) => {
    applyBodyScale(body, scale);
    // zoom affects layout metrics; transform does not — use getBoundingClientRect for both.
    return body.getBoundingClientRect().height;
  };

  const densifyIntroSlide = (slide, available, needed) => {
    if (!slide.classList.contains("dashboard-slide-intro")) {
      return;
    }
    slide.classList.remove("is-dense", "is-compact", "is-ultra");
    if (needed <= available + 1) {
      return;
    }
    const ratio = needed / Math.max(available, 1);
    slide.classList.add("is-dense");
    if (ratio > 1.12) {
      slide.classList.add("is-compact");
    }
    if (ratio > 1.28) {
      slide.classList.add("is-ultra");
    }
  };

  const fitSlideBodies = () => {
    slides.forEach((slide) => {
      const body = slide.querySelector(":scope > .dashboard-slide-body")
        || slide.querySelector(".dashboard-slide-body");
      if (!body) {
        return;
      }
      resetSlideFit(body);
      slide.classList.remove("is-dense", "is-compact", "is-ultra");
      const available = slide.clientHeight;
      if (available <= 0) {
        return;
      }

      let needed = Math.max(body.scrollHeight, body.getBoundingClientRect().height);
      densifyIntroSlide(slide, available, needed);
      // Re-measure after density classes change layout.
      needed = Math.max(body.scrollHeight, body.getBoundingClientRect().height);
      if (needed <= available + 1) {
        return;
      }

      // Progressive densify if still overflowing before scale.
      if (slide.classList.contains("dashboard-slide-intro") && !slide.classList.contains("is-ultra")) {
        slide.classList.add("is-dense", "is-compact", "is-ultra");
        needed = Math.max(body.scrollHeight, body.getBoundingClientRect().height);
        if (needed <= available + 1) {
          return;
        }
      }

      let low = 0.48;
      let high = Math.min(1, available / needed);
      let best = high;
      for (let i = 0; i < 10; i += 1) {
        const mid = (low + high) / 2;
        const measured = measureScaledHeight(body, mid);
        if (measured <= available + 1) {
          best = mid;
          low = mid;
        } else {
          high = mid;
        }
      }
      applyBodyScale(body, Math.max(0.48, Math.min(1, best)));
      if (body.getBoundingClientRect().height > available + 2) {
        applyBodyScale(body, Math.max(0.48, available / Math.max(needed, 1)));
      }
    });
  };

  const scheduleFitSlideBodies = () => {
    if (fitFrame) {
      window.cancelAnimationFrame(fitFrame);
    }
    fitFrame = window.requestAnimationFrame(() => {
      fitFrame = 0;
      fitSlideBodies();
      // Second pass after layout settles (fonts / images / safe-area).
      window.requestAnimationFrame(() => {
        fitSlideBodies();
        syncTrackPosition(currentSlide);
      });
    });
  };

  const canScrollInsideActiveSlide = () => false;

  const syncTrackPosition = (index) => {
    const offset = Math.max(0, track.clientHeight) * index;
    track.style.transform = `translateY(-${offset}px)`;
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
    syncTrackPosition(next);
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === next;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", active ? "false" : "true");
      if (active && previous !== next) {
        slide.scrollTop = 0;
      }
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
    scheduleFitSlideBodies();
    return true;
  };

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
    touchStartScrollTop = slides[currentSlide]?.scrollTop || 0;
  }, { passive: true });

  carousel.addEventListener("touchend", (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch) {
      return;
    }
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    if (Math.abs(deltaY) < 56 || Math.abs(deltaY) <= Math.abs(deltaX)) {
      return;
    }
    const activeSlide = slides[currentSlide];
    if (activeSlide && Math.abs((activeSlide.scrollTop || 0) - touchStartScrollTop) > 8) {
      return;
    }
    if (canScrollInsideActiveSlide(deltaY < 0 ? 1 : -1)) {
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
          wheelLockUntil = Date.now() + Math.max(280, transitionMs - 40);
        }
      }
      return;
    }
    if (currentSlide > 0) {
      event.preventDefault();
      if (applySlide(currentSlide - 1)) {
        wheelLockUntil = Date.now() + Math.max(280, transitionMs - 40);
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

  window.addEventListener("resize", () => {
    scheduleFitSlideBodies();
  });
  window.visualViewport?.addEventListener("resize", () => {
    scheduleFitSlideBodies();
  });
  window.addEventListener("orientationchange", () => {
    window.setTimeout(scheduleFitSlideBodies, 120);
  });

  if (typeof mobileFitMq.addEventListener === "function") {
    mobileFitMq.addEventListener("change", scheduleFitSlideBodies);
  } else if (typeof mobileFitMq.addListener === "function") {
    mobileFitMq.addListener(scheduleFitSlideBodies);
  }

  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(() => {
      scheduleFitSlideBodies();
    });
    resizeObserver.observe(carousel);
    slides.forEach((slide) => resizeObserver.observe(slide));
  }

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

