function getClinicIdFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[1] || null; // expects /clinic/:id
}

function formatServices(services) {
  if (!services) return [];

  return services
    .split(';')
    .map((service) => service.replace(/_/g, ' ').trim())
    .filter(Boolean);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-ZA', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatTime(timeString) {
  return timeString?.slice(0, 5) || '';
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value || 'N/A';
}

function renderServices(services) {
  const servicesContainer = document.getElementById('clinicServices');
  servicesContainer.innerHTML = '';

  const cleanedServices = formatServices(services);

  if (cleanedServices.length === 0) {
    servicesContainer.innerHTML = `
      <p class="text-[#8b93b8]">No services listed for this clinic.</p>
    `;
    return;
  }

  cleanedServices.forEach((service, index) => {
    const badge = document.createElement('span');

    const badgeStyles = [
      'border-[#7dcfff]/20 bg-[#7dcfff]/10 text-[#b8ecff]',
      'border-[#7aa2f7]/20 bg-[#7aa2f7]/10 text-[#b9cfff]',
      'border-[#bb9af7]/20 bg-[#bb9af7]/10 text-[#dbcaff]',
      'border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]'
    ];

    badge.className = `rounded-2xl border px-4 py-2.5 text-sm font-medium shadow-sm backdrop-blur-sm ${badgeStyles[index % badgeStyles.length]}`;
    badge.textContent = service;
    servicesContainer.appendChild(badge);
  });
}

function renderClinic(clinic) {
  setText('clinicName', clinic.name);
  setText(
    'clinicAddress',
    clinic.address || `${clinic.area || ''}, ${clinic.district || ''}, ${clinic.province || ''}`
  );
  setText('clinicProvince', clinic.province);
  setText('clinicDistrictArea', [clinic.district, clinic.area].filter(Boolean).join(' / '));
  setText('clinicFacilityType', clinic.facility_type);

  renderServices(clinic.services_offered);
}

function renderSlots(slots, clinic) {
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

  slots.forEach((slot, index) => {
    const availability = Math.max((slot.capacity || 0) - (slot.booked_count || 0), 0);
    const isAvailable = availability > 0 && slot.status === 'available';

    const accentStyles = [
      'from-[#7dcfff]/14 to-transparent border-[#7dcfff]/20',
      'from-[#7aa2f7]/14 to-transparent border-[#7aa2f7]/20',
      'from-[#bb9af7]/14 to-transparent border-[#bb9af7]/20'
    ];

    const accentStyle = accentStyles[index % accentStyles.length];

    const slotCard = document.createElement('article');
    slotCard.className = `rounded-[1.75rem] border bg-[linear-gradient(135deg,rgba(26,27,38,0.82),rgba(36,40,59,0.82))] p-5 shadow-lg shadow-black/10 backdrop-blur-sm ${accentStyle}`;

    const availabilityBadgeClass = isAvailable
      ? 'border border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]'
      : 'border border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]';

    const buttonClass = isAvailable
      ? 'border border-[#7aa2f7]/25 bg-gradient-to-r from-[#7aa2f7] to-[#bb9af7] text-[#1a1b26] hover:scale-[1.02] hover:brightness-110'
      : 'cursor-not-allowed border border-[#414868] bg-[#24283b]/80 text-[#6b7194]';

    slotCard.innerHTML = `
      <section class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <section class="flex flex-col gap-5 sm:flex-row sm:items-stretch lg:flex-1">
          <article class="min-w-[12rem] rounded-3xl border border-[#414868] bg-[#1f2335]/85 p-5">
            <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8]">Date</p>
            <p class="mt-3 text-lg font-semibold text-[#e0e5ff]">${formatDate(slot.date)}</p>
          </article>

          <section class="grid flex-1 gap-4 sm:grid-cols-3">
            <article class="rounded-3xl border border-[#414868] bg-[#1f2335]/85 p-5">
              <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8]">Start</p>
              <p class="mt-3 text-base font-semibold text-[#e0e5ff]">${formatTime(slot.start_time)}</p>
            </article>

            <article class="rounded-3xl border border-[#414868] bg-[#1f2335]/85 p-5">
              <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8]">End</p>
              <p class="mt-3 text-base font-semibold text-[#e0e5ff]">${formatTime(slot.end_time)}</p>
            </article>

            <article class="rounded-3xl border border-[#414868] bg-[#1f2335]/85 p-5">
              <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8]">Status</p>
              <p class="mt-3 inline-flex rounded-full px-3 py-1.5 text-sm font-medium ${availabilityBadgeClass}">
                ${isAvailable ? `${availability} spaces left` : 'Unavailable'}
              </p>
            </article>
          </section>
        </section>

        <section class="lg:pl-4">
          <button
            class="book-slot-btn inline-flex min-w-[9.5rem] items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition ${buttonClass}"
            data-slot-id="${slot.id}"
            data-clinic-id="${clinic.id}"
            data-clinic-name="${clinic.name}"
            data-slot-date="${slot.date}"
            data-slot-start="${slot.start_time}"
            data-slot-end="${slot.end_time}"
            data-default-label="Book slot"
            ${isAvailable ? '' : 'disabled'}
          >
            Book slot
          </button>
        </section>
      </section>
    `;

    slotsList.appendChild(slotCard);
  });

  attachBookHandlers();
}

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
      button.textContent = 'Booking...';

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
    const [clinicResponse, slotsResponse] = await Promise.all([
      fetch(`/api/clinics/${clinicId}`),
      fetch(`/api/clinics/${clinicId}/slots`)
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
    renderSlots(slots, clinic);

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