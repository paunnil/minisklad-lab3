
// ЛР №7 — Cloudflare Pages + Workers + D1 + API НБУ

const settings = window.APP_CONFIG || {
  apiBaseUrl: "",
  demoMode: false
};

const apiBaseUrl = (settings.apiBaseUrl || "").replace(/\/$/, "");
const LOW_STOCK_LIMIT = 5;

let products = [];
let demoProducts = (window.DEMO_PRODUCTS || []).map(p => ({ ...p }));
let editingId = null;
let currency = "UAH";
let usdRate = null;

const elements = {
  body: document.querySelector("#products-body"),
  empty: document.querySelector("#empty-state"),
  search: document.querySelector("#search-input"),
  onlyLowStock: document.querySelector("#only-low-stock"),
  refresh: document.querySelector("#refresh-button"),
  status: document.querySelector("#connection-status"),
  message: document.querySelector("#global-message"),
  form: document.querySelector("#product-form"),
  formMessage: document.querySelector("#form-message"),
  submit: document.querySelector("#submit-button"),
  formHeading: document.querySelector("#add-product-heading"),
  cancelEdit: document.querySelector("#cancel-edit-button"),
  count: document.querySelector("#stat-products"),
  quantity: document.querySelector("#stat-quantity"),
  value: document.querySelector("#stat-value"),
  lowStock: document.querySelector("#stat-low-stock"),
  currencySelect: document.querySelector("#currency-select"),
  rateStatus: document.querySelector("#rate-status"),
  name: document.querySelector("#product-name"),
  productQuantity: document.querySelector("#product-quantity"),
  price: document.querySelector("#product-price")
};

// Обчислення показників складу
function calculateTotalValue(items) {
  return items.reduce(
    (sum, p) => sum + p.quantity * p.price, 0
  );
}

function countLowStock(items) {
  return items.filter(p => p.quantity < LOW_STOCK_LIMIT).length;
}

// Форматування ціни залежно від вибраної валюти
function money(value) {
  const isUsd = currency === "USD" && usdRate !== null;

  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: isUsd ? "USD" : "UAH",
    maximumFractionDigits: 2
  }).format(isUsd ? value / usdRate : value);
}

function setConnectionStatus(text, state) {
  elements.status.textContent = text;
  elements.status.className = `status-pill status-${state}`;
}

function showError(message) {
  elements.message.hidden = !message;
  elements.message.textContent = message;
}

function createTextCell(value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = String(value);
  if (className) cell.className = className;
  return cell;
}

// Комірка з фотографією та назвою товару
function makeProductCell(product) {
  const cell = document.createElement("td");
  const wrapper = document.createElement("div");
  wrapper.className = "product-cell";

  const image = document.createElement("img");
  image.alt = "";
  image.className = "product-photo";

  image.src = typeof product.photoUrl === "string" &&
    /^https?:\/\//i.test(product.photoUrl)
      ? product.photoUrl
      : "./assets/product-placeholder.svg";

  image.onerror = () => {
    image.onerror = null;
    image.src = "./assets/product-placeholder.svg";
  };

  const name = document.createElement("span");
  name.textContent = product.name;
  name.className = "product-name";

  wrapper.append(image, name);
  cell.append(wrapper);
  return cell;
}

// Створення кнопки для керування товаром
function actionButton(text, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.className = className;
  button.addEventListener("click", handler);
  return button;
}

// Відображення таблиці й підсумкових показників
function render() {
  elements.count.textContent = String(products.length);

  elements.quantity.textContent = String(
    products.reduce((sum, p) => sum + p.quantity, 0)
  );

  elements.value.textContent = money(
    calculateTotalValue(products)
  );

  elements.lowStock.textContent = String(
    countLowStock(products)
  );

  const query = elements.search.value
    .trim()
    .toLocaleLowerCase("uk-UA");

  const filtered = products.filter(product =>
    product.name.toLocaleLowerCase("uk-UA").includes(query) &&
    (!elements.onlyLowStock.checked ||
      product.quantity < LOW_STOCK_LIMIT)
  );

  elements.body.replaceChildren();

  for (const product of filtered) {
    const row = document.createElement("tr");

    row.append(makeProductCell(product));

    row.append(
      createTextCell(product.quantity, "number")
    );

    row.append(
      createTextCell(money(product.price), "number")
    );

    row.append(
      createTextCell(
        money(product.price * product.quantity),
        "number"
      )
    );

    const stock = document.createElement("td");
    const label = document.createElement("span");
    const isLow = product.quantity < LOW_STOCK_LIMIT;

    label.className =
      `stock-label ${isLow ? "stock-low" : "stock-ok"}`;

    label.textContent =
      product.quantity === 0 ? "Немає" :
      isLow ? "Мало" : "У наявності";

    stock.append(label);
    row.append(stock);

    // Новий стовпчик з кнопками
    const actions = document.createElement("td");
    actions.className = "actions-cell";

    actions.append(
      actionButton(
        "Редагувати",
        "button-secondary",
        () => startEdit(product)
      ),
      actionButton(
        "Видалити",
        "button-danger",
        () => deleteProduct(product)
      )
    );

    row.append(actions);
    elements.body.append(row);
  }

  elements.empty.hidden = filtered.length !== 0;
}

