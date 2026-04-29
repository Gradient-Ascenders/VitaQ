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

function cleanTextValue(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
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

function parseServiceList(services) {
  if (!services) {
    return [];
  }

  return String(services)
    .split(/[;,]/)
    .map(formatServiceLabel)
    .filter(Boolean);
}

function normaliseDomIdPart(value) {
  return String(value || "clinic")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "clinic";
}

function buildServiceChipsMarkup(serviceList, startIndex = 0) {
  const serviceChipStyles = [
    "border-[#7dcfff]/20 bg-[#7dcfff]/10 text-[#b8ecff]",
    "border-[#7aa2f7]/20 bg-[#7aa2f7]/10 text-[#c7d8ff]",
    "border-[#bb9af7]/20 bg-[#bb9af7]/10 text-[#dfcbff]"
  ];

  return serviceList
    .map(
      (service, index) => `
        <span class="inline-flex max-w-full items-center rounded-full border px-3 py-2 text-xs font-medium leading-5 ${serviceChipStyles[(startIndex + index) % serviceChipStyles.length]}">
          <span class="block break-words">${escapeHtml(service)}</span>
        </span>
      `
    )
    .join("");
}

function renderServicesPreview(services, clinicId) {
  const serviceList = parseServiceList(services);

  if (serviceList.length === 0) {
    return `
      <p class="text-sm leading-6 text-[#8b93b8]">
        Services information not available
      </p>
    `;
  }

  const previewServices = serviceList.slice(0, 3);
  const overflowServices = serviceList.slice(3);
  const overflowCount = Math.max(serviceList.length - previewServices.length, 0);
  const previewMarkup = buildServiceChipsMarkup(previewServices);
  const overflowSectionId = `clinic-services-overflow-${normaliseDomIdPart(clinicId)}`;
  const overflowMarkup = overflowCount > 0
    ? `
        <div id="${escapeHtml(overflowSectionId)}" class="mt-2 hidden flex flex-wrap gap-2">
          ${buildServiceChipsMarkup(overflowServices, previewServices.length)}
        </div>
        <button
          type="button"
          class="mt-2 inline-flex items-center rounded-full border border-[#414868] bg-[#24283b]/80 px-3 py-2 text-xs font-semibold text-[#a9b1d6] transition hover:border-[#7aa2f7]/40 hover:text-[#e0e5ff]"
          data-service-toggle
          data-collapsed-label="+${overflowCount} more service${overflowCount === 1 ? "" : "s"}"
          data-expanded-label="Show fewer services"
          aria-expanded="false"
          aria-controls="${escapeHtml(overflowSectionId)}"
        >
          +${overflowCount} more service${overflowCount === 1 ? "" : "s"}
        </button>
      `
    : "";

  return `
    <div class="mt-3">
      <div class="flex flex-wrap gap-2">
        ${previewMarkup}
      </div>
      ${overflowMarkup}
    </div>
  `;
}

function handleServiceToggle(event) {
  const toggleButton = event.target.closest("[data-service-toggle]");

  if (!toggleButton) {
    return;
  }

  const targetId = toggleButton.getAttribute("aria-controls");

  if (!targetId) {
    return;
  }

  const overflowSection = document.getElementById(targetId);

  if (!overflowSection) {
    return;
  }

  const isExpanded = toggleButton.getAttribute("aria-expanded") === "true";
  const nextExpandedState = !isExpanded;

  toggleButton.setAttribute("aria-expanded", String(nextExpandedState));
  overflowSection.classList.toggle("hidden", !nextExpandedState);
  toggleButton.textContent = nextExpandedState
    ? toggleButton.dataset.expandedLabel || "Show fewer services"
    : toggleButton.dataset.collapsedLabel || "Show more services";
}

function formatAvailableSlotsLabel(count) {
  const numericCount = Number.isFinite(Number(count)) ? Math.max(Number(count), 0) : 0;
  return `${numericCount} slot${numericCount === 1 ? "" : "s"} available`;
}

function buildClinicLocationText(clinic) {
  const locationParts = [clinic.area, clinic.district, clinic.province]
    .map(cleanTextValue)
    .filter(Boolean);

  if (locationParts.length > 0) {
    return locationParts.join(" • ");
  }

  const broaderLocation = [clinic.municipality, clinic.region]
    .map(cleanTextValue)
    .filter(Boolean);

  if (broaderLocation.length > 0) {
    return broaderLocation.join(" • ");
  }

  return "Location details incomplete";
}

function buildClinicAddressText(clinic) {
  const address = cleanTextValue(clinic.address);

  if (address) {
    return address;
  }

  const municipality = cleanTextValue(clinic.municipality);
  const region = cleanTextValue(clinic.region);

  if (municipality && region) {
    return `${municipality} • ${region}`;
  }

  if (municipality || region) {
    return municipality || region;
  }

  return "Address not available";
}

function getClinicSummaryItems(clinic) {
  const items = [];

  if (cleanTextValue(clinic.municipality)) {
    items.push({
      label: "Municipality",
      value: cleanTextValue(clinic.municipality)
    });
  }

  if (cleanTextValue(clinic.region)) {
    items.push({
      label: "Region",
      value: cleanTextValue(clinic.region)
    });
  }

  return items;
}

function getClinicDataNote(clinic) {
  if (clinic.is_active === false) {
    return "Clinic listing may be outdated. Confirm details with the clinic before visiting.";
  }

  const missingImportantFields = [
    !cleanTextValue(clinic.address),
    !cleanTextValue(clinic.services_offered),
    !cleanTextValue(clinic.municipality) && !cleanTextValue(clinic.region)
  ].filter(Boolean).length;

  if (missingImportantFields >= 2) {
    return "Some clinic details are still being completed in the dataset.";
  }

  return "";
}

function normaliseWebsiteUrl(value) {
  const website = cleanTextValue(value);

  if (!website) {
    return "";
  }

  const withProtocol = /^https?:\/\//i.test(website) ? website : `https://${website}`;

  try {
    const url = new URL(withProtocol);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    return url.toString();
  } catch (error) {
    return "";
  }
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
      const locationText = buildClinicLocationText(clinic);
      const facilityType = cleanTextValue(clinic.facility_type) || "Facility type not available";
      const servicesMarkup = renderServicesPreview(clinic.services_offered, clinic.id);
      const address = buildClinicAddressText(clinic);
      const availableSlotsLabel = formatAvailableSlotsLabel(clinic.available_slots_count);
      const summaryItemsMarkup = getClinicSummaryItems(clinic)
        .map(
          (item) => `
            <div class="rounded-2xl border border-[#414868] bg-[#1f2335]/90 px-3 py-3">
              <p class="text-[0.65rem] uppercase tracking-[0.24em] text-[#8b93b8]">${escapeHtml(item.label)}</p>
              <p class="mt-2 text-sm font-medium text-[#e0e5ff]">${escapeHtml(item.value)}</p>
            </div>
          `
        )
        .join("");
      const websiteUrl = normaliseWebsiteUrl(clinic.contact_website);
      const dataNote = getClinicDataNote(clinic);
      const statusBadge = clinic.is_active === false
        ? `
            <p class="inline-flex rounded-2xl border border-[#f7768e]/25 bg-[#f7768e]/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f4b5c0]">
              Listing unconfirmed
            </p>
          `
        : "";
      const websiteMarkup = websiteUrl
        ? `
            <a
              href="${escapeHtml(websiteUrl)}"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-4 inline-flex self-start text-sm font-medium text-[#7dcfff] transition hover:text-[#b8ecff]"
            >
              Visit clinic website
            </a>
          `
        : "";
      const dataNoteMarkup = dataNote
        ? `
            <div class="mt-4 rounded-[1.25rem] border border-[#e0af68]/20 bg-[#e0af68]/10 px-4 py-3 text-sm text-[#f6d8a8]">
              ${escapeHtml(dataNote)}
            </div>
          `
        : "";

      return `
        <article class="flex h-full flex-col rounded-[2rem] border border-[#414868] bg-[#24283b]/72 p-6 shadow-xl shadow-black/10 backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:border-[#7aa2f7]/40 hover:bg-[#24283b]/82">
          <div class="flex items-start justify-between gap-4">
            <p class="inline-flex rounded-2xl border border-[#7dcfff]/20 bg-[#7dcfff]/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#7dcfff]">
              ${escapeHtml(facilityType)}
            </p>
            ${statusBadge}
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

          ${summaryItemsMarkup
            ? `<div class="mt-5 grid gap-3 sm:grid-cols-2">${summaryItemsMarkup}</div>`
            : ""}

          <div class="mt-5 rounded-[1.25rem] border border-[#414868] bg-[#1f2335]/85 p-4">
            <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8]">Services</p>
            ${servicesMarkup}
          </div>

          ${websiteMarkup}
          ${dataNoteMarkup}

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
    const clinicMunicipality = String(clinic.municipality || "").toLowerCase();
    const clinicRegion = String(clinic.region || "").toLowerCase();

    const matchesSearch =
      !searchValue ||
      clinicName.includes(searchValue) ||
      clinicArea.includes(searchValue) ||
      clinicDistrict.includes(searchValue) ||
      clinicProvince.includes(searchValue) ||
      clinicFacilityType.includes(searchValue) ||
      clinicServices.includes(searchValue) ||
      clinicMunicipality.includes(searchValue) ||
      clinicRegion.includes(searchValue);

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
  loadingState.textContent = "Loading clinics and location details...";

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
    errorState.textContent = "We could not load clinic directory details right now. Please try again.";
    resultsCount.textContent = "Unable to load clinics";
  }
}

searchInput.addEventListener("input", applyFilters);
provinceFilter.addEventListener("change", applyFilters);
districtFilter.addEventListener("change", applyFilters);
facilityTypeFilter.addEventListener("change", applyFilters);
clinicsList.addEventListener("click", handleServiceToggle);

document.addEventListener("DOMContentLoaded", loadClinics);
