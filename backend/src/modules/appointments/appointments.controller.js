const { createAppointmentBooking } = require('./appointments.service');

/**
 * Handles the HTTP request for creating a new appointment booking.
 * patient_id:
 * - ideally comes from authenticated user data (req.user.id)
 * - can temporarily fall back to req.body.patient_id while auth middleware
 *   is still being wired into the backend
 */
async function bookAppointment(req, res) {
  try {
    // Prefer authenticated patient identity if available
    const patientId = req.user?.id || req.body.patient_id;
    const { clinic_id: clinicId, slot_id: slotId } = req.body;

    // Call the service layer to perform all booking validation and saving
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