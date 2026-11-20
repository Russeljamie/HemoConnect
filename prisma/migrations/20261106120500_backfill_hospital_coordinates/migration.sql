-- Coordinates are sourced from OpenStreetMap; map tiles include OSM attribution.
UPDATE "Hospital"
SET
  "latitude" = COALESCE("latitude", -1.3008309),
  "longitude" = COALESCE("longitude", 36.8072359)
WHERE "name" = 'Kenyatta National Hospital';

UPDATE "Hospital"
SET
  "latitude" = COALESCE("latitude", -1.2745532),
  "longitude" = COALESCE("longitude", 36.8992464)
WHERE "name" = 'Mama Lucy Kibaki Hospital';

UPDATE "Hospital"
SET
  "latitude" = COALESCE("latitude", -1.3090430),
  "longitude" = COALESCE("longitude", 36.8033053)
WHERE "name" = 'Mbagathi Hospital';

UPDATE "Hospital"
SET
  "latitude" = COALESCE("latitude", -1.2617938),
  "longitude" = COALESCE("longitude", 36.8238411)
WHERE "name" = 'Aga Khan University Hospital';

UPDATE "Hospital"
SET
  "latitude" = COALESCE("latitude", -1.2635968),
  "longitude" = COALESCE("longitude", 36.8120936)
WHERE "name" = 'MP Shah Hospital';
