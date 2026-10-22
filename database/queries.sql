-- Отримання всіх товарів
SELECT * FROM products;

-- Товари з кількістю менше 5
SELECT * FROM products
WHERE quantity < 5;

-- Сортування за ціною
SELECT * FROM products
ORDER BY price DESC;

-- Кількість товарних позицій
SELECT COUNT(*) AS total
FROM products;

-- Загальна вартість запасів
SELECT SUM(quantity * price) AS total_value
FROM products;

-- Зміна ціни товару
UPDATE products
SET price = 999
WHERE id = 2;