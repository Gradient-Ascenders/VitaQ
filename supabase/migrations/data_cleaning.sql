UPDATE clinics
SET province = 'KwaZulu-Natal'
WHERE province = 'KwaZuluNatal';

UPDATE clinics
SET area = 'Senqu Local Municipality',
    municipality = 'Senqu Local Municipality'
WHERE area = 'Senqu Local Municipali'
   OR municipality = 'Senqu Local Municipali';

UPDATE clinics
SET area = 'Sol Plaatje Local Municipality',
    municipality = 'Sol Plaatje Local Municipality'
WHERE area = 'Sol Plaatjie Local Municipality'
   OR municipality = 'Sol Plaatjie Local Municipality';

UPDATE clinics
SET area = replace(area, 'HealthSub-District', 'Health Sub-District'),
    municipality = replace(municipality, 'HealthSub-District', 'Health Sub-District')
WHERE area LIKE '%HealthSub-District%'
   OR municipality LIKE '%HealthSub-District%';