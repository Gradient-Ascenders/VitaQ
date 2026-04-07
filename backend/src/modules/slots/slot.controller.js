import { getAvailableSlotsByClinicId } from "./slot.service.js";

/**
 * Controller function for handling requests to fetch slots for a clinic.
 */
export async function fetchClinicSlots(req, res) {
  try {
    // Read the clinic ID from the route parameters
    const { clinicId } = req.params;

    // Return a bad request response if clinicId was not provided
    if (!clinicId) {
      return res.status(400).json({
        success: false,
        message: "Clinic ID is required.",
      });
    }

    // Call the service layer to fetch filtered slots for this clinic
    const slots = await getAvailableSlotsByClinicId(clinicId);

    // Return a successful response with the slot data
    return res.status(200).json({
      success: true,
      clinicId,
      count: slots.length,
      data: slots,
    });
  } catch (error) {
    // Return a generic server error response if anything goes wrong
    return res.status(500).json({
      success: false,
      message: "Failed to fetch clinic slots.",
      error: error.message,
    });
  }
}