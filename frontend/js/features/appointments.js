function formatDate(dateString) {
  if (!dateString) return 'N/A';

  const date = new Date(dateString);
  return date.toLocaleDateString('en-ZA', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatTime(timeString) {
  return timeString ? timeString.slice(0, 5) : 'N/A';
}

function formatStatus(status) {
  if (!status) return 'Unknown';

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getStatusClasses(status) {
  switch (status) {
    case 'booked':
      return 'border border-[#9ece6a]/20 bg-[#9ece6a]/10 text-[#d6f3b8]';
    case 'completed':
      return 'border border-[#7aa2f7]/20 bg-[#7aa2f7]/10 text-[#c7d8ff]';
    case 'cancelled':
      return 'border border-[#f7768e]/20 bg-[#f7768e]/10 text-[#f4b5c0]';
    default:
      return 'border border-[#414868] bg-[#24283b]/80 text-[#c0caf5]';
  }
}

function canViewQueue(appointment) {
  return appointment?.status === 'booked' && appointment?.clinic && appointment?.slot?.date;
}

function buildQueuePageUrl(appointment) {
  const clinic = appointment.clinic || {};
  const slot = appointment.slot || {};
  const params = new URLSearchParams({
    clinic: clinic.name || '',
    clinicId: appointment.clinic_id || '',
    appointmentId: appointment.id || '',
    date: slot.date || '',
    start: slot.start_time || '',
    end: slot.end_time || ''
  });

  return `/queue?${params.toString()}`;
}

function renderAppointments(appointments) {
  const appointmentsList = document.getElementById('appointmentsList');
  const appointmentsCount = document.getElementById('appointmentsCount');
  const emptyState = document.getElementById('emptyState');

  appointmentsList.innerHTML = '';

  if (!appointments || appointments.length === 0) {
    appointmentsCount.textContent = '0 appointments';
    appointmentsList.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  appointmentsList.classList.remove('hidden');
  emptyState.classList.add('hidden');
  appointmentsCount.textContent = `${appointments.length} appointment${appointments.length === 1 ? '' : 's'}`;

  appointments.forEach((appointment) => {
    const clinic = appointment.clinic || {};
    const slot = appointment.slot || {};
    const location = [clinic.area, clinic.district, clinic.province].filter(Boolean).join(' • ');
    const address = clinic.address || 'Address not available';
    const queueAction = canViewQueue(appointment)
      ? `
        <a
          href="${buildQueuePageUrl(appointment)}"
          class="inline-flex items-center justify-center rounded-2xl border border-[#7aa2f7]/35 bg-[#7aa2f7]/12 px-5 py-3 text-sm font-semibold text-[#c0caf5] transition hover:border-[#7aa2f7] hover:bg-[#7aa2f7]/18"
        >
          View Queue
        </a>
      `
      : '';

    const card = document.createElement('article');
    card.className =
      'rounded-[2rem] border border-[#414868] bg-[#24283b]/72 p-6 shadow-xl shadow-black/10 backdrop-blur-sm';

    card.innerHTML = `
      <section class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <section class="flex-1">
          <div class="flex flex-wrap items-center gap-3">
            <p class="inline-flex rounded-2xl border border-[#7dcfff]/20 bg-[#7dcfff]/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#7dcfff]">
              Appointment
            </p>
            <p class="inline-flex rounded-full px-4 py-2 text-sm font-semibold ${getStatusClasses(appointment.status)}">
              ${formatStatus(appointment.status)}
            </p>
          </div>

          <h3 class="mt-4 text-2xl font-semibold text-[#e0e5ff]">
            ${clinic.name || 'Clinic not available'}
          </h3>

          <p class="mt-3 text-sm text-[#a9b1d6]">
            ${location || 'Location not available'}
          </p>

          <p class="mt-2 text-sm text-[#8b93b8]">
            ${clinic.facility_type || 'Facility type not available'}
          </p>

          <p class="mt-2 text-sm text-[#8b93b8]">
            ${address}
          </p>
        </section>

        ${queueAction ? `<section class="lg:justify-self-end">${queueAction}</section>` : ''}
      </section>

      <section class="mt-6 grid gap-4 md:grid-cols-3">
        <article class="rounded-3xl border border-[#414868] bg-[#1f2335]/85 p-5">
          <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8]">Date</p>
          <p class="mt-3 text-base font-semibold text-[#e0e5ff]">${formatDate(slot.date)}</p>
        </article>

        <article class="rounded-3xl border border-[#414868] bg-[#1f2335]/85 p-5">
          <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8]">Time</p>
          <p class="mt-3 text-base font-semibold text-[#e0e5ff]">${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}</p>
        </article>

        <article class="rounded-3xl border border-[#414868] bg-[#1f2335]/85 p-5">
          <p class="text-xs uppercase tracking-[0.2em] text-[#8b93b8]">Booked On</p>
          <p class="mt-3 text-base font-semibold text-[#e0e5ff]">${formatDate(appointment.created_at)}</p>
        </article>
      </section>
    `;

    appointmentsList.appendChild(card);
  });
}

async function loadAppointmentsPage() {
  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const appointmentsList = document.getElementById('appointmentsList');

  initialiseLogoutButton('logoutButton');

  const session = await requireAuthenticatedUser();
  if (!session) {
    return;
  }

  try {
    const response = await fetch('/api/appointments', {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });

    const payload = await response.json();

    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Failed to load appointments.');
    }

    loadingState.classList.add('hidden');
    appointmentsList.classList.remove('hidden');

    renderAppointments(payload.data || []);
  } catch (error) {
    console.error(error);
    loadingState.classList.add('hidden');
    errorState.textContent = error.message || 'We could not load your appointments right now.';
    errorState.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', loadAppointmentsPage);
