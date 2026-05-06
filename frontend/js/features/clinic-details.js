// Clinic details page logic.
// This page combines clinic facts, slot availability, and the booking action for a single clinic.
function getClinicIdFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[1] || null; // expects /clinic/:id
}

function cleanTextValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

// Some imported dataset rows contain generic notes instead of real service names.
// Treat those notes as unavailable services so the UI shows a clean fallback message.
function isUnavailableServiceText(value) {
  const text = String(value || '').toLowerCase().trim();

  return (
    !text ||
    text.includes('could not be found') ||
    text.includes('visit their website') ||
    text.includes('relevant private facility services') ||
    text.includes('services for this public hospital')
  );
}

function formatServices(services) {
  if (isUnavailableServiceText(services)) {
    return [];
  }

  return String(services)
    .split(/[;,]/)
    .map((service) => service.replace(/_/g, ' ').trim())
    .filter(Boolean);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatTime(timeString) {
  return timeString?.slice(0, 5) || '';
}

// Reuse one text helper so missing clinic fields fall back consistently across the page.
function setText(id, value, fallback = 'N/A') {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = cleanTextValue(value) || fallback;
  }
}

function normaliseWebsiteUrl(value) {
  const website = cleanTextValue(value);

  if (!website) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(website) ? website : `https://${website}`;

  try {
    const url = new URL(withProtocol);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }

    return url.toString();
  } catch (error) {
    return '';
  }
}

function buildClinicAddressText(clinic) {
  const address = cleanTextValue(clinic.address);

  if (address) {
    return address;
  }

  const locationParts = [clinic.area, clinic.district, clinic.municipality, clinic.province]
    .map(cleanTextValue)
    .filter(Boolean);

  if (locationParts.length > 0) {
    return locationParts.join(', ');
  }

  return 'Location details incomplete';
}

function buildClinicIssues(clinic) {
  const issues = [];

  if (clinic.is_active === false) {
    issues.push('This clinic listing is marked inactive. Confirm the clinic status before visiting.');
  }

  return issues;
}

function renderClinicDataNotice(clinic) {
  const notice = document.getElementById('clinicDataNotice');
  const noticeText = document.getElementById('clinicDataNoticeText');

  if (!notice || !noticeText) {
    return;
  }

  const issues = buildClinicIssues(clinic);

  if (issues.length === 0) {
    notice.classList.add('hidden');
    noticeText.textContent = '';
    return;
  }

  noticeText.textContent = issues.join(' ');
  notice.classList.remove('hidden');
}

// Render a clinic website as a short readable label, while keeping the full URL in the link.
function renderWebsite(value) {
  const websiteElement = document.getElementById('clinicWebsite');

  if (!websiteElement) {
    return;
  }

  const websiteUrl = normaliseWebsiteUrl(value);

  if (!websiteUrl) {
    websiteElement.textContent = 'Website not available';
    websiteElement.removeAttribute('href');
    websiteElement.removeAttribute('target');
    websiteElement.removeAttribute('rel');
    websiteElement.removeAttribute('title');
    websiteElement.classList.remove('text-[#7dcfff]', 'hover:text-[#b8ecff]', 'hover:underline');
    websiteElement.classList.add('cursor-default', 'text-[#8b93b8]', 'no-underline');
    return;
  }

  const url = new URL(websiteUrl);
  const readableWebsite = url.hostname.replace(/^www\./i, '');

  websiteElement.textContent = readableWebsite || 'Open clinic website';
  websiteElement.href = websiteUrl;
  websiteElement.title = websiteUrl;
  websiteElement.target = '_blank';
  websiteElement.rel = 'noopener noreferrer';
  websiteElement.classList.remove('cursor-default', 'text-[#8b93b8]', 'no-underline');
  websiteElement.classList.add('text-[#7dcfff]', 'hover:text-[#b8ecff]', 'hover:underline');
}

function renderServices(services) {
  const servicesContainer = document.getElementById('clinicServices');
  servicesContainer.innerHTML = '';

  const cleanedServices = formatServices(services);

  if (cleanedServices.length === 0) {
    servicesContainer.innerHTML = `
      <p class="text-[#8b93b8]">Services not available for this clinic.</p>
    `;
    return;
  }

  cleanedServices.forEach((service, index) => {
    const badge = document.createElement('span');

    const badgeStyles = [
      'border-[#7dcfff]/25 bg-[#7dcfff]/12 text-[#b8ecff]',
      'border-[#7aa2f7]/25 bg-[#7aa2f7]/12 text-[#c7d8ff]',
      'border-[#bb9af7]/25 bg-[#bb9af7]/12 text-[#dfcbff]',
      'border-[#9ece6a]/25 bg-[#9ece6a]/12 text-[#d6f3b8]',
      'border-[#e0af68]/25 bg-[#e0af68]/12 text-[#f6d8a8]',
      'border-[#f7768e]/25 bg-[#f7768e]/12 text-[#f4b5c0]'
    ];

    badge.className = `rounded-2xl border px-4 py-2.5 text-sm font-medium shadow-sm backdrop-blur-sm ${badgeStyles[index % badgeStyles.length]}`;
    badge.textContent = service;
    servicesContainer.appendChild(badge);
  });
}

function renderClinic(clinic) {
  setText('clinicName', clinic.name, 'Clinic details');
  setText('clinicAddress', buildClinicAddressText(clinic), 'Location details incomplete');
  setText('clinicProvince', clinic.province, 'Province not available');
  setText(
    'clinicDistrictArea',
    [clinic.district, clinic.area].map(cleanTextValue).filter(Boolean).join(' / '),
    'District and area not available'
  );
  setText('clinicMunicipality', clinic.municipality, 'Municipality not available');
  setText('clinicRegion', clinic.region, 'Region not available');
  setText('clinicFacilityType', clinic.facility_type, 'Facility type not available');
  renderWebsite(clinic.contact_website);
  renderClinicDataNotice(clinic);

  renderServices(clinic.services_offered);
}

// Slot cards depend on both real slot availability and whether the patient already booked that slot.
function renderSlots(slots, clinic, bookedSlotIds = new Set()) {
  const slotsList = document.getElementById('slotsList');
  const slotsEmptyState = document.getElementById('slotsEmptyState');
  const slotsCount = document.getElementById('slotsCount');

  slotsList.innerHTML = '';

  if (!slots || slots.length === 0) {
    slotsEmptyState.classList.remove('hidden');
    slotsCount.textContent = '0 slots available';
    return;
  }

  slotsEmptyState.classList.add('hidden');
  slotsCount.textContent = `${slots.length} slot${slots.length === 1 ? '' : 's'} available`;

  slots.forEach((slot) => {
    const availability = Math.max((slot.capacity || 0) - (slot.booked_count || 0), 0);
    const isAvailable = availability > 0 && slot.status === 'available';
    const isBookedByPatient = bookedSlotIds.has(String(slot.id));
    const canBook = isAvailable && !isBookedByPatient;

    const slotCard = document.createElement('article');
    slotCard.className =
      'rounded-[2rem] border border-[#414868] bg-[linear-gradient(135deg,rgba(26,27,38,0.82),rgba(36,40,59,0.82))] px-5 py-5 shadow-lg shadow-black/10 backdrop-blur-sm';

    const availabilityClass = isBookedByPatient
      ? 'text-[#9ece6a]'
      : isAvailable
      ? 'text-[#38f2c2]'
      : 'text-[#f7768e]';

    const buttonClass = canBook
      ? 'border border-[#00b4d8]/50 bg-[#0a2540] text-[#b8ecff] hover:border-[#00b4d8] hover:bg-[#0d2d4d]'
      : isBookedByPatient
      ? 'cursor-not-allowed border border-[#9ece6a]/25 bg-[#9ece6a]/10 text-[#d6f3b8]'
      : 'cursor-not-allowed border border-[#414868] bg-[#24283b]/80 text-[#6b7194]';

    const buttonLabel = isBookedByPatient ? 'Booked' : 'Book';
    const availabilityLabel = isBookedByPatient
      ? 'Booked'
      : isAvailable
      ? `${availability} space${availability === 1 ? '' : 's'} left`
      : 'Unavailable';

    slotCard.innerHTML = `
      <section class="grid gap-5 lg:grid-cols-[1.45fr_1fr_1fr_1.45fr_auto] lg:items-center">
        <article>
          <p class="text-xs uppercase tracking-[0.28em] text-[#8b93b8]">Date</p>
          <p class="mt-3 text-[1.05rem] font-semibold text-white">
            ${formatDate(slot.date)}
          </p>
        </article>

        <article>
          <p class="text-xs uppercase tracking-[0.28em] text-[#8b93b8]">Start Time</p>
          <p class="mt-3 text-[1.05rem] font-semibold text-white">
            ${formatTime(slot.start_time)}
          </p>
        </article>

        <article>
          <p class="text-xs uppercase tracking-[0.28em] text-[#8b93b8]">End Time</p>
          <p class="mt-3 text-[1.05rem] font-semibold text-white">
            ${formatTime(slot.end_time)}
          </p>
        </article>

        <article>
          <p class="text-xs uppercase tracking-[0.28em] text-[#8b93b8]">Availability</p>
          <p class="mt-3 text-[1.05rem] font-semibold ${availabilityClass}">
            ${availabilityLabel}
          </p>
        </article>

        <section class="lg:justify-self-end">
          <button
            class="book-slot-btn inline-flex min-w-[4.8rem] items-center justify-center rounded-full px-6 py-3 text-base font-semibold transition ${buttonClass}"
            data-slot-id="${slot.id}"
            data-clinic-id="${clinic.id}"
            data-clinic-name="${clinic.name}"
            data-slot-date="${slot.date}"
            data-slot-start="${slot.start_time}"
            data-slot-end="${slot.end_time}"
            data-default-label="${buttonLabel}"
            ${canBook ? '' : 'disabled'}
          >
            ${buttonLabel}
          </button>
        </section>
      </section>
    `;

    slotsList.appendChild(slotCard);
  });

  attachBookHandlers();
}

// Pull the patient's existing bookings so already-booked slots can be disabled in the UI.
async function fetchBookedSlotIds(session, clinicId) {
  if (!session?.access_token) {
    return new Set();
  }

  const response = await fetch('/api/appointments', {
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || 'Failed to load your appointments.');
  }

  const bookedSlotIds = (payload.data || [])
    .filter((appointment) => (
      String(appointment.clinic_id) === String(clinicId)
      && appointment.status === 'booked'
      && appointment.slot_id
    ))
    .map((appointment) => String(appointment.slot_id));

  return new Set(bookedSlotIds);
}

// Viewing open slots should still work even if the patient's appointment lookup fails.
async function fetchBookedSlotIdsSafely(session, clinicId) {
  try {
    return await fetchBookedSlotIds(session, clinicId);
  } catch (error) {
    console.warn('Booked slot lookup failed; continuing without booked-slot highlighting.', error);
    return new Set();
  }
}

// Button handlers are attached after each render because the slot card markup is regenerated.
function attachBookHandlers() {
  const buttons = document.querySelectorAll('.book-slot-btn');

  buttons.forEach((button) => {
    button.addEventListener('click', async () => {
      const slotId = button.dataset.slotId;
      const clinicId = button.dataset.clinicId;
      const clinicName = button.dataset.clinicName;
      const slotDate = button.dataset.slotDate;
      const slotStart = button.dataset.slotStart;
      const slotEnd = button.dataset.slotEnd;
      const defaultLabel = button.dataset.defaultLabel || 'Book';

      button.disabled = true;
      button.textContent = defaultLabel;

      // Booking requires an access token because appointments are patient-owned records.
      const {
        data: { session }
      } = await window.supabaseClient.auth.getSession();

      if (!session?.access_token) {
        alert('Please log in to book an appointment.');
        window.location.href = '/login';
        return;
      }

      try {
        const response = await fetch('/api/appointments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            clinic_id: clinicId,
            slot_id: slotId
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to book appointment');
        }

        const params = new URLSearchParams({
          clinic: clinicName,
          date: slotDate,
          start: slotStart,
          end: slotEnd
        });

        // Store a lightweight summary so the confirmation page can survive small redirect changes.
        sessionStorage.setItem(
          'latestBooking',
          JSON.stringify({
            clinic: clinicName,
            date: slotDate,
            start: slotStart,
            end: slotEnd
          })
        );

        window.location.href = `/booking-confirmation?${params.toString()}`;
      } catch (error) {
        alert(error.message || 'Could not book this appointment.');
        button.disabled = false;
        button.textContent = defaultLabel;
      }
    });
  });
}

// Page bootstrap fetches clinic details, available slots, and the patient's booked-slot context together.
async function loadClinicPage() {
  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const clinicContent = document.getElementById('clinicContent');

  const clinicId = getClinicIdFromPath();

  if (!clinicId) {
    loadingState.classList.add('hidden');
    errorState.textContent = 'Clinic ID is missing from the URL.';
    errorState.classList.remove('hidden');
    return;
  }

  try {
    const session = await requireAuthenticatedUser();

    if (!session) {
      return;
    }

    const bookedSlotIdsPromise = fetchBookedSlotIdsSafely(session, clinicId);

    const [clinicResponse, slotsResponse, bookedSlotIds] = await Promise.all([
      fetch(`/api/clinics/${clinicId}`),
      fetch(`/api/clinics/${clinicId}/slots`),
      bookedSlotIdsPromise
    ]);

    if (!clinicResponse.ok) {
      const text = await clinicResponse.text();
      throw new Error(`Failed to load clinic: ${text}`);
    }

    if (!slotsResponse.ok) {
      const text = await slotsResponse.text();
      throw new Error(`Failed to load slots: ${text}`);
    }

    const clinicPayload = await clinicResponse.json();
    const slotsPayload = await slotsResponse.json();

    const clinic = clinicPayload.data;
    const slots = slotsPayload.data || [];

    renderClinic(clinic);
    renderSlots(slots, clinic, bookedSlotIds);

    loadingState.classList.add('hidden');
    clinicContent.classList.remove('hidden');
  } catch (error) {
    console.error(error);
    loadingState.classList.add('hidden');
    errorState.textContent =
      error.message || 'We could not load this clinic right now. Please try again.';
    errorState.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', loadClinicPage);
