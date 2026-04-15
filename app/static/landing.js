(() => {
  const body = document.body;
  const guestView = document.getElementById("guest-view");
  const recognizedView = document.getElementById("recognized-view");
  const recognizedMeta = document.getElementById("recognized-meta");

  function detectRecognizedUser() {
    const fromQuery = body.dataset.recognizedFromQuery === "true";
    const queryName = body.dataset.initialName || "";
    const queryPlatform = body.dataset.initialPlatform || "";

    let telegramName = "";
    let telegramPlatform = "";
    if (window.Telegram && window.Telegram.WebApp) {
      const tgWebApp = window.Telegram.WebApp;
      tgWebApp.ready();
      const tgUser = tgWebApp.initDataUnsafe && tgWebApp.initDataUnsafe.user;
      if (tgUser) {
        telegramName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ").trim();
        telegramPlatform = "telegram";
      }
    }

    const maxVerified = localStorage.getItem("astrolhub.maxVerified") === "true";
    const lastAuthUser = localStorage.getItem("astrolhub.lastAuthUser") || "";
    const lastAuthPlatform = localStorage.getItem("astrolhub.lastAuthPlatform") || "";

    const isRecognized = fromQuery || Boolean(telegramName) || maxVerified;
    const recognizedName = queryName || telegramName || lastAuthUser;
    const recognizedPlatform = queryPlatform || telegramPlatform || lastAuthPlatform;

    return { isRecognized, recognizedName, recognizedPlatform };
  }

  function updateLandingState() {
    if (!guestView || !recognizedView) {
      return;
    }
    const state = detectRecognizedUser();
    if (state.isRecognized) {
      guestView.classList.add("hidden");
      recognizedView.classList.remove("hidden");
      if (recognizedMeta) {
        const parts = [];
        if (state.recognizedPlatform) {
          parts.push(`Платформа: ${state.recognizedPlatform}`);
        }
        if (state.recognizedName) {
          parts.push(`Пользователь: ${state.recognizedName}`);
        }
        recognizedMeta.textContent = parts.length ? parts.join(" | ") : "Пользователь распознан";
      }
    } else {
      recognizedView.classList.add("hidden");
      guestView.classList.remove("hidden");
    }
  }

  updateLandingState();

  const revealItems = document.querySelectorAll(".reveal");
  if (revealItems.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 },
    );
    revealItems.forEach((item) => observer.observe(item));
  }

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      const href = anchor.getAttribute("href");
      if (!href || href === "#") {
        return;
      }
      const target = document.querySelector(href);
      if (!target) {
        return;
      }
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
})();

