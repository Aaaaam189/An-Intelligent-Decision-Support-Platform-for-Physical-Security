-- One database per service (same names as the dev setup); the app user owns all of them.
CREATE DATABASE IF NOT EXISTS auth_db      CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS camera_db    CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS incident_db  CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS analytics_db CHARACTER SET utf8mb4;
GRANT ALL PRIVILEGES ON auth_db.*      TO 'sentinel'@'%';
GRANT ALL PRIVILEGES ON camera_db.*    TO 'sentinel'@'%';
GRANT ALL PRIVILEGES ON incident_db.*  TO 'sentinel'@'%';
GRANT ALL PRIVILEGES ON analytics_db.* TO 'sentinel'@'%';
FLUSH PRIVILEGES;