// Універсальна функція виконання REST-запитів
async function apiRequest(path, options = {}) {
  const response = await fetch(
    `${apiBaseUrl}${path}`,
    options
  );

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(
      `Некоректна відповідь сервера (HTTP ${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(
      result.error || `HTTP ${response.status}`
    );
  }

  return result;
}

// GET — отримання товарів
async function loadProducts() {
  showError("");

  try {
    if (settings.demoMode) {
      products = demoProducts.map(p => ({ ...p }));
      setConnectionStatus("Деморежим · без API", "demo");
    } else {
      const data = await apiRequest("/api/products");

      if (!Array.isArray(data)) {
        throw new Error("Очікувався масив товарів");
      }

      products = data;
      setConnectionStatus("API підключено", "online");
    }
  } catch (error) {
    products = [];
    setConnectionStatus("API недоступний", "offline");

    showError(
      `Не вдалося завантажити товари: ${error.message}`
    );
  }

  render();
}

// Скасування редагування
function cancelEdit() {
  editingId = null;
  elements.form.reset();
  elements.formHeading.textContent = "Новий товар";
  elements.submit.textContent = "+ Додати товар";
  elements.cancelEdit.hidden = true;
}

// Заповнення форми для редагування
function startEdit(product) {
  editingId = product.id;

  elements.name.value = product.name;
  elements.productQuantity.value = String(product.quantity);
  elements.price.value = String(product.price);

  elements.formHeading.textContent =
    `Редагування товару №${product.id}`;

  elements.submit.textContent = "Зберегти зміни";
  elements.cancelEdit.hidden = false;
  elements.formMessage.textContent = "";

  elements.form.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

// POST або PUT — збереження товару
async function saveProduct(event) {
  event.preventDefault();

  const name = elements.name.value.trim();
  const quantity = Number(elements.productQuantity.value);
  const price = Number(elements.price.value);

  if (
    name.length < 2 ||
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    !Number.isFinite(price) ||
    price < 0
  ) {
    elements.formMessage.textContent =
      "Перевірте назву, кількість і ціну.";
    return;
  }

  const currentProduct = products.find(
    p => p.id === editingId
  );

  // Зберігаємо photoUrl під час редагування
  const payload = {
    name,
    quantity,
    price,
    photoUrl: currentProduct?.photoUrl ?? null
  };

  elements.submit.disabled = true;
  elements.formMessage.textContent = "";

  try {
    if (settings.demoMode) {
      if (editingId === null) {
        const nextId = Math.max(
          0, ...demoProducts.map(p => p.id)
        ) + 1;

        demoProducts.push({ id: nextId, ...payload });
      } else {
        demoProducts = demoProducts.map(p =>
          p.id === editingId
            ? { id: p.id, ...payload }
            : p
        );
      }
    } else {
      const isEdit = editingId !== null;

      await apiRequest(
        isEdit
          ? `/api/products/${editingId}`
          : "/api/products",
        {
          method: isEdit ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
    }

    cancelEdit();

    elements.formMessage.textContent = settings.demoMode
      ? "Зміни виконано лише в деморежимі."
      : "Зміни збережено у Cloudflare D1.";

    await loadProducts();

  } catch (error) {
    elements.formMessage.textContent =
      `Помилка: ${error.message}`;
  } finally {
    elements.submit.disabled = false;
  }
}

// DELETE — видалення товару
async function deleteProduct(product) {
  if (!confirm(`Видалити товар «${product.name}»?`)) {
    return;
  }

  try {
    if (settings.demoMode) {
      demoProducts = demoProducts.filter(
        p => p.id !== product.id
      );
    } else {
      await apiRequest(
        `/api/products/${product.id}`,
        { method: "DELETE" }
      );
    }

    if (editingId === product.id) {
      cancelEdit();
    }

    await loadProducts();

    elements.formMessage.textContent =
      `Товар «${product.name}» видалено.`;

  } catch (error) {
    showError(
      `Не вдалося видалити товар: ${error.message}`
    );
  }
}

// GET — отримання курсу USD через Worker
async function loadExchangeRate() {
  if (settings.demoMode) {
    elements.rateStatus.textContent =
      "Деморежим: курс НБУ не завантажується";
    return;
  }

  try {
    const data = await apiRequest("/api/exchange-rate");

    if (
      !Number.isFinite(data.rate) ||
      data.rate <= 0
    ) {
      throw new Error("Неправильне значення курсу");
    }

    usdRate = data.rate;
    elements.currencySelect.disabled = false;

    elements.rateStatus.textContent =
      `1 USD = ${data.rate.toFixed(4)} грн · НБУ, ${data.date}`;

  } catch (error) {
    usdRate = null;
    currency = "UAH";

    elements.currencySelect.value = "UAH";
    elements.currencySelect.disabled = true;

    elements.rateStatus.textContent =
      `Курс НБУ недоступний: ${error.message}`;

    render();
  }
}

// Обробники подій інтерфейсу
elements.search.addEventListener("input", render);

elements.onlyLowStock.addEventListener(
  "change", render
);

elements.refresh.addEventListener(
  "click", loadProducts
);

elements.form.addEventListener(
  "submit", saveProduct
);

elements.cancelEdit.addEventListener(
  "click", cancelEdit
);

elements.currencySelect.addEventListener("change", () => {
  currency = elements.currencySelect.value;
  render();
});

// Початкове завантаження даних
loadProducts();
loadExchangeRate();
