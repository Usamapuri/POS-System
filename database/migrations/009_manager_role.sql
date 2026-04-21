-- Reintroduce manager role (floor + menu/tables + void PIN; counter role narrowed separately in app layer).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'manager', 'inventory_manager', 'counter', 'kitchen'));
