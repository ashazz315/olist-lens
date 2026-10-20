-- @schema
CREATE TABLE orders(order_id TEXT PRIMARY KEY, customer_id TEXT, customer_state TEXT, order_status TEXT, purchased_at TEXT, delivered_at TEXT, estimated_delivery_at TEXT);
CREATE TABLE order_items(order_id TEXT, order_item_id INTEGER, product_id TEXT, seller_id TEXT, category TEXT, price_cents INTEGER, freight_cents INTEGER, PRIMARY KEY(order_id,order_item_id));
CREATE TABLE order_reviews(review_id TEXT, order_id TEXT, review_score INTEGER, review_created_at TEXT, review_answered_at TEXT, PRIMARY KEY(review_id,order_id));
-- @views
CREATE VIEW order_facts AS
WITH amounts AS (SELECT order_id,SUM(price_cents) amount_cents FROM order_items GROUP BY order_id),
ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY order_id ORDER BY COALESCE(review_answered_at,'') DESC, COALESCE(review_created_at,'') DESC,review_id DESC) rn FROM order_reviews)
SELECT o.*,COALESCE(a.amount_cents,0) amount_cents,r.review_score,
CASE WHEN o.order_status='delivered' AND o.delivered_at IS NOT NULL AND o.estimated_delivery_at IS NOT NULL
THEN CASE WHEN substr(o.delivered_at,1,10)>substr(o.estimated_delivery_at,1,10) THEN 1 ELSE 0 END END late
FROM orders o LEFT JOIN amounts a ON a.order_id=o.order_id LEFT JOIN ranked r ON r.order_id=o.order_id AND r.rn=1;
-- @metrics
SELECT COUNT(*) total_orders,COALESCE(SUM(order_status='delivered'),0) delivered_orders,
COALESCE(SUM(CASE WHEN order_status='delivered' THEN amount_cents ELSE 0 END),0) amount_cents,
COALESCE(SUM(late IS NOT NULL),0) delivery_eligible,COALESCE(SUM(late=1),0) late_orders,
COALESCE(SUM(order_status='delivered' AND review_score IS NOT NULL),0) review_eligible,
COALESCE(SUM(order_status='delivered' AND review_score<=2),0) low_reviews FROM order_facts;
-- @monthly
SELECT substr(purchased_at,1,7) month,COUNT(*) total_orders,SUM(order_status='delivered') delivered_orders,
SUM(CASE WHEN order_status='delivered' THEN amount_cents ELSE 0 END) amount_cents,
SUM(late IS NOT NULL) delivery_eligible,COALESCE(SUM(late=1),0) late_orders,
SUM(order_status='delivered' AND review_score IS NOT NULL) review_eligible,
COALESCE(SUM(order_status='delivered' AND review_score<=2),0) low_reviews
FROM order_facts GROUP BY month ORDER BY month;
-- @states
SELECT COALESCE(customer_state,'未标注') state,COUNT(*) total_orders,SUM(order_status='delivered') delivered_orders,
SUM(late IS NOT NULL) delivery_eligible,COALESCE(SUM(late=1),0) late_orders,
SUM(order_status='delivered' AND review_score IS NOT NULL) review_eligible,
COALESCE(SUM(order_status='delivered' AND review_score<=2),0) low_reviews
FROM order_facts GROUP BY state ORDER BY late_orders DESC,state;
-- @association
SELECT CASE WHEN late=1 THEN 'late' ELSE 'on_time' END delivery_group,COUNT(*) n,SUM(review_score<=2) low
FROM order_facts WHERE late IS NOT NULL AND review_score IS NOT NULL GROUP BY late ORDER BY late;
-- @strata
SELECT substr(purchased_at,1,7) month,COALESCE(customer_state,'未标注') state,late,COUNT(*) n,SUM(review_score<=2) low
FROM order_facts WHERE late IS NOT NULL AND review_score IS NOT NULL GROUP BY month,state,late ORDER BY month,state,late;
-- @statuses
SELECT order_status status,COUNT(*) n FROM orders GROUP BY status ORDER BY n DESC;
-- @samples
SELECT order_id,customer_state,order_status,purchased_at,delivered_at,estimated_delivery_at,amount_cents,late,review_score FROM order_facts ORDER BY purchased_at DESC,order_id LIMIT 100;
-- @seller
SELECT COALESCE(i.seller_id,'未标注') label,COUNT(*) orders,SUM(f.late IS NOT NULL) delivery_eligible,COALESCE(SUM(f.late=1),0) late_orders
FROM (SELECT DISTINCT order_id,seller_id FROM order_items) i JOIN order_facts f ON f.order_id=i.order_id GROUP BY label ORDER BY late_orders DESC,label LIMIT 10;
-- @category
SELECT COALESCE(i.category,'未标注') label,COUNT(*) orders,SUM(f.late IS NOT NULL) delivery_eligible,COALESCE(SUM(f.late=1),0) late_orders
FROM (SELECT DISTINCT order_id,category FROM order_items) i JOIN order_facts f ON f.order_id=i.order_id GROUP BY label ORDER BY late_orders DESC,label LIMIT 10;
