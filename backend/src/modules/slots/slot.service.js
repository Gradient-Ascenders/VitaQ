import { supabase } from "../../lib/supabaseClient.js";

/**
 * Fetches available appointment slots for a specific clinic.
 */
export async function getAvailableSlotsByClinicId(clinicId) {
  // Prevent unnecessary database queries if no clinic ID was supplied
  if (!clinicId) {
    throw new Error("Clinic ID is required.");
  }

  // Get the current date and time so expired slots can be filtered out
  const now = new Date();
  const today = now.toISOString().split("T")[0]; // Format: YYYY-MM-DD
  const currentTime = now.toTimeString().split(" ")[0]; // Format: HH:MM:SS

  // Query the appointment_slots table for slots belonging to the given clinic
  const { data, error } = await supabase
    .from("appointment_slots")
    .select("id, clinic_id, date, start_time, end_time, capacity, booked_count, status")
    .eq("clinic_id", clinicId)
    .eq("status", "available")
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  // Throw a readable error if Supabase returns an error
  if (error) {
    throw new Error(error.message);
  }

  // Filter the returned slots so only valid future slots with open capacity remain
  const filteredSlots = (data || []).filter((slot) => {
    // Calculate how many places are still open in the slot
    const remainingCapacity = (slot.capacity || 0) - (slot.booked_count || 0);

    // A slot is full if no remaining places are available
    const isFull = remainingCapacity <= 0;

    // Remove slots whose date is already in the past
    const isPastDate = slot.date < today;

    // If the slot is today, remove it if it has already ended
    const isPastTimeToday = slot.date === today && slot.end_time <= currentTime;

    // Keep only slots that are not full and not expired
    return !isFull && !isPastDate && !isPastTimeToday;
  });

  // Return the slots with an extra field that is useful for the frontend UI
  return filteredSlots.map((slot) => ({
    ...slot,
    availability: slot.capacity - slot.booked_count,
  }));
}