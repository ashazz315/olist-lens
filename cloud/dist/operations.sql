-- @views
CREATE TABLE periods(period TEXT PRIMARY KEY, start TEXT, end TEXT);
CREATE VIEW purchase_orders AS
SELECT p.period,o.* FROM periods p JOIN orders o
ON substr(o.purchased_at,1,10)>=p.start AND substr(o.purchased_at,1,10)<p.end
WHERE o.order_status IN ('approved','invoiced','processing','shipped','delivered');
CREATE VIEW purchase_items AS
SELECT o.period,o.customer_state,i.* FROM purchase_orders o
JOIN order_items i ON i.order_id=o.order_id;
-- @totals
SELECT p.period,
(SELECT COUNT(*) FROM purchase_orders o WHERE o.period=p.period) purchase_orders,
(SELECT COUNT(*) FROM purchase_items i WHERE i.period=p.period) item_units,
COALESCE((SELECT SUM(price_cents) FROM purchase_items i WHERE i.period=p.period),0) purchase_item_amount_cents,
(SELECT COUNT(*) FROM purchase_orders o WHERE o.period=p.period AND order_status='delivered' AND delivered_at IS NOT NULL AND estimated_delivery_at IS NOT NULL) delivery_eligible,
(SELECT COUNT(*) FROM purchase_orders o WHERE o.period=p.period AND order_status='delivered' AND delivered_at IS NOT NULL AND estimated_delivery_at IS NOT NULL AND substr(delivered_at,1,10)>substr(estimated_delivery_at,1,10)) late_orders
FROM periods p ORDER BY p.period;
-- @groups
SELECT period,'product' dimension,product_id key,SUM(price_cents) amount_cents,COUNT(*) units,COUNT(DISTINCT order_id) orders FROM purchase_items GROUP BY period,product_id
UNION ALL
SELECT period,'category',category,SUM(price_cents),COUNT(*),COUNT(DISTINCT order_id) FROM purchase_items GROUP BY period,category
UNION ALL
SELECT period,'seller',seller_id,SUM(price_cents),COUNT(*),COUNT(DISTINCT order_id) FROM purchase_items GROUP BY period,seller_id
UNION ALL
SELECT period,'state',customer_state,SUM(price_cents),COUNT(*),COUNT(DISTINCT order_id) FROM purchase_items GROUP BY period,customer_state;
