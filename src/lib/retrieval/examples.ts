/**
 * Hand-written question/SQL pairs used as few-shot examples. They teach the
 * model this schema's conventions (which statuses count as revenue, that
 * order_items.unit_price is the price paid). Keep them distinct from the
 * eval cases in evals/cases.json, otherwise the evals measure recall of the
 * examples instead of SQL generation.
 */
export interface ExampleQuery {
  id: string;
  question: string;
  sql: string;
}

export const EXAMPLE_QUERIES: ExampleQuery[] = [
  {
    id: "revenue-by-category",
    question: "What is the total revenue per product category?",
    sql: `SELECT c.name AS category, sum(oi.quantity * oi.unit_price) AS revenue
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
JOIN categories c ON c.id = p.category_id
WHERE o.status IN ('paid', 'shipped', 'delivered')
GROUP BY c.name
ORDER BY revenue DESC`,
  },
  {
    id: "weekly-orders-2025",
    question: "How many orders were placed each week in March 2025?",
    sql: `SELECT date_trunc('week', ordered_at) AS week, count(*) AS orders
FROM orders
WHERE ordered_at >= '2025-03-01' AND ordered_at < '2025-04-01'
GROUP BY week
ORDER BY week`,
  },
  {
    id: "customers-without-orders",
    question: "Which customers have never placed an order?",
    sql: `SELECT c.id, c.first_name, c.last_name, c.email
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)
ORDER BY c.id`,
  },
  {
    id: "lowest-rated-products",
    question:
      "Which 5 products have the lowest average rating, with at least 10 reviews?",
    sql: `SELECT p.name, round(avg(r.rating), 2) AS avg_rating, count(*) AS reviews
FROM reviews r
JOIN products p ON p.id = r.product_id
GROUP BY p.id, p.name
HAVING count(*) >= 10
ORDER BY avg_rating ASC
LIMIT 5`,
  },
  {
    id: "average-basket-by-city",
    question: "What is the average order value in each city?",
    sql: `WITH order_totals AS (
  SELECT o.id, o.customer_id, sum(oi.quantity * oi.unit_price) AS total
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.status IN ('paid', 'shipped', 'delivered')
  GROUP BY o.id, o.customer_id
)
SELECT c.city, round(avg(t.total), 2) AS avg_order_value
FROM order_totals t
JOIN customers c ON c.id = t.customer_id
GROUP BY c.city
ORDER BY avg_order_value DESC`,
  },
  {
    id: "discounted-share",
    question: "What share of order lines were sold below the list price?",
    sql: `SELECT round(100.0 * count(*) FILTER (WHERE oi.unit_price < p.price) / count(*), 1) AS discounted_percent
FROM order_items oi
JOIN products p ON p.id = oi.product_id`,
  },
];
