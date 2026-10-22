// Початкові дані «Мініскладу»
const products = [
  { id: 1, name: "Комп'ютерна миша", quantity: 20, price: 249, photoUrl: null },
  { id: 2, name: "Клавіатура", quantity: 2, price: 599, photoUrl: null },
  { id: 3, name: "USB-накопичувач 64 ГБ", quantity: 18, price: 329, photoUrl: null },
  { id: 4, name: "Вебкамера", quantity: 2, price: 1290, photoUrl: null }
];

// Адреса frontend, якому дозволено отримувати відповіді API
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://minisklad-lab3.pages.dev",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

// Формування HTTP-відповіді у форматі JSON
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders
    }
  });
}

// Основний обробник HTTP-запитів
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    console.log("HTTP-запит:", request.method, url.pathname);

    // Обробка перевірочних CORS-запитів
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // Поки підтримуємо лише GET
    if (request.method !== "GET") {
      return jsonResponse(
        { error: "Метод не підтримується." },
        405
      );
    }

    // Перевірка стану API
    if (url.pathname === "/api/health") {
      return jsonResponse({
        status: "ok",
        service: "minisklad-api",
        version: env.APP_VERSION
      });
    }

    // Отримання списку товарів
    /*if (url.pathname === "/api/products") {
      return jsonResponse(products);
    }*/ 

    if (url.pathname === "/api/products") {
      try {
        const result = await env.DB
          .prepare(`
        SELECT id, name, quantity, price, photoUrl
        FROM products
        ORDER BY id
      `)
          .all();

        return jsonResponse(result.results);

      } catch (error) {
        console.error("Помилка звернення до D1:", error);

        return jsonResponse(
          { error: "Помилка отримання даних із бази даних." },
          500
        );
      }
    }

    // Невідомий маршрут
    return jsonResponse(
      { error: "API-маршрут не знайдено." },
      404
    );
  }
};