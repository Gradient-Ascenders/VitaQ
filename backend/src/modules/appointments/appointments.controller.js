const {
  createAppointmentBooking,
  fetchAppointmentsByPatientId
} = require('./appointments.service');

/**
 * Creates a new appointment booking for the logged-in patient.
 * Expects clinic_id and slot_id in the request body.
 */
async function bookAppointment(req, res) {
  try {
    // Get the authenticated patient's ID from the auth middleware
    const patientId = req.user.id;

    // Rename incoming body fields into easier camelCase variables
    const { clinic_id: clinicId, slot_id: slotId } = req.body;

    // Call the service layer to validate the booking and save it
    const result = await createAppointmentBooking({
      patientId,
      clinicId,
      slotId
    });

    // Return a success response if the booking was created
    return res.status(201).json({
      success: true,
      message: 'Appointment booked successfully.',
      data: result
    });
  } catch (error) {
    // Return the error code from the service if available
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create appointment booking.'
    });
  }
}

/**
 * Fetches all appointments for the currently logged-in patient.
 */
async function getMyAppointments(req, res) {
  try {
    // Get the authenticated patient's ID from the auth middleware
    const patientId = req.user.id;

    // Ask the service layer for this patient's appointments
    const appointments = await fetchAppointmentsByPatientId(patientId);

    // Return the appointments in a standard success response
    return res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments
    });
  } catch (error) {
    // Return a server error if something goes wrong
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch appointments.'
    });
  }
}

module.exports = {
  bookAppointment,
  getMyAppointments
};