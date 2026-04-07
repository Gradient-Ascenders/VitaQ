const { createAppointmentBooking } = require('./appointments.service');

/**
 * Handles the HTTP request for creating a new appointment booking.
 * The patient ID is taken from the authenticated user that was
 * attached to req.user by the backend auth middleware.
 */
async function bookAppointment(req, res) {
  try {
    // Read the authenticated patient's ID from the middleware
    const patientId = req.user.id;
    const { clinic_id: clinicId, slot_id: slotId } = req.body;

    // Call the service layer to validate the slot and create the booking
    const result = await createAppointmentBooking({
      patientId,
      clinicId,
      slotId
    });

    // Return a successful booking response
    return res.status(201).json({
      success: true,
      message: 'Appointment booked successfully.',
      data: result
    });
  } catch (error) {
    // Use the service-defined status code when available
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create appointment booking.'
    });
  }
}

module.exports = {
  bookAppointment
};