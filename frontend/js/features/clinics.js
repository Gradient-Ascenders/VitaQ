// Clinics listing page.
// The page loads the clinic dataset once, then applies search/filter logic in the browser.
const searchInput = document.getElementById("searchInput");
const provinceFilter = document.getElementById("provinceFilter");
const districtFilter = document.getElementById("districtFilter");
const facilityTypeFilter = document.getElementById("facilityTypeFilter");

const resultsCount = document.getElementById("resultsCount");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const emptyState = document.getElementById("emptyState");
const clinicsList = document.getElementById("clinicsList");

let allClinics = [];

// Support both raw arrays and { data: [...] } payloads while backend responses stay lightweight.
function normaliseClinicResponse(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.data)) {
    return payload.data;
  }

  return [];
}

function uniqueSortedValues(items, key) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

function fillSelectOptions(selectElement, values, defaultLabel) {
  selectElement.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = defaultLabel;
  selectElement.append(defaultOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectElement.append(option);
  });
}

// Escape database-backed values before inserting them into template strings.
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatServiceLabel(service) {
  const cleaned = String(service || "")
    .replaceAll("_", " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function formatServicesSummary(services) {
  if (!services) {
    return "Services information not available";
  }

  const serviceList = String(services)
    .split(";")
    .map(formatServiceLabel)
    .filter(Boolean);

  if (serviceList.length === 0) {
    return "Services information not available";
  }

  return serviceList.slice(0, 3).join(" • ");
}

function formatAvailableSlotsLabel(count) {
  const numericCount = Number.isFinite(Number(count)) ? Math.max(Number(count), 0) : 0;
  return `${numericCount} slot${numericCount === 1 ? "" : "s"} available`;
}

// Sort clinics with the most available slots first so patients see bookable options sooner.
function sortClinicsByAvailability(clinics) {
  return [...clinics].sort((leftClinic, rightClinic) => {
    const leftAvailableSlots = Math.max(Number(leftClinic?.available_slots_count) || 0, 0);
    const rightAvailableSlots = Math.max(Number(rightClinic?.available_slots_count) || 0, 0);

    if (leftAvailableSlots !== rightAvailableSlots) {
      return rightAvailableSlots - leftAvailableSlots;
    }

    return String(leftClinic?.name || "").localeCompare(String(rightClinic?.name || ""));
  });
}

// Render the currently visible clinic cards from the filtered clinic set.
function renderClinics(clinics) {
  clinicsList.innerHTML = "";

  if (clinics.length === 0) {
    clinicsList.classList.add("hidden");
    emptyState.classList.remove("hidden");
    resultsCount.textContent = "0 clinics found";
    return;
  }

  clinicsList.classList.remove("hidden");
  emptyState.classList.add("hidden");
  resultsCount.textContent = `${clinics.length} clinic${clinics.length === 1 ? "" : "s"} found`;

  const cardsMarkup = clinics
    .map((clinic) => {
      const locationParts = [clinic.area, clinic.district, clinic.province].filter(Boolean);
      const locationText = locationParts.length > 0 ? locationParts.join(" • ") : "Location not available";
      const facilityType = clinic.facility_type || "Facility type not available";
      const services = formatServicesSummary(clinic.services_offered);
      const address = clinic.address || "Address not available";
      const availableSlotsLabel = formatAvailableSlotsLabel(clinic.available_slots_count);

      return `
        <article class="flex h-full flex-col rounded-[2rem] border border-[#414868] bg-[#24283b]/72 p-6 shadow-xl shadow-black/10 backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:border-[#7aa2f7]/40 hover:bg-[#24283b]/82">
          <div class="flex items-start justify-between gap-4">
            <p class="inline-flex rounded-2xl border border-[#7dcfff]/20 bg-[#7dcfff]/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#7dcfff]">
              ${escapeHtml(facilityType)}
            </p>
          </div>

          <h3 class="mt-4 text-2xl font-semibold text-[#e0e5ff]">
            ${escapeHtml(clinic.name || "Unnamed Clinic")}
          </h3>

          <p class="mt-3 text-sm text-[#a9b1d6]">
            ${escapeHtml(locationText)}
          </p>

          <p class="mt-2 text-sm text-[#8b93b8]">
            ${escapeHtml(address)}
          </p>

          <div class="mt-5 rounded-[1.25rem] border border-[#414868] bg-[#1f2335]/85 p-4">
            <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8]">Services</p>
            <p class="mt-2 text-sm leading-6 break-words text-[#c0caf5]">
              ${escapeHtml(services)}
            </p>
          </div>

          <p class="mt-4 text-sm font-medium text-[#b8ecff]">
            ${escapeHtml(availableSlotsLabel)}
          </p>

          <a
            href="/clinic/${encodeURIComponent(clinic.id)}"
            class="mt-6 inline-flex self-start rounded-2xl bg-gradient-to-r from-[#7aa2f7] to-[#bb9af7] px-5 py-3 text-sm font-semibold text-[#1a1b26] transition hover:scale-[1.02] hover:brightness-110"
          >
            View slots
          </a>
        </article>
      `;
    })
    .join("");

  clinicsList.innerHTML = cardsMarkup;
}

// Search and dropdown filters run entirely client-side after the first clinic fetch.
function applyFilters() {
  const searchValue = searchInput.value.trim().toLowerCase();
  const provinceValue = provinceFilter.value.trim().toLowerCase();
  const districtValue = districtFilter.value.trim().toLowerCase();
  const facilityTypeValue = facilityTypeFilter.value.trim().toLowerCase();

  const filteredClinics = allClinics.filter((clinic) => {
    const clinicName = String(clinic.name || "").toLowerCase();
    const clinicProvince = String(clinic.province || "").toLowerCase();
    const clinicDistrict = String(clinic.district || "").toLowerCase();
    const clinicArea = String(clinic.area || "").toLowerCase();
    const clinicFacilityType = String(clinic.facility_type || "").toLowerCase();
    const clinicServices = String(clinic.services_offered || "").toLowerCase();

    const matchesSearch =
      !searchValue ||
      clinicName.includes(searchValue) ||
      clinicArea.includes(searchValue) ||
      clinicDistrict.includes(searchValue) ||
      clinicServices.includes(searchValue);

    const matchesProvince = !provinceValue || clinicProvince === provinceValue;
    const matchesDistrict =
      !districtValue || clinicDistrict === districtValue || clinicArea === districtValue;
    const matchesFacilityType =
      !facilityTypeValue || clinicFacilityType === facilityTypeValue;

    return matchesSearch && matchesProvince && matchesDistrict && matchesFacilityType;
  });

  renderClinics(sortClinicsByAvailability(filteredClinics));
}

// Build filter options from the live clinic dataset instead of hard-coding provinces or facility types.
function initialiseFilters(clinics) {
  const provinces = uniqueSortedValues(clinics, "province");
  const districtsAndAreas = [
    ...new Set([
      ...uniqueSortedValues(clinics, "district"),
      ...uniqueSortedValues(clinics, "area")
    ])
  ].sort((a, b) => String(a).localeCompare(String(b)));

  const facilityTypes = uniqueSortedValues(clinics, "facility_type");

  fillSelectOptions(provinceFilter, provinces, "All Provinces");
  fillSelectOptions(districtFilter, districtsAndAreas, "All Districts");
  fillSelectOptions(facilityTypeFilter, facilityTypes, "All Facility Types");
}

// Initial load fetches clinics, prepares filters, and renders the default availability-sorted view.
async function loadClinics() {
  loadingState.classList.remove("hidden");
  errorState.classList.add("hidden");
  emptyState.classList.add("hidden");
  clinicsList.classList.add("hidden");
  resultsCount.textContent = "Loading clinics...";

  try {
    const response = await fetch("/api/clinics");

    if (!response.ok) {
      throw new Error(`Failed to load clinics: ${response.status}`);
    }

    const payload = await response.json();
    allClinics = sortClinicsByAvailability(normaliseClinicResponse(payload));

    initialiseFilters(allClinics);
    renderClinics(allClinics);

    loadingState.classList.add("hidden");
  } catch (error) {
    console.error("Clinic load error:", error);
    loadingState.classList.add("hidden");
    clinicsList.classList.add("hidden");
    emptyState.classList.add("hidden");
    errorState.classList.remove("hidden");
    resultsCount.textContent = "Unable to load clinics";
  }
}

searchInput.addEventListener("input", applyFilters);
provinceFilter.addEventListener("change", applyFilters);
districtFilter.addEventListener("change", applyFilters);
facilityTypeFilter.addEventListener("change", applyFilters);

document.addEventListener("DOMContentLoaded", loadClinics);
