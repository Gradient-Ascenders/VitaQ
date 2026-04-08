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

    return `
      <article class="flex h-full flex-col rounded-[1.75rem] border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-950/40 backdrop-blur">
        <p class="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
          ${escapeHtml(facilityType)}
        </p>

        <h3 class="mt-3 text-2xl font-semibold text-white">
          ${escapeHtml(clinic.name || "Unnamed Clinic")}
        </h3>

        <p class="mt-3 text-sm text-slate-300">
          ${escapeHtml(locationText)}
        </p>

        <p class="mt-2 text-sm text-slate-400">
          ${escapeHtml(address)}
        </p>

        <p class="mt-4 text-sm leading-6 text-slate-300 break-words">
          ${escapeHtml(services)}
        </p>

        <a
          href="/clinic/${encodeURIComponent(clinic.id)}"
          class="mt-6 inline-flex self-start rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
        >
          View Slots
        </a>
      </article>
    `;
  })
  .join("");

  clinicsList.innerHTML = cardsMarkup;
}

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

  renderClinics(filteredClinics);
}

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
    allClinics = normaliseClinicResponse(payload);

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