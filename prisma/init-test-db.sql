-- Automatically create separate test database for local test runs
CREATE DATABASE stackhr_test;
GRANT ALL PRIVILEGES ON DATABASE stackhr_test TO postgres;
