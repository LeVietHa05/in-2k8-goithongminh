-- Thêm timestamp vào sleepData
ALTER TABLE sleepData
ADD COLUMN timestamp INTEGER;

-- Thêm timestamp vào sleepStatistic
ALTER TABLE sleepStatistic
ADD COLUMN timestamp INTEGER;

UPDATE sleepData SET timestamp = strftime('%s','now') WHERE timestamp IS NULL;
UPDATE sleepStatistic SET timestamp = strftime('%s','now') WHERE timestamp IS NULL;
