-- Consolidate staff roles to four: admin, inventory_manager, counter, kitchen.
-- Maps legacy roles before tightening the CHECK constraint.

UPDATE users SET role = 'admin' WHERE role = 'manager';
UPDATE users SET role = 'counter' WHERE role = 'server';
UPDATE users SET role = 'inventory_manager' WHERE role = 'store_manager';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'inventory_manager', 'counter', 'kitchen'));
