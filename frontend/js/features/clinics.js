// Clinics listing page.
// The page loads the clinic dataset once, then applies search/filter logic in the browser.
const searchInput = document.getElementById("searchInput");
const provinceFilter = document.getElementById("provinceFilter");
const districtFilter = document.getElementById("districtFilter");
const facilityTypeFilter = document.getElementById("facilityTypeFilter");
const useLocationButton = document.getElementById("useLocationButton");
const clearLocationButton = document.getElementById("clearLocationButton");
const locationStatus = document.getElementById("locationStatus");
const nearestClinicResults = document.getElementById("nearestClinicResults");
const nearestClinicCard = document.getElementById("nearestClinicCard");
const nearestClinicStats = document.getElementById("nearestClinicStats");
const nearbyClinicsList = document.getElementById("nearbyClinicsList");

const resultsCount = document.getElementById("resultsCount");
const resultsFeedback = document.getElementById("resultsFeedback");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const emptyState = document.getElementById("emptyState");
const emptyStateTitle = document.getElementById("emptyStateTitle");
const emptyStateMessage = document.getElementById("emptyStateMessage");
const clinicsList = document.getElementById("clinicsList");
const loadMoreState = document.getElementById("loadMoreState");

const CLINIC_RESULTS_PAGE_SIZE = 40;

let allClinics = [];
let userLocation = null;
let isLocationRequestPending = false;
let visibleClinicCount = CLINIC_RESULTS_PAGE_SIZE;
let lastRenderedClinics = [];
let lastNearestContext = {
  mode: "manual",
  hasNearestOrdering: false,
  clinicsWithDistanceCount: 0,
  clinicsWithNearestRankCount: 0,
  clinicsWithoutDistanceCount: 0
};
let loadMoreObserver = null;

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

function parseCoordinate(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function parsePositiveNumber(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return null;
  }

  return numericValue;
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

// Some imported dataset rows contain generic notes instead of real service names.
// Treat those notes as unavailable services so the UI shows a clean fallback message.
function isUnavailableServiceText(value) {
  const text = String(value || "").toLowerCase().trim();

  return (
    !text ||
    text.includes("could not be found") ||
    text.includes("visit their website") ||
    text.includes("relevant private facility services") ||
    text.includes("services for this public hospital")
  );
}

function parseServiceList(services) {
  if (isUnavailableServiceText(services)) {
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
    "border-[#7dcfff]/25 bg-[#7dcfff]/12 text-[#b8ecff]",
    "border-[#7aa2f7]/25 bg-[#7aa2f7]/12 text-[#c7d8ff]",
    "border-[#bb9af7]/25 bg-[#bb9af7]/12 text-[#dfcbff]",
    "border-[#9ece6a]/25 bg-[#9ece6a]/12 text-[#d6f3b8]",
    "border-[#e0af68]/25 bg-[#e0af68]/12 text-[#f6d8a8]",
    "border-[#f7768e]/25 bg-[#f7768e]/12 text-[#f4b5c0]"
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
        Services not available for this clinic
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

function hasClinicCoordinates(clinic) {
  return parseCoordinate(clinic?.latitude) !== null && parseCoordinate(clinic?.longitude) !== null;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(fromLatitude, fromLongitude, toLatitude, toLongitude) {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const startLatitude = toRadians(fromLatitude);
  const endLatitude = toRadians(toLatitude);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

function formatDistanceLabel(distanceKm) {
  if (!Number.isFinite(distanceKm)) {
    return "Distance unavailable";
  }

  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m away`;
  }

  return `${distanceKm.toFixed(1)} km away`;
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

function buildClinicDistanceBadge(clinic) {
  if (!Number.isFinite(clinic?.distance_km)) {
    return "";
  }

  return `
    <p class="inline-flex rounded-2xl border border-[#9ece6a]/30 bg-[#9ece6a]/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d6f3b8]">
      ${escapeHtml(formatDistanceLabel(clinic.distance_km))}
    </p>
  `;
}

function getBackendDistanceKm(clinic) {
  const kilometerDistanceFields = [
    clinic?.distance_km,
    clinic?.distanceKm,
    clinic?.distance
  ];

  for (const value of kilometerDistanceFields) {
    const parsedValue = parsePositiveNumber(value);

    if (parsedValue !== null) {
      return parsedValue;
    }
  }

  const meterDistanceFields = [clinic?.distance_meters, clinic?.distanceMeters];

  for (const value of meterDistanceFields) {
    const parsedValue = parsePositiveNumber(value);

    if (parsedValue !== null) {
      return parsedValue / 1000;
    }
  }

  return null;
}

function getBackendNearestRank(clinic) {
  const parsedValue = parsePositiveNumber(clinic?.nearest_rank ?? clinic?.nearestRank);

  if (parsedValue === null) {
    return null;
  }

  const nearestRank = Math.floor(parsedValue);
  return nearestRank >= 1 ? nearestRank : null;
}

function hasClinicDistance(clinic) {
  return Number.isFinite(clinic?.distance_km);
}

function hasClinicNearestRank(clinic) {
  return Number.isFinite(clinic?.nearest_rank);
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

function decorateClinicsWithDistance(clinics) {
  return clinics.map((clinic) => {
    const backendDistanceKm = getBackendDistanceKm(clinic);
    const backendNearestRank = getBackendNearestRank(clinic);

    if (backendDistanceKm !== null) {
      return {
        ...clinic,
        distance_km: backendDistanceKm,
        distance_source: "backend",
        nearest_rank: backendNearestRank
      };
    }

    if (!userLocation || !hasClinicCoordinates(clinic)) {
      return {
        ...clinic,
        distance_km: null,
        distance_source: null,
        nearest_rank: backendNearestRank
      };
    }

    return {
      ...clinic,
      distance_km: calculateDistanceKm(
        userLocation.latitude,
        userLocation.longitude,
        Number(clinic.latitude),
        Number(clinic.longitude)
      ),
      distance_source: "browser",
      nearest_rank: backendNearestRank
    };
  });
}

function sortClinicsByDistance(clinics) {
  return [...clinics].sort((leftClinic, rightClinic) => {
    const leftRank = hasClinicNearestRank(leftClinic)
      ? leftClinic.nearest_rank
      : Number.POSITIVE_INFINITY;
    const rightRank = hasClinicNearestRank(rightClinic)
      ? rightClinic.nearest_rank
      : Number.POSITIVE_INFINITY;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftDistance = Number.isFinite(leftClinic?.distance_km)
      ? leftClinic.distance_km
      : Number.POSITIVE_INFINITY;
    const rightDistance = Number.isFinite(rightClinic?.distance_km)
      ? rightClinic.distance_km
      : Number.POSITIVE_INFINITY;

    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    const leftAvailableSlots = Math.max(Number(leftClinic?.available_slots_count) || 0, 0);
    const rightAvailableSlots = Math.max(Number(rightClinic?.available_slots_count) || 0, 0);

    if (leftAvailableSlots !== rightAvailableSlots) {
      return rightAvailableSlots - leftAvailableSlots;
    }

    return String(leftClinic?.name || "").localeCompare(String(rightClinic?.name || ""));
  });
}

function buildNearestSearchContext(clinics) {
  const clinicsWithDistanceCount = clinics.filter(hasClinicDistance).length;
  const clinicsWithNearestRankCount = clinics.filter(hasClinicNearestRank).length;
  const hasBrowserNearestData = clinics.some((clinic) => clinic.distance_source === "browser");
  const hasBackendNearestData = clinics.some(
    (clinic) => clinic.distance_source === "backend" || hasClinicNearestRank(clinic)
  );
  const hasNearestOrdering = clinicsWithDistanceCount > 0 || clinicsWithNearestRankCount > 0;

  return {
    mode: hasBrowserNearestData ? "browser" : hasBackendNearestData ? "backend" : "manual",
    hasNearestOrdering,
    clinicsWithDistanceCount,
    clinicsWithNearestRankCount,
    clinicsWithoutDistanceCount: Math.max(clinics.length - clinicsWithDistanceCount, 0)
  };
}

function annotateNearestDisplayRank(clinics) {
  const nearestRankByClinicId = new Map();

  sortClinicsByDistance(
    clinics.filter((clinic) => hasClinicDistance(clinic) || hasClinicNearestRank(clinic))
  ).forEach((clinic, index) => {
    nearestRankByClinicId.set(clinic.id, index + 1);
  });

  return clinics.map((clinic) => ({
    ...clinic,
    nearest_display_rank: nearestRankByClinicId.get(clinic.id) || null
  }));
}

function setLocationStatus(message, tone = "info") {
  const toneStyles = {
    info: "border-[#7dcfff]/20 bg-[#7dcfff]/10 text-[#b8ecff]",
    success: "border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]",
    warning: "border-[#e0af68]/20 bg-[#e0af68]/10 text-[#f6d8a8]",
    error: "border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]"
  };

  locationStatus.className = `mt-6 rounded-[1.5rem] border px-5 py-4 text-sm ${toneStyles[tone] || toneStyles.info}`;
  locationStatus.textContent = message;
}

function setResultsFeedback(message, tone = "info") {
  if (!message) {
    resultsFeedback.textContent = "";
    resultsFeedback.className = "mt-6 hidden rounded-3xl border px-6 py-5 text-sm";
    return;
  }

  const toneStyles = {
    info: "border-[#7dcfff]/20 bg-[#7dcfff]/10 text-[#b8ecff]",
    success: "border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]",
    warning: "border-[#e0af68]/20 bg-[#e0af68]/10 text-[#f6d8a8]",
    error: "border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]"
  };

  resultsFeedback.className = `mt-6 rounded-3xl border px-6 py-5 text-sm ${toneStyles[tone] || toneStyles.info}`;
  resultsFeedback.textContent = message;
}

function clearNearestClinicPanel() {
  nearestClinicResults.classList.add("hidden");
  nearestClinicCard.innerHTML = "";
  nearestClinicStats.innerHTML = "";
  nearbyClinicsList.innerHTML = "";
}

function resetVisibleClinicCount() {
  visibleClinicCount = CLINIC_RESULTS_PAGE_SIZE;
}

function getVisibleClinics(clinics) {
  return clinics.slice(0, visibleClinicCount);
}

function showLoadMoreState(message) {
  loadMoreState.textContent = message;
  loadMoreState.classList.remove("hidden");
}

function hideLoadMoreState() {
  loadMoreState.textContent = "";
  loadMoreState.classList.add("hidden");
}

function updateLoadMoreState(totalClinicCount, visibleClinicTotal) {
  if (totalClinicCount <= 0) {
    hideLoadMoreState();
    return;
  }

  if (visibleClinicTotal < totalClinicCount) {
    const remainingClinicCount = totalClinicCount - visibleClinicTotal;
    const nextBatchSize = Math.min(CLINIC_RESULTS_PAGE_SIZE, remainingClinicCount);
    showLoadMoreState(
      `Scroll down to load ${nextBatchSize} more clinic${nextBatchSize === 1 ? "" : "s"}. Showing ${visibleClinicTotal} of ${totalClinicCount}.`
    );
    return;
  }

  if (totalClinicCount > CLINIC_RESULTS_PAGE_SIZE) {
    showLoadMoreState(`Showing all ${totalClinicCount} clinics.`);
    return;
  }

  hideLoadMoreState();
}

function updateLocationButtons() {
  useLocationButton.disabled = isLocationRequestPending || allClinics.length === 0;
  useLocationButton.textContent = isLocationRequestPending
    ? "Finding nearby clinics..."
    : userLocation
      ? "Refresh my location"
      : "Use my location";

  clearLocationButton.disabled = isLocationRequestPending || !userLocation;
}

function getFilteredClinics() {
  const searchValue = searchInput.value.trim().toLowerCase();
  const provinceValue = provinceFilter.value.trim().toLowerCase();
  const districtValue = districtFilter.value.trim().toLowerCase();
  const facilityTypeValue = facilityTypeFilter.value.trim().toLowerCase();

  return allClinics.filter((clinic) => {
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
}

function renderNearestClinicPanel(clinics, nearestContext) {
  if (!nearestContext.hasNearestOrdering) {
    clearNearestClinicPanel();

    if (nearestContext.mode === "browser") {
      if (clinics.length === 0) {
        setLocationStatus(
          "Your location is ready. No clinics match the current search yet, so manual filters are still controlling what appears.",
          "info"
        );
      } else {
        setLocationStatus(
          "Your location was found, but the current clinic matches do not include usable distance details. Manual search results remain available.",
          "warning"
        );
      }
    } else {
      setLocationStatus(
        "Location sorting is off. Use the button above to sort clinics by proximity.",
        "info"
      );
    }

    return;
  }

  const clinicsInNearestOrder = sortClinicsByDistance(
    clinics.filter((clinic) => hasClinicDistance(clinic) || hasClinicNearestRank(clinic))
  );
  const closestClinic = clinicsInNearestOrder[0];
  const additionalNearbyClinics = clinicsInNearestOrder.slice(1, 4);
  const clinicsWithCoordinatesCount = allClinics.filter(hasClinicCoordinates).length;
  const filteredWithDistanceCount = nearestContext.clinicsWithDistanceCount;
  const sourceDescription = nearestContext.mode === "browser"
    ? "Estimated from your browser location"
    : "Nearest ordering supplied by the current clinic results";

  nearestClinicCard.innerHTML = `
    <p class="text-xs font-semibold uppercase tracking-[0.22em] text-[#7dcfff]">
      ${nearestContext.mode === "browser" ? "Closest clinic in your results" : "Nearest clinic in current results"}
    </p>
    <div class="mt-3 flex flex-wrap gap-2">
      <p class="inline-flex rounded-2xl border border-[#7aa2f7]/25 bg-[#7aa2f7]/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c7d8ff]">
        Nearest #1
      </p>
      ${buildClinicDistanceBadge(closestClinic)}
    </div>
    <div class="mt-4 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h3 class="text-2xl font-semibold text-[#e0e5ff]">
          ${escapeHtml(closestClinic.name || "Unnamed Clinic")}
        </h3>
        <p class="mt-2 text-sm text-[#a9b1d6]">
          ${escapeHtml(buildClinicLocationText(closestClinic))}
        </p>
        <p class="mt-2 text-sm text-[#8b93b8]">
          ${escapeHtml(buildClinicAddressText(closestClinic))}
        </p>
      </div>
    </div>

    <div class="mt-5 grid gap-3 sm:grid-cols-2">
      <div class="rounded-2xl border border-[#414868] bg-[#24283b]/80 px-4 py-4">
        <p class="text-[0.65rem] uppercase tracking-[0.24em] text-[#8b93b8]">Facility type</p>
        <p class="mt-2 text-sm font-medium text-[#e0e5ff]">${escapeHtml(cleanTextValue(closestClinic.facility_type) || "Not listed")}</p>
      </div>
      <div class="rounded-2xl border border-[#414868] bg-[#24283b]/80 px-4 py-4">
        <p class="text-[0.65rem] uppercase tracking-[0.24em] text-[#8b93b8]">Bookable slots</p>
        <p class="mt-2 text-sm font-medium text-[#e0e5ff]">${escapeHtml(formatAvailableSlotsLabel(closestClinic.available_slots_count))}</p>
      </div>
    </div>

    <div class="mt-5 rounded-[1.25rem] border border-[#414868] bg-[#24283b]/75 p-4">
      <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8]">Services</p>
      ${renderServicesPreview(closestClinic.services_offered, `${closestClinic.id}-nearby`)}
    </div>

    <p class="mt-5 text-xs uppercase tracking-[0.2em] text-[#8b93b8]">${escapeHtml(sourceDescription)}</p>

    <a
      href="/clinic/${encodeURIComponent(closestClinic.id)}"
      class="mt-6 inline-flex rounded-2xl bg-gradient-to-r from-[#7aa2f7] to-[#bb9af7] px-5 py-3 text-sm font-semibold text-[#1a1b26] transition hover:scale-[1.02] hover:brightness-110"
    >
      View this clinic
    </a>
  `;

  nearestClinicStats.innerHTML = `
    <div class="rounded-2xl border border-[#414868] bg-[#1f2335]/88 px-4 py-4">
      <p class="text-[0.65rem] uppercase tracking-[0.24em] text-[#8b93b8]">Mapped clinics</p>
      <p class="mt-2 text-lg font-semibold text-[#e0e5ff]">${escapeHtml(String(clinicsWithCoordinatesCount))}</p>
      <p class="mt-1 text-xs text-[#a9b1d6]">clinics in the full directory have coordinates</p>
    </div>
    <div class="rounded-2xl border border-[#414868] bg-[#1f2335]/88 px-4 py-4">
      <p class="text-[0.65rem] uppercase tracking-[0.24em] text-[#8b93b8]">Nearby matches</p>
      <p class="mt-2 text-lg font-semibold text-[#e0e5ff]">${escapeHtml(String(filteredWithDistanceCount))}</p>
      <p class="mt-1 text-xs text-[#a9b1d6]">current results include readable distance details</p>
    </div>
  `;

  nearbyClinicsList.innerHTML = additionalNearbyClinics.length > 0
    ? additionalNearbyClinics
      .map((clinic) => `
        <a
          href="/clinic/${encodeURIComponent(clinic.id)}"
          class="block rounded-2xl border border-[#414868] bg-[#1f2335]/88 px-4 py-4 transition hover:border-[#7aa2f7]/40 hover:bg-[#24283b]/85"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-[#e0e5ff]">${escapeHtml(clinic.name || "Unnamed Clinic")}</p>
                <span class="rounded-full border border-[#7aa2f7]/25 bg-[#7aa2f7]/12 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#c7d8ff]">
                  Nearest #${escapeHtml(String(clinic.nearest_display_rank || ""))}
                </span>
              </div>
              <p class="mt-1 text-xs text-[#a9b1d6]">${escapeHtml(buildClinicLocationText(clinic))}</p>
            </div>
            ${hasClinicDistance(clinic)
              ? `
                  <span class="rounded-full border border-[#7dcfff]/20 bg-[#7dcfff]/10 px-3 py-1 text-xs font-semibold text-[#b8ecff]">
                    ${escapeHtml(formatDistanceLabel(clinic.distance_km))}
                  </span>
                `
              : ""}
          </div>
        </a>
      `)
      .join("")
    : `
      <div class="rounded-2xl border border-[#414868] bg-[#1f2335]/88 px-4 py-4 text-sm text-[#a9b1d6]">
        The nearest clinic is the only distance-ready match in your current search.
      </div>
    `;

  nearestClinicResults.classList.remove("hidden");
  setLocationStatus(
    nearestContext.mode === "browser"
      ? `Location sorting is active. Clinic results are ordered nearest first using ${filteredWithDistanceCount} mapped match${filteredWithDistanceCount === 1 ? "" : "es"}.`
      : `Nearest ordering is active in the current clinic results. ${filteredWithDistanceCount} clinic${filteredWithDistanceCount === 1 ? "" : "s"} include distance details.`,
    "success"
  );
}

function updateResultsFeedback(clinics, nearestContext) {
  if (isLocationRequestPending) {
    setResultsFeedback(
      "Finding the nearest clinics to you. Manual search and filters stay available while VitaQ checks your location.",
      "info"
    );
    return;
  }

  if (!nearestContext.hasNearestOrdering) {
    setResultsFeedback("");
    return;
  }

  if (nearestContext.mode === "browser") {
    const distanceFallbackMessage = nearestContext.clinicsWithoutDistanceCount > 0
      ? ` ${nearestContext.clinicsWithoutDistanceCount} clinic${nearestContext.clinicsWithoutDistanceCount === 1 ? "" : "s"} without distance details stay after the nearby matches.`
      : "";

    setResultsFeedback(
      `Showing nearest clinics first using your browser location. ${nearestContext.clinicsWithDistanceCount} result${nearestContext.clinicsWithDistanceCount === 1 ? "" : "s"} include readable distance details.${distanceFallbackMessage}`,
      "success"
    );
    return;
  }

  setResultsFeedback(
    `Showing nearest-first clinic results from the current search response. ${nearestContext.clinicsWithDistanceCount} clinic${nearestContext.clinicsWithDistanceCount === 1 ? "" : "s"} include readable distance details.`,
    "success"
  );
}

// Render the currently visible clinic cards from the filtered clinic set.
function renderClinics(clinics, nearestContext) {
  lastRenderedClinics = clinics;
  lastNearestContext = nearestContext;
  clinicsList.innerHTML = "";

  if (clinics.length === 0) {
    clinicsList.classList.add("hidden");
    emptyState.classList.remove("hidden");
    hideLoadMoreState();
    emptyStateTitle.textContent = nearestContext.mode === "browser"
      ? "No clinics match this search yet"
      : "No clinics found";
    emptyStateMessage.textContent = nearestContext.mode === "browser"
      ? "Try changing your search or filters. Manual clinic search is still available even when nearby sorting is turned on."
      : "Try changing your search or filters to see more clinics.";
    resultsCount.textContent = nearestContext.mode === "browser"
      ? "0 clinics found • nearby sorting is ready when results return"
      : "0 clinics found";
    return;
  }

  const visibleClinics = getVisibleClinics(clinics);
  clinicsList.classList.remove("hidden");
  emptyState.classList.add("hidden");
  const resultSummary = `${clinics.length} clinic${clinics.length === 1 ? "" : "s"} found • showing ${visibleClinics.length}`;

  if (nearestContext.hasNearestOrdering) {
    const nearbySummary = nearestContext.clinicsWithDistanceCount > 0
      ? ` • nearest-first for ${nearestContext.clinicsWithDistanceCount} clinic${nearestContext.clinicsWithDistanceCount === 1 ? "" : "s"} with distance`
      : " • nearest-first active";
    resultsCount.textContent = `${resultSummary}${nearbySummary}`;
  } else {
    resultsCount.textContent = resultSummary;
  }

  const cardsMarkup = visibleClinics
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
      const distanceBadge = buildClinicDistanceBadge(clinic);
      const nearestOrderBadge = nearestContext.hasNearestOrdering && clinic.nearest_display_rank
        ? `
            <p class="inline-flex rounded-2xl border border-[#7aa2f7]/25 bg-[#7aa2f7]/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c7d8ff]">
              Nearest #${escapeHtml(String(clinic.nearest_display_rank))}
            </p>
          `
        : "";
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
      const distanceFallbackMarkup = nearestContext.hasNearestOrdering && !hasClinicDistance(clinic)
        ? `
            <p class="mt-3 text-xs text-[#8b93b8]">
              Distance not available for this clinic. It stays visible after the nearby matches so manual browsing still works.
            </p>
          `
        : "";

      return `
        <article class="flex h-full flex-col rounded-[2rem] border border-[#414868] bg-[#24283b]/72 p-6 shadow-xl shadow-black/10 backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:border-[#7aa2f7]/40 hover:bg-[#24283b]/82">
          <div class="flex items-start justify-between gap-4">
            <div class="flex flex-wrap gap-2">
              <p class="inline-flex rounded-2xl border border-[#7dcfff]/20 bg-[#7dcfff]/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#7dcfff]">
                ${escapeHtml(facilityType)}
              </p>
              ${nearestOrderBadge}
              ${distanceBadge}
            </div>
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
          ${distanceFallbackMarkup}

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
  updateLoadMoreState(clinics.length, visibleClinics.length);
}

function loadMoreClinics() {
  if (lastRenderedClinics.length === 0 || visibleClinicCount >= lastRenderedClinics.length) {
    return;
  }

  visibleClinicCount = Math.min(
    visibleClinicCount + CLINIC_RESULTS_PAGE_SIZE,
    lastRenderedClinics.length
  );

  renderClinics(lastRenderedClinics, lastNearestContext);
}

// Search and dropdown filters run entirely client-side after the first clinic fetch.
function applyFilters({ resetVisibleResults = true } = {}) {
  if (resetVisibleResults) {
    resetVisibleClinicCount();
  }

  const filteredClinics = getFilteredClinics();
  const decoratedClinics = decorateClinicsWithDistance(filteredClinics);
  const nearestContext = buildNearestSearchContext(decoratedClinics);
  const annotatedClinics = annotateNearestDisplayRank(decoratedClinics);
  const visibleClinics = nearestContext.hasNearestOrdering
    ? sortClinicsByDistance(annotatedClinics)
    : sortClinicsByAvailability(annotatedClinics);

  updateResultsFeedback(visibleClinics, nearestContext);
  renderNearestClinicPanel(visibleClinics, nearestContext);
  renderClinics(visibleClinics, nearestContext);
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
  clearNearestClinicPanel();
  setResultsFeedback("");
  hideLoadMoreState();
  resultsCount.textContent = "Loading clinics...";
  loadingState.textContent = "Loading clinic directory...";
  updateLocationButtons();

  try {
    const response = await fetch("/api/clinics");

    if (!response.ok) {
      throw new Error(`Failed to load clinics: ${response.status}`);
    }

    const payload = await response.json();
    allClinics = sortClinicsByAvailability(normaliseClinicResponse(payload));

    initialiseFilters(allClinics);
    applyFilters();

    loadingState.classList.add("hidden");
    updateLocationButtons();
  } catch (error) {
    console.error("Clinic load error:", error);
    loadingState.classList.add("hidden");
    clinicsList.classList.add("hidden");
    emptyState.classList.add("hidden");
    clearNearestClinicPanel();
    setResultsFeedback("");
    hideLoadMoreState();
    errorState.classList.remove("hidden");
    errorState.textContent = "We could not load clinic directory details right now. Please try again.";
    resultsCount.textContent = "Unable to load clinics";
    setLocationStatus("Location sorting is unavailable until the clinic directory loads successfully.", "error");
    updateLocationButtons();
  }
}

function initialiseInfiniteScroll() {
  if (!loadMoreState) {
    return;
  }

  if ("IntersectionObserver" in window) {
    loadMoreObserver = new IntersectionObserver(
      (entries) => {
        const loadMoreEntry = entries.find((entry) => entry.target === loadMoreState);

        if (!loadMoreEntry?.isIntersecting) {
          return;
        }

        loadMoreClinics();
      },
      {
        root: null,
        rootMargin: "0px 0px 180px 0px",
        threshold: 0.1
      }
    );

    loadMoreObserver.observe(loadMoreState);
    return;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (loadMoreState.classList.contains("hidden")) {
        return;
      }

      const loadMoreBounds = loadMoreState.getBoundingClientRect();

      if (loadMoreBounds.top <= window.innerHeight + 180) {
        loadMoreClinics();
      }
    },
    { passive: true }
  );
}

function handleLocationSuccess(position) {
  userLocation = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude
  };
  isLocationRequestPending = false;
  updateLocationButtons();
  applyFilters();
}

function handleLocationError(error) {
  isLocationRequestPending = false;
  updateLocationButtons();
  setResultsFeedback("");
  const hasExistingLocation = Boolean(userLocation);

  if (error?.code === 1) {
    setLocationStatus(
      hasExistingLocation
        ? "Location refresh was denied. Nearby results are still based on your last successful location."
        : "Location access was denied. You can still search clinics manually with the filters below.",
      "warning"
    );
    return;
  }

  if (error?.code === 2) {
    setLocationStatus(
      hasExistingLocation
        ? "Your device could not refresh its location right now. VitaQ is still showing the last successful nearby results."
        : "Your device could not provide a location right now. Try again or continue with manual search.",
      "warning"
    );
    return;
  }

  if (error?.code === 3) {
    setLocationStatus(
      hasExistingLocation
        ? "Location refresh timed out. VitaQ kept your previous nearby ordering."
        : "Location lookup timed out. Try again when your connection or GPS signal is stronger.",
      "warning"
    );
    return;
  }

  setLocationStatus(
    hasExistingLocation
      ? "We could not refresh your location right now. VitaQ kept the previous nearby ordering."
      : "We could not read your location right now. Manual clinic search is still available.",
    "error"
  );
}

function requestUserLocation() {
  if (!navigator.geolocation) {
    setResultsFeedback("");
    setLocationStatus("This browser does not support geolocation. Use the clinic filters to search manually.", "warning");
    return;
  }

  isLocationRequestPending = true;
  updateLocationButtons();
  setResultsFeedback(
    "Finding the nearest clinics to you. Manual search and filters stay available while VitaQ checks your location.",
    "info"
  );
  setLocationStatus("Requesting your location so VitaQ can sort clinics by proximity...", "info");

  navigator.geolocation.getCurrentPosition(
    handleLocationSuccess,
    handleLocationError,
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    }
  );
}

function clearLocationView() {
  userLocation = null;
  updateLocationButtons();
  setResultsFeedback("");
  setLocationStatus("Location sorting is off. Use the button above to sort clinics by proximity.", "info");
  applyFilters();
}

searchInput.addEventListener("input", applyFilters);
provinceFilter.addEventListener("change", applyFilters);
districtFilter.addEventListener("change", applyFilters);
facilityTypeFilter.addEventListener("change", applyFilters);
clinicsList.addEventListener("click", handleServiceToggle);
nearestClinicResults.addEventListener("click", handleServiceToggle);
useLocationButton.addEventListener("click", requestUserLocation);
clearLocationButton.addEventListener("click", clearLocationView);

document.addEventListener("DOMContentLoaded", () => {
  initialiseInfiniteScroll();
  loadClinics();
});
