import express from "express";
import { fetchClinicSlots } from "./slot.controller.js";

const router = express.Router();

/**
 * GET /api/clinics/:clinicId/slots
 *
 * Returns all available future appointment slots for a specific clinic.
 */
router.get('/:clinicId/slots', fetchClinicSlots);

export default router;