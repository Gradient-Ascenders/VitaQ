ALTER TABLE clinics
ADD CONSTRAINT clinic_name_not_empty
CHECK (length(trim(name)) > 0);

ALTER TABLE clinics
ADD CONSTRAINT clinic_province_not_empty
CHECK (length(trim(province)) > 0);

ALTER TABLE clinics
ADD CONSTRAINT clinic_district_not_empty
CHECK (length(trim(district)) > 0);

ALTER TABLE clinics
ADD CONSTRAINT clinic_facility_type_not_empty
CHECK (length(trim(facility_type)) > 0);

ALTER TABLE clinics
ADD CONSTRAINT clinic_latitude_range
CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);

ALTER TABLE clinics
ADD CONSTRAINT clinic_longitude_range
CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

ALTER TABLE clinics
ADD CONSTRAINT clinic_contact_number_format
CHECK (contact_number IS NULL OR contact_number ~ '^[0-9+() -]{7,20}$');

ALTER TABLE clinics
ADD CONSTRAINT clinic_contact_email_format
CHECK (contact_email IS NULL OR contact_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$');