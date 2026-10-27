-- Deterministic demo data: the same seed always produces the same rows,
-- so eval reference answers stay stable. Dates are fixed to 2024-2025.
SELECT setseed(0.42);

INSERT INTO shop.categories (id, name)
SELECT i, name
FROM unnest(ARRAY[
  'Electronics', 'Books', 'Home & Kitchen', 'Clothing',
  'Sports & Outdoors', 'Toys & Games', 'Beauty', 'Garden'
]) WITH ORDINALITY AS c (name, i);

INSERT INTO shop.products (id, category_id, name, sku, price, created_at)
SELECT
  i,
  ((i - 1) % 8) + 1,
  (ARRAY['Classic', 'Pro', 'Compact', 'Deluxe', 'Eco', 'Smart', 'Ultra', 'Mini', 'Studio', 'Travel'])[((i - 1) / 8) % 10 + 1]
    || ' '
    || (ARRAY['Headphones', 'Novel', 'Blender', 'Jacket', 'Tent', 'Puzzle', 'Serum', 'Planter'])[((i - 1) % 8) + 1],
  'SKU-' || lpad(i::text, 5, '0'),
  round((5 + random() * 295)::numeric, 2),
  timestamptz '2023-06-01' + (random() * 365) * interval '1 day'
FROM generate_series(1, 80) AS i;

INSERT INTO shop.customers (id, first_name, last_name, email, country, city, created_at)
SELECT
  i,
  (ARRAY['Aisha', 'Ben', 'Chloe', 'Daniel', 'Elena', 'Farid', 'Grace', 'Hiro', 'Isla', 'Jonas', 'Karim', 'Lena'])[1 + floor(random() * 12)::int],
  (ARRAY['Ahmed', 'Brown', 'Costa', 'Dubois', 'Evans', 'Fischer', 'Garcia', 'Hassan', 'Ivanova', 'Jensen'])[1 + floor(random() * 10)::int],
  'customer' || i || '@example.com',
  geo.country,
  geo.city,
  timestamptz '2024-01-01' + (random() * 700) * interval '1 day'
FROM generate_series(1, 500) AS i
CROSS JOIN LATERAL (
  SELECT country, city
  FROM (VALUES
    ('United Kingdom', 'London'), ('United Kingdom', 'Manchester'),
    ('United Arab Emirates', 'Dubai'), ('United Arab Emirates', 'Abu Dhabi'),
    ('Germany', 'Berlin'), ('Germany', 'Munich'),
    ('United States', 'New York'), ('United States', 'Austin'),
    ('France', 'Paris'), ('Spain', 'Madrid')
  ) AS g (country, city)
  -- i keeps the subquery correlated so each customer draws its own location.
  ORDER BY random() + i * 0
  LIMIT 1
) AS geo;

INSERT INTO shop.orders (id, customer_id, status, ordered_at)
SELECT
  i,
  1 + floor(random() * 500)::int,
  CASE
    WHEN r < 0.05 THEN 'pending'
    WHEN r < 0.15 THEN 'paid'
    WHEN r < 0.25 THEN 'shipped'
    WHEN r < 0.88 THEN 'delivered'
    WHEN r < 0.96 THEN 'cancelled'
    ELSE 'refunded'
  END,
  timestamptz '2024-01-01' + (random() * 730) * interval '1 day'
FROM (SELECT i, random() AS r FROM generate_series(1, 3000) AS i) AS o;

INSERT INTO shop.order_items (id, order_id, product_id, quantity, unit_price)
SELECT
  row_number() OVER (ORDER BY o.id, n),
  o.id,
  item.product_id,
  1 + floor(random() * 3)::int,
  -- Occasional discounts so unit_price is not always the list price.
  round(p.price * (CASE WHEN random() < 0.2 THEN 0.85 ELSE 1 END), 2)
FROM shop.orders AS o
CROSS JOIN LATERAL generate_series(1, 1 + (o.id % 4)) AS n
CROSS JOIN LATERAL (SELECT 1 + floor(random() * 80)::int + n * 0 AS product_id) AS item
JOIN shop.products AS p ON p.id = item.product_id;

INSERT INTO shop.reviews (id, product_id, customer_id, rating, created_at)
SELECT
  i,
  1 + floor(random() * 80)::int,
  1 + floor(random() * 500)::int,
  -- Skewed towards 4 and 5 stars, like most real review data.
  (ARRAY[1, 2, 3, 3, 4, 4, 4, 5, 5, 5])[1 + floor(random() * 10)::int],
  timestamptz '2024-02-01' + (random() * 700) * interval '1 day'
FROM generate_series(1, 1200) AS i;

ANALYZE;
