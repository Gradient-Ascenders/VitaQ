import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";

// ---------- config ----------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Raw CSV from the dataset repo
const DATASET_URL =
  "https://raw.githubusercontent.com/dsfsi/covid19za/master/data/health_system_za_hospitals_v1.csv";

const SOURCE_DATASET = "dsfsi/covid19za health_system_za_hospitals_v1.csv";

// ---------- guards ----------
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === "" ? null : str;
}

function cleanNumeric(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function makeSourceRecordId(row, index) {
  const name = cleanText(row["Name"]) ?? "unknown";
  const province = cleanText(row["Province"]) ?? "unknown";
  const district = cleanText(row["District"]) ?? "unknown";

  return `${index + 1}::${name}::${province}::${district}`
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function mapRow(row, index) {
  return {
    name: cleanText(row["Name"]),
    province: cleanText(row["Province"]),
    district: cleanText(row["District"]),
    area: cleanText(row["Subdistrict"]),
    municipality: cleanText(row["Subdistrict"]),
    facility_type: cleanText(row["Category"]),
    address: null, // source file does not provide a clean address column
    services_offered: cleanText(row["Main Health care Services Offered"]),
    latitude: cleanNumeric(row["Lat"]),
    longitude: cleanNumeric(row["Long"]),
    region: cleanText(row["Geo_subdivision"]),
    contact_website: cleanText(row["Webpage"]),
    source_dataset: SOURCE_DATASET,
    source_record_id: makeSourceRecordId(row, index),
    source_last_updated: new Date().toISOString(),
    is_active: true,
  };
}

async function fetchCsv() {
  const response = await fetch(DATASET_URL);

  if (!response.ok) {
    throw new Error(`Failed to download dataset: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

async function clearOldClinicData() {
  // This only clears clinics.
  // If your DB has foreign key references from appointments/slots/etc,
  // clear dependent demo rows first or adjust your process.
  const { error } = await supabase
    .from("clinics")
    .delete()
    .not("id", "is", null);

  if (error) {
    throw new Error(`Failed to clear old clinic rows: ${error.message}`);
  }
}

async function insertClinics(rows) {
  const batchSize = 500;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const { error } = await supabase.from("clinics").insert(batch);

    if (error) {
      throw new Error(
        `Failed inserting batch ${i / batchSize + 1}: ${error.message}`
      );
    }

    console.log(`Inserted batch ${i / batchSize + 1} (${batch.length} rows)`);
  }
}

async function main() {
  console.log("Downloading SA clinic dataset...");
  const csvText = await fetchCsv();

  console.log("Parsing CSV...");
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  console.log(`Parsed ${records.length} raw rows`);

  const mapped = records
    .map((row, index) => mapRow(row, index))
    .filter((row) => row.name && row.province && row.district && row.facility_type);

  console.log(`Mapped ${mapped.length} valid clinic rows`);

  console.log("Deleting old clinic rows...");
  await clearOldClinicData();

  console.log("Inserting new clinic rows...");
  await insertClinics(mapped);

  console.log("Done. SA clinic dataset imported successfully.");
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});