// Мінісклад — frontend на звичайному JavaScript (без React та Vue).
// У ЛР №1: GET і POST до Express, пошук, фільтрація та розрахунки.

const settings = window.APP_CONFIG || { apiBaseUrl: "", demoMode: false };
const apiBaseUrl = (settings.apiBaseUrl || "").replace(/\/$/, "");
const LOW_STOCK_LIMIT = 5;

let products = [];
let demoProducts = (window.DEMO_PRODUCTS || []).map(product => ({ ...product }));

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
  count: document.querySelector("#stat-products"),
  quantity: document.querySelector("#stat-quantity"),
  value: document.querySelector("#stat-value"),
  lowStock: document.querySelector("#stat-low-stock")
};

const money = value => new Intl.NumberFormat("uk-UA", {
  style: "currency", currency: "UAH", maximumFractionDigits: 2
}).format(value);

// Два прості алгоритми — їх можна залишити студентам як завдання в ЛР №1.
function calculateTotalValue(items) {
  return 0;
}

function countLowStock(items) {
   return 0;
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

function makeProductCell(product) {
  const cell = document.createElement("td");
  const wrapper = document.createElement("div");
  wrapper.className = "product-cell";

  const image = document.createElement("img");
  image.alt = ""; // Декоративне зображення: назва товару стоїть поруч.
  image.className = "product-photo";
  image.src = typeof product.photoUrl === "string" && /^https?:\/\//i.test(product.photoUrl)
    ? product.photoUrl
    : "./assets/product-placeholder.svg";
  image.onerror = () => {
    image.onerror = null;
    image.src = "./assets/product-placeholder.svg";
  };

  const name = document.createElement("span");
  name.textContent = product.name; // textContent не інтерпретує назву як HTML.
  name.className = "product-name";

  wrapper.append(image, name);
  cell.append(wrapper);
  return cell;
}

function render() {
  elements.count.textContent = String(products.length);
  elements.quantity.textContent = String(products.reduce((sum, p) => sum + p.quantity, 0));
  elements.value.textContent = money(calculateTotalValue(products));
  elements.lowStock.textContent = String(countLowStock(products));

  const query = elements.search.value.trim().toLocaleLowerCase("uk-UA");
  const filtered = products.filter(product => {
    const matchesSearch = product.name.toLocaleLowerCase("uk-UA").includes(query);
    const matchesLowStock = !elements.onlyLowStock.checked || product.quantity < LOW_STOCK_LIMIT;
    return matchesSearch && matchesLowStock;
  });

  elements.body.replaceChildren();
  for (const product of filtered) {
    const row = document.createElement("tr");
    row.append(makeProductCell(product));
    row.append(createTextCell(product.quantity, "number"));
    row.append(createTextCell(money(product.price), "number"));
    row.append(createTextCell(money(product.price * product.quantity), "number"));

    const stock = document.createElement("td");
    const label = document.createElement("span");
    const isLow = product.quantity < LOW_STOCK_LIMIT;
    label.className = `stock-label ${isLow ? "stock-low" : "stock-ok"}`;
    label.textContent = product.quantity === 0 ? "Немає" : isLow ? "Мало" : "У наявності";
    stock.append(label);
    row.append(stock);
    elements.body.append(row);
  }
  elements.empty.hidden = filtered.length !== 0;
}

async function loadProducts() {
  showError("");
  try {
    if (settings.demoMode) {
      products = demoProducts.map(product => ({ ...product }));
      setConnectionStatus("Деморежим · без API", "demo");
    } else {
      const response = await fetch(`${apiBaseUrl}/api/products`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      products = await response.json();
      if (!Array.isArray(products)) throw new Error("Очікувався масив товарів");
      setConnectionStatus("API підключено", "online");
    }
  } catch (error) {
    products = [];
    setConnectionStatus("API недоступний", "offline");
    showError(`Не вдалося отримати список товарів: ${error.message}. Перевірте, чи запущено backend.`);
  }
  render();
}

async function addProduct(event) {
  event.preventDefault();
  const name = document.querySelector("#product-name").value.trim();
  const quantity = Number(document.querySelector("#product-quantity").value);
  const price = Number(document.querySelector("#product-price").value);

  elements.formMessage.textContent = "";
  if (name.length < 2 || !Number.isInteger(quantity) || quantity < 0 ||
      !Number.isFinite(price) || price < 0) {
    elements.formMessage.textContent = "Перевірте назву, кількість та ціну.";
    return;
  }

  elements.submit.disabled = true;
  try {
    if (settings.demoMode) {
      const nextId = Math.max(0, ...demoProducts.map(p => p.id)) + 1;
      demoProducts.push({ id: nextId, name, quantity, price, photoUrl: null });
      elements.formMessage.textContent = "Товар додано лише в деморежимі. Після перезавантаження сторінки зміни зникнуть.";
    } else {
      const response = await fetch(`${apiBaseUrl}/api/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, quantity, price })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      elements.formMessage.textContent = "Товар успішно додано.";
    }
    elements.form.reset();
    await loadProducts();
  } catch (error) {
    elements.formMessage.textContent = `Помилка: ${error.message}`;
  } finally {
    elements.submit.disabled = false;
  }
}

elements.search.addEventListener("input", render);
elements.onlyLowStock.addEventListener("change", render);
elements.refresh.addEventListener("click", loadProducts);
elements.form.addEventListener("submit", addProduct);

loadProducts();
