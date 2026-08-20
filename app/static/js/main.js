/**
 * Astrolhub client — main.js
 * App boot
 * Split from monolithic app.js for maintainability.
 * Load order: core → cabinet → services → tarot-cards → admin → ui → main.
 */

async function boot() {
  initPageEntranceAnimation();
  await initAuthStaticPage();
  toggleHeaderAuthLinks();
  syncAuthRequiredSections(!isLoggedIn());
  wirePaymentForms();
  wirePlusSubscriptionForm();
  wireTopupPage();
  wireAuthPages();
  wireAuthRequiredLinks();
  wireLogoutButton();
  wirePasswordResetForm();
  wireRequestHistory();
  wirePaymentsHistoryActions();
  wireSupportForms();
  wireAdminEvents();
  wireProfilePersonas();
  wireBirthDateMasks();
  wireBirthTimeMasks();
  wireSonnikForm();
  wireNumerologyForm();
  wireTarotForm();
  wireTarotCardsForm();
  wireAstrologyForm();
  wireCompatibilityForms();
  wireLangSwitch();
  wireDashboardCarousel();
  localStorage.removeItem(TELEGRAM_INIT_DATA_KEY);
  hydrateUiFromCache();
  await verifyTelegramUsernameLinkFromQuery();
  let profile = null;
  if (hasStoredAuthToken()) {
    profile = await loadProfile();
  }
  let telegramVerified = false;
  if (!isLoggedIn()) {
    telegramVerified = await autoVerifyTelegram();
  }
  if (!profile || telegramVerified || !isLoggedIn()) {
    profile = await loadProfile();
  }
  if (profile?.provider !== "telegram" && isTelegramWebAppContext() && state.telegramInitData) {
    setTelegramAuthStatus(
      (element("telegram-auth-status")?.textContent || "") ||
        `${i18n.telegramAuthFailed}. ${i18n.telegramTokenMismatchHint}`,
    );
  }
  toggleEmailAuthEntry();
  syncAuthChrome(profile);
  await loadGuestQuota();
  syncAuthRequiredSections(!isLoggedIn());
  await loadPersonas();
  await loadTarotCardsDeck().catch(() => {});
  await loadTarotCardsReport().catch(() => {});
  await Promise.all([loadPaymentPackages(), refreshBalance().catch(() => {})]);
  await loadPaymentsHistory();
  await loadRequestHistory();
  await loadHistoryRequestDetail();
  await loadSupportTickets();
  await loadNumerologyReport();
  await loadAdminDashboard();
  if (element("payments-history")) {
    setInterval(() => {
      loadPaymentsHistory().catch(() => {});
    }, 30000);
    setInterval(() => {
      syncPendingPayments().catch(() => {});
    }, 15000);
  }
}

boot().catch(() => {});

