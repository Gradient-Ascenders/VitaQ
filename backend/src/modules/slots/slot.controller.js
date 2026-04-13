const { getAvailableSlotsByClinicId } = require('./slot.service');

/**
 * Fetches all available slots for a specific clinic.
 * The clinic ID is read from the route parameter.
 */
async function fetchClinicSlots(req, res) {
  try {
    // Extract clinicId from the URL, for example /clinics/2/slots
    const { clinicId } = req.params;

    // Return a bad request response if no clinic ID was provided
    if (!clinicId) {
      return res.status(400).json({
        success: false,
        message: 'Clinic ID is required.'
      });
    }

    // Ask the service layer for all valid slots for this clinic
    const slots = await getAvailableSlotsByClinicId(clinicId);

    // Return the filtered slots
    return res.status(200).json({
      success: true,
      count: slots.length,
      data: slots
    });
  } catch (error) {
    // Return a server error if slot fetching fails
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch clinic slots.',
      error: error.message
    });
  }
}

module.exports = {
  fetchClinicSlots
};