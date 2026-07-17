/**
 * Legacy entrypoint.
 * Prefer /static/js/*.js via partials/client_scripts.html.
 * Dynamically loads the modular bundle in order for older template references.
 */
(function loadAstrolhubModules() {
  const current = document.currentScript;
  const versionQuery = current && current.src.includes("?")
    ? current.src.slice(current.src.indexOf("?"))
    : "";
  const base = current && current.src
    ? current.src.replace(/[^/]+(?:\?.*)?$/, "js/")
    : "/static/js/";
  const files = ["core.js", "cabinet.js", "services.js", "tarot-cards.js", "admin.js", "ui.js", "main.js"];
  let chain = Promise.resolve();
  files.forEach((file) => {
    chain = chain.then(
      () =>
        new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = base + file + versionQuery;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        }),
    );
  });
  chain.catch((error) => {
    console.error("Failed to load Astrolhub modules", error);
  });
})();
