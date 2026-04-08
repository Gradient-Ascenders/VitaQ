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
      return 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
    case 'completed':
      return 'border border-blue-400/20 bg-blue-400/10 text-blue-300';
    case 'cancelled':
      return 'border border-red-400/20 bg-red-400/10 text-red-300';
    default:
      return 'border border-white/10 bg-white/5 text-slate-300';
  }
}

function renderAppointments(appointments) {
  const appointmentsList = document.getElementById('appointmentsList');
  const appointmentsCount = document.getElementById('appointmentsCount');
  const emptyState = document.getElementById('emptyState');

  appointmentsList.innerHTML = '';

  if (!appointments || appointments.length === 0) {
    appointmentsCount.textContent = '0 appointments';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  appointmentsCount.textContent = `${appointments.length} appointment${appointments.length === 1 ? '' : 's'}`;

  appointments.forEach((appointment) => {
    const clinic = appointment.clinic || {};
    const slot = appointment.slot || {};
    const location = [clinic.area, clinic.district, clinic.province].filter(Boolean).join(', ');

    const card = document.createElement('article');
    card.className = 'rounded-[1.75rem] border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-950/30';

    card.innerHTML = `
      <section class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <section class="flex-1">
          <p class="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
            Appointment
          </p>

          <h3 class="mt-3 text-2xl font-semibold text-white">
            ${clinic.name || 'Clinic not available'}
          </h3>

          <p class="mt-2 text-slate-300">
            ${location || 'Location not available'}
          </p>

          <p class="mt-2 text-sm text-slate-400">
            ${clinic.facility_type || 'Facility type not available'}
          </p>
        </section>

        <section>
          <p class="inline-flex rounded-full px-4 py-2 text-sm font-semibold ${getStatusClasses(appointment.status)}">
            ${formatStatus(appointment.status)}
          </p>
        </section>
      </section>

      <section class="mt-6 grid gap-4 md:grid-cols-3">
        <article class="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <p class="text-xs uppercase tracking-[0.2em] text-slate-400">Date</p>
          <p class="mt-2 text-base font-medium text-white">${formatDate(slot.date)}</p>
        </article>

        <article class="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <p class="text-xs uppercase tracking-[0.2em] text-slate-400">Time</p>
          <p class="mt-2 text-base font-medium text-white">${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}</p>
        </article>

        <article class="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <p class="text-xs uppercase tracking-[0.2em] text-slate-400">Booked On</p>
          <p class="mt-2 text-base font-medium text-white">${formatDate(appointment.created_at)}</p>
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