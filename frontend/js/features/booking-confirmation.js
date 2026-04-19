// Booking confirmation reads the latest slot details from either the redirect URL
// or sessionStorage so the summary still works after a refresh or redirect.
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-ZA', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatTimeRange(start, end) {
  const cleanStart = start ? start.slice(0, 5) : '';
  const cleanEnd = end ? end.slice(0, 5) : '';
  return `${cleanStart} - ${cleanEnd}`;
}

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);

  // sessionStorage is the fallback when the redirect does not include every booking field.
  const savedBooking = sessionStorage.getItem('latestBooking');
  const booking = savedBooking ? JSON.parse(savedBooking) : null;

  const clinic = params.get('clinic') || booking?.clinic || 'N/A';
  const date = params.get('date') || booking?.date || '';
  const start = params.get('start') || booking?.start || '';
  const end = params.get('end') || booking?.end || '';

  document.getElementById('confirmClinic').textContent = clinic;
  document.getElementById('confirmDate').textContent = date ? formatDate(date) : 'N/A';
  document.getElementById('confirmTime').textContent = start && end ? formatTimeRange(start, end) : 'N/A';
});
