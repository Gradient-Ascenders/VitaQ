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
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatTime(timeString) {
  return timeString?.slice(0, 5) || '';
}

const QUEUE_JOIN_STATES = {
  NOT_JOINED: 'not_joined',
  JOINING: 'joining',
  JOINED_SUCCESSFULLY: 'joined_successfully',
  FAILED_TO_JOIN: 'failed_to_join'
};

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value || 'N/A';
}

function getQueueJoinUiConfig(state, message) {
  switch (state) {
    case QUEUE_JOIN_STATES.JOINING:
      return {
        label: 'Joining',
        labelClass: 'border-[#7dcfff]/20 bg-[#7dcfff]/10 text-[#b8ecff]',
        buttonText: 'Joining...',
        buttonDisabled: true,
        buttonClass: 'border-[#7dcfff]/30 bg-[#7dcfff]/10 text-[#b8ecff]',
        message:
          message || 'Sending your queue request. Please wait while VitaQ prepares your place in line.',
        messageClass: 'text-[#b8ecff]'
      };
    case QUEUE_JOIN_STATES.JOINED_SUCCESSFULLY:
      return {
        label: 'Joined successfully',
        labelClass: 'border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]',
        buttonText: 'Joined',
        buttonDisabled: true,
        buttonClass: 'border-[#9ece6a]/30 bg-[#9ece6a]/10 text-[#d6f3b8]',
        message:
          message || 'You have joined the queue successfully. Queue progress will appear here once the backend integration is connected.',
        messageClass: 'text-[#d6f3b8]'
      };
    case QUEUE_JOIN_STATES.FAILED_TO_JOIN:
      return {
        label: 'Failed to join',
        labelClass: 'border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]',
        buttonText: 'Try Again',
        buttonDisabled: false,
        buttonClass: 'border-[#f7768e]/30 bg-[#f7768e]/10 text-[#f4b5c0] hover:border-[#f7768e] hover:bg-[#f7768e]/16',
        message:
          message || 'Queue joining is not available yet on this page. Please try again after the queue API is connected.',
        messageClass: 'text-[#f4b5c0]'
      };
    case QUEUE_JOIN_STATES.NOT_JOINED:
    default:
      return {
        label: 'Not joined',
        labelClass: 'border-[#414868] bg-[#24283b]/80 text-[#c0caf5]',
        buttonText: 'Join Queue',
        buttonDisabled: false,
        buttonClass: 'border-[#7aa2f7]/40 bg-[#7aa2f7]/12 text-[#c0caf5] hover:border-[#7aa2f7] hover:bg-[#7aa2f7]/18',
        message: message || 'You have not joined this clinic queue yet.',
        messageClass: 'text-[#a9b1d6]'
      };
  }
}

function renderQueueJoinState(state, message = '') {
  const button = document.getElementById('queueJoinButton');
  const label = document.getElementById('queueJoinStateLabel');
  const messageElement = document.getElementById('queueJoinMessage');

  if (!button || !label || !messageElement) {
    return;
  }

  const config = getQueueJoinUiConfig(state, message);

  label.textContent = config.label;
  label.className = `inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${config.labelClass}`;

  button.textContent = config.buttonText;
  button.disabled = config.buttonDisabled;
  button.className = `mt-5 inline-flex w-full items-center justify-center rounded-2xl border px-5 py-3 text-sm font-semibold transition ${config.buttonClass}`;

  messageElement.textContent = config.message;
  messageElement.className = `mt-4 text-sm leading-7 ${config.messageClass}`;
}

async function submitQueueJoinRequest() {
  // This placeholder keeps the state flow honest until the queue data model is finalized.
  await new Promise((resolve) => window.setTimeout(resolve, 900));

  throw new Error(
    'Queue joining is not connected yet. The existing booking flow remains the active patient path for now.'
  );
}

function initialiseQueueJoinState() {
  const button = document.getElementById('queueJoinButton');

  if (!button) {
    return;
  }

  renderQueueJoinState(QUEUE_JOIN_STATES.NOT_JOINED);

  button.addEventListener('click', async () => {
    renderQueueJoinState(QUEUE_JOIN_STATES.JOINING);

    try {
      await submitQueueJoinRequest();
      renderQueueJoinState(QUEUE_JOIN_STATES.JOINED_SUCCESSFULLY);
    } catch (error) {
      renderQueueJoinState(
        QUEUE_JOIN_STATES.FAILED_TO_JOIN,
        error.message || 'Queue joining failed.'
      );
    }
  });

  // Small debug hook so the ready states can be reviewed before the API is wired.
  window.__vitaqQueueJoinDebug = {
    setState(state, message = '') {
      renderQueueJoinState(state, message);
    }
  };
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

  slots.forEach((slot) => {
    const availability = Math.max((slot.capacity || 0) - (slot.booked_count || 0), 0);
    const isAvailable = availability > 0 && slot.status === 'available';

    const slotCard = document.createElement('article');
    slotCard.className =
      'rounded-[2rem] border border-[#414868] bg-[linear-gradient(135deg,rgba(26,27,38,0.82),rgba(36,40,59,0.82))] px-5 py-5 shadow-lg shadow-black/10 backdrop-blur-sm';

    const availabilityClass = isAvailable
      ? 'text-[#38f2c2]'
      : 'text-[#f7768e]';

    const buttonClass = isAvailable
      ? 'border border-[#00b4d8]/50 bg-[#0a2540] text-[#b8ecff] hover:border-[#00b4d8] hover:bg-[#0d2d4d]'
      : 'cursor-not-allowed border border-[#414868] bg-[#24283b]/80 text-[#6b7194]';

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
            ${isAvailable ? `${availability} space${availability === 1 ? '' : 's'} left` : 'Unavailable'}
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
            data-default-label="Book"
            ${isAvailable ? '' : 'disabled'}
          >
            Book
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
      button.textContent = defaultLabel;

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

document.addEventListener('DOMContentLoaded', () => {
  initialiseQueueJoinState();
  loadClinicPage();
});
