// Налаштування доступу до API.
// ЛР №1: Express віддає і frontend, і API — адреса API відносна.
// ЛР №3: demoMode: true — статична демонстраційна версія для Cloudflare Pages.
// ЛР №4: demoMode: false, apiBaseUrl: "https://ВАШ-API.workers.dev".
window.APP_CONFIG = {
  apiBaseUrl: "https://minisklad-api.andrey-nicheporuk.workers.dev",
  demoMode: false
};
