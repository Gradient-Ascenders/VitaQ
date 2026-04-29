ALTER TABLE clinics
ADD CONSTRAINT clinic_latitude_range
CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);

ALTER TABLE clinics
ADD CONSTRAINT clinic_longitude_range
CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);