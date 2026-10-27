-- Demo e-commerce schema. Everything the model may query lives in "shop".
CREATE SCHEMA shop;

CREATE TABLE shop.categories (
  id   integer PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE shop.products (
  id          integer PRIMARY KEY,
  category_id integer NOT NULL REFERENCES shop.categories (id),
  name        text NOT NULL,
  sku         text NOT NULL UNIQUE,
  price       numeric(10, 2) NOT NULL CHECK (price > 0),
  created_at  timestamptz NOT NULL
);

CREATE TABLE shop.customers (
  id         integer PRIMARY KEY,
  first_name text NOT NULL,
  last_name  text NOT NULL,
  email      text NOT NULL UNIQUE,
  country    text NOT NULL,
  city       text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE shop.orders (
  id          integer PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES shop.customers (id),
  status      text NOT NULL CHECK (
    status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')
  ),
  ordered_at  timestamptz NOT NULL
);

CREATE TABLE shop.order_items (
  id         integer PRIMARY KEY,
  order_id   integer NOT NULL REFERENCES shop.orders (id),
  product_id integer NOT NULL REFERENCES shop.products (id),
  quantity   integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(10, 2) NOT NULL CHECK (unit_price > 0)
);

CREATE TABLE shop.reviews (
  id          integer PRIMARY KEY,
  product_id  integer NOT NULL REFERENCES shop.products (id),
  customer_id integer NOT NULL REFERENCES shop.customers (id),
  rating      integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at  timestamptz NOT NULL
);

CREATE INDEX ON shop.products (category_id);
CREATE INDEX ON shop.orders (customer_id);
CREATE INDEX ON shop.orders (ordered_at);
CREATE INDEX ON shop.order_items (order_id);
CREATE INDEX ON shop.order_items (product_id);
CREATE INDEX ON shop.reviews (product_id);

COMMENT ON TABLE shop.orders IS 'One row per checkout. Revenue should only count paid, shipped and delivered orders.';
COMMENT ON COLUMN shop.order_items.unit_price IS 'Price paid per unit at order time; can differ from the current product price.';
COMMENT ON COLUMN shop.orders.status IS 'pending, paid, shipped, delivered, cancelled or refunded';
