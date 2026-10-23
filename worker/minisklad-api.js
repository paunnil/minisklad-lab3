
// ЛР №6: CRUD REST API для Cloudflare Workers + D1

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://minisklad-lab3.pages.dev",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

// Зчитування та перевірка даних товару
async function readProduct(request) {
  const contentType = request.headers.get("Content-Type") || "";

  if (!contentType.includes("application/json")) {
    return {
      error: "Вкажіть Content-Type: application/json",
      status: 415
    };
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return {
      error: "Некоректний JSON у тілі запиту",
      status: 400
    };
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      error: "Очікується JSON-об'єкт із даними товару",
      status: 400
    };
  }

  const {
    name,
    quantity,
    price,
    photoUrl = null
  } = body;

  if (typeof name !== "string" || name.trim() === "") {
    return {
      error: "Поле name має містити назву товару",
      status: 400
    };
  }

  if (!Number.isInteger(quantity) || quantity < 0) {
    return {
      error: "quantity має бути цілим невід'ємним числом",
      status: 400
    };
  }

  if (
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price < 0
  ) {
    return {
      error: "price має бути невід'ємним числом",
      status: 400
    };
  }

  if (photoUrl !== null && typeof photoUrl !== "string") {
    return {
      error: "photoUrl має бути рядком або null",
      status: 400
    };
  }

  return {
    product: {
      name: name.trim(),
      quantity,
      price,
      photoUrl
    }
  };
}

// Основний обробник Cloudflare Worker
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    console.log("HTTP-запит:", method, path);

    // Обробка CORS
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    try {

      // --------------------------------
      // GET /api/exchange-rate
      // Отримання курсу USD з API НБУ
      // --------------------------------

      if (path === "/api/exchange-rate") {

        if (method !== "GET") {
          return jsonResponse(
            { error: "Метод не підтримується" },
            405
          );
        }

        try {

          // 1. Спробувати прочитати курс із KV
          const cached = await env.NBU_CACHE.get("USD_RATE", "json");

          if (cached && cached.rate > 0) {
            console.log("Курс USD отримано з Cloudflare KV");

            return jsonResponse({
              ...cached,
              source: "KV"
            });
          }

          // 2. Якщо кеш порожній, звернутися до API НБУ
          console.log("Кеш порожній. Звернення до API НБУ");

          const nbuUrl =
            "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchangenew?json&valcode=USD";

          const response = await fetch(nbuUrl);

          if (!response.ok) {
            throw new Error(`НБУ повернув HTTP ${response.status}`);
          }

          const data = await response.json();
          const usd = data.find(item => item.cc === "USD");

          if (!usd || !Number.isFinite(usd.rate) || usd.rate <= 0) {
            throw new Error("Не вдалося отримати курс USD");
          }

          // 3. Підготувати дані
          const exchangeRate = {
            currency: "USD",
            rate: usd.rate,
            date: usd.exchangedate
          };

          // 4. Зберегти курс у KV на 1 годину
          await env.NBU_CACHE.put(
            "USD_RATE",
            JSON.stringify(exchangeRate),
            { expirationTtl: 3600 }
          );

          console.log("Курс USD збережено в Cloudflare KV");

          // 5. Повернути дані користувачу
          return jsonResponse({
            ...exchangeRate,
            source: "NBU"
          });

        } catch (error) {
          console.error("Помилка отримання курсу:", error);

          return jsonResponse(
            { error: "Не вдалося отримати курс USD" },
            502
          );
        }
      }

      // --------------------------------
      // GET /api/health
      // Перевірка роботи Worker
      // --------------------------------

      if (path === "/api/health") {
        if (method !== "GET") {
          return jsonResponse(
            { error: "Метод не підтримується" },
            405
          );
        }

        return jsonResponse({
          status: "ok",
          service: "minisklad-api",
          version: env.APP_VERSION ?? "not-set"
        });
      }

      // --------------------------------
      // /api/products
      // Отримання та додавання товарів
      // --------------------------------

      if (path === "/api/products") {

        // GET - отримання всіх товарів
        if (method === "GET") {
          const result = await env.DB
            .prepare(`
              SELECT id, name, quantity, price, photoUrl
              FROM products
              ORDER BY id
            `)
            .all();

          return jsonResponse(result.results);
        }

        // POST - додавання нового товару
        if (method === "POST") {
          const input = await readProduct(request);

          if (input.error) {
            return jsonResponse(
              { error: input.error },
              input.status
            );
          }

          const p = input.product;

          const result = await env.DB
            .prepare(`
              INSERT INTO products
              (name, quantity, price, photoUrl)
              VALUES (?, ?, ?, ?)
            `)
            .bind(
              p.name,
              p.quantity,
              p.price,
              p.photoUrl
            )
            .run();

          return jsonResponse({
            id: result.meta.last_row_id,
            ...p
          }, 201);
        }

        return jsonResponse(
          { error: "Метод не підтримується" },
          405
        );
      }

      // --------------------------------
      // /api/products/:id
      // Оновлення та видалення товару
      // --------------------------------

      const match = path.match(/^\/api\/products\/([^/]+)$/);

      if (match) {
        const id = Number(match[1]);

        if (!Number.isSafeInteger(id) || id <= 0) {
          return jsonResponse(
            { error: "Некоректний ідентифікатор товару" },
            400
          );
        }

        // PUT - оновлення товару
        if (method === "PUT") {
          const input = await readProduct(request);

          if (input.error) {
            return jsonResponse(
              { error: input.error },
              input.status
            );
          }

          const p = input.product;

          const result = await env.DB
            .prepare(`
              UPDATE products
              SET
                name = ?,
                quantity = ?,
                price = ?,
                photoUrl = ?
              WHERE id = ?
            `)
            .bind(
              p.name,
              p.quantity,
              p.price,
              p.photoUrl,
              id
            )
            .run();

          if (result.meta.changes === 0) {
            return jsonResponse(
              { error: "Товар не знайдено" },
              404
            );
          }

          return jsonResponse({
            id,
            ...p
          });
        }

        // DELETE - видалення товару
        if (method === "DELETE") {
          const result = await env.DB
            .prepare(`
              DELETE FROM products
              WHERE id = ?
            `)
            .bind(id)
            .run();

          if (result.meta.changes === 0) {
            return jsonResponse(
              { error: "Товар не знайдено" },
              404
            );
          }

          return jsonResponse({
            message: "Товар видалено",
            id
          });
        }

        return jsonResponse(
          { error: "Метод не підтримується" },
          405
        );
      }

      // Невідомий маршрут
      return jsonResponse(
        { error: "Маршрут не знайдено" },
        404
      );

    } catch (error) {
      console.error("Помилка Worker / D1:", error);

      return jsonResponse(
        { error: "Внутрішня помилка сервера" },
        500
      );
    }
  }
};
