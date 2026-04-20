-- Optional profile image for staff (HTTPS URL or data:image/* from small uploads)
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- Demo-friendly avatars for default seed usernames (Twemoji PNGs via jsDelivr CDN)
UPDATE users SET profile_image_url = CASE username
  WHEN 'admin' THEN 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f60e.png'
  WHEN 'inventory1' THEN 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f917.png'
  WHEN 'counter1' THEN 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f606.png'
  WHEN 'counter2' THEN 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f60a.png'
  WHEN 'kitchen1' THEN 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f973.png'
  ELSE profile_image_url
END
WHERE username IN ('admin','inventory1','counter1','counter2','kitchen1')
  AND (profile_image_url IS NULL OR TRIM(profile_image_url) = '');
