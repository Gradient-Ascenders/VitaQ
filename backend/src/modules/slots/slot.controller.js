const { getAvailableSlotsByClinicId } = require('./slot.service');

async function fetchClinicSlots(req, res) {
  try {
    const { clinicId } = req.params;

    if (!clinicId) {
      return res.status(400).json({
        success: false,
        message: 'Clinic ID is required.'
      });
    }

    const slots = await getAvailableSlotsByClinicId(clinicId);

    return res.status(200).json({
      success: true,
      count: slots.length,
      data: slots
    });
  } catch (error) {
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