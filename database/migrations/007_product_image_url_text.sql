-- Allow embedded data URLs or long CDN URLs for product photos (uploads from Manage Menu).
ALTER TABLE products ALTER COLUMN image_url TYPE TEXT;
