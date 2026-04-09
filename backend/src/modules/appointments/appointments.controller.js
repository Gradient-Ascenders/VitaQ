const {
  createAppointmentBooking,
  fetchAppointmentsByPatientId
} = require('./appointments.service');

async function bookAppointment(req, res) {
  try {
    const patientId = req.user.id;
    const { clinic_id: clinicId, slot_id: slotId } = req.body;

    const result = await createAppointmentBooking({
      patientId,
      clinicId,
      slotId
    });

    return res.status(201).json({
      success: true,
      message: 'Appointment booked successfully.',
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create appointment booking.'
    });
  }
}

async function getMyAppointments(req, res) {
  try {
    const patientId = req.user.id;
    const appointments = await fetchAppointmentsByPatientId(patientId);

    return res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments
    });
  } catch (error) {
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