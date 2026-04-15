const mockFrom = jest.fn();
const mockSlotSelect = jest.fn();
const mockSlotUpdate = jest.fn();
const mockAppointmentsSelect = jest.fn();
const mockAppointmentsInsert = jest.fn();

let slotFetchResult;
let slotUpdateResult;
let rollbackResult;
let existingBookingsResult;
let appointmentInsertResult;
let patientAppointmentsResult;

const slotSelectEq = jest.fn();
const slotSelectSingle = jest.fn();
const slotUpdateEq = jest.fn();
const slotUpdateSelect = jest.fn();
const appointmentsSelectEq = jest.fn();
const appointmentsSelectLimit = jest.fn();
const appointmentsSelectOrder = jest.fn();
const appointmentsInsertSelect = jest.fn();
const appointmentsInsertSingle = jest.fn();

const slotSelectSingleChain = {
  single: slotSelectSingle,
};

const slotSelectChain = {
  eq: slotSelectEq,
};

const slotUpdateChain = {
  eq(column, value) {
    return slotUpdateEq(column, value);
  },
  select(selection) {
    return slotUpdateSelect(selection);
  },
  then(resolve, reject) {
    return Promise.resolve(rollbackResult).then(resolve, reject);
  },
};

const appointmentsSelectChain = {
  eq(column, value) {
    return appointmentsSelectEq(column, value);
  },
  limit(limitValue) {
    return appointmentsSelectLimit(limitValue);
  },
  order(column, config) {
    return appointmentsSelectOrder(column, config);
  },
};

const appointmentsInsertSingleChain = {
  single: appointmentsInsertSingle,
};

const appointmentsInsertChain = {
  select(selection) {
    return appointmentsInsertSelect(selection);
  },
};

jest.mock('../src/lib/supabaseClient', () => ({
  from: mockFrom,
}));

const {
  createAppointmentBooking,
  fetchAppointmentsByPatientId,
} = require('../src/modules/appointments/appointments.service');

function futureSlot(overrides = {}) {
  return {
    id: 'slot-1',
    clinic_id: 'clinic-1',
    date: '2099-06-01',
    start_time: '10:00:00',
    end_time: '10:30:00',
    capacity: 5,
    booked_count: 2,
    status: 'available',
    ...overrides,
  };
}

describe('appointments.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    slotFetchResult = { data: futureSlot(), error: null };
    slotUpdateResult = {
      data: [futureSlot({ booked_count: 3 })],
      error: null,
    };
    rollbackResult = { data: null, error: null };
    existingBookingsResult = { data: [], error: null };
    appointmentInsertResult = {
      data: {
        id: 'appointment-1',
        patient_id: 'patient-1',
        clinic_id: 'clinic-1',
        slot_id: 'slot-1',
        status: 'booked',
        created_at: '2026-04-15T08:00:00.000Z',
      },
      error: null,
    };
    patientAppointmentsResult = { data: [], error: null };

    mockFrom.mockImplementation((tableName) => {
      if (tableName === 'appointment_slots') {
        return {
          select: mockSlotSelect,
          update: mockSlotUpdate,
        };
      }

      if (tableName === 'appointments') {
        return {
          select: mockAppointmentsSelect,
          insert: mockAppointmentsInsert,
        };
      }

      throw new Error(`Unexpected table queried: ${tableName}`);
    });

    mockSlotSelect.mockReturnValue(slotSelectChain);
    slotSelectEq.mockReturnValue(slotSelectSingleChain);
    slotSelectSingle.mockImplementation(() => Promise.resolve(slotFetchResult));

    mockSlotUpdate.mockReturnValue(slotUpdateChain);
    slotUpdateEq.mockImplementation(() => slotUpdateChain);
    slotUpdateSelect.mockImplementation(() => Promise.resolve(slotUpdateResult));

    mockAppointmentsSelect.mockReturnValue(appointmentsSelectChain);
    appointmentsSelectEq.mockImplementation(() => appointmentsSelectChain);
    appointmentsSelectLimit.mockImplementation(() => Promise.resolve(existingBookingsResult));
    appointmentsSelectOrder.mockImplementation(() => Promise.resolve(patientAppointmentsResult));

    mockAppointmentsInsert.mockReturnValue(appointmentsInsertChain);
    appointmentsInsertSelect.mockReturnValue(appointmentsInsertSingleChain);
    appointmentsInsertSingle.mockImplementation(() => Promise.resolve(appointmentInsertResult));
  });

  describe('createAppointmentBooking', () => {
    test('throws when required booking fields are missing', async () => {
      await expect(
        createAppointmentBooking({
          patientId: 'patient-1',
          clinicId: 'clinic-1',
        })
      ).rejects.toMatchObject({
        message: 'patient_id, clinic_id, and slot_id are required.',
        statusCode: 400,
      });
    });

    test('throws when the selected slot does not exist', async () => {
      slotFetchResult = { data: null, error: { message: 'missing' } };

      await expect(
        createAppointmentBooking({
          patientId: 'patient-1',
          clinicId: 'clinic-1',
          slotId: 'slot-1',
        })
      ).rejects.toMatchObject({
        message: 'Selected slot does not exist.',
        statusCode: 404,
      });
    });

    test('throws when the slot belongs to a different clinic', async () => {
      slotFetchResult = {
        data: futureSlot({ clinic_id: 'clinic-2' }),
        error: null,
      };

      await expect(
        createAppointmentBooking({
          patientId: 'patient-1',
          clinicId: 'clinic-1',
          slotId: 'slot-1',
        })
      ).rejects.toMatchObject({
        message: 'Selected slot does not belong to this clinic.',
        statusCode: 400,
      });
    });

    test('throws when the slot is not available', async () => {
      slotFetchResult = {
        data: futureSlot({ status: 'cancelled' }),
        error: null,
      };

      await expect(
        createAppointmentBooking({
          patientId: 'patient-1',
          clinicId: 'clinic-1',
          slotId: 'slot-1',
        })
      ).rejects.toMatchObject({
        message: 'Selected slot is not available for booking.',
        statusCode: 409,
      });
    });

    test('throws when the slot has already expired', async () => {
      slotFetchResult = {
        data: {
          ...futureSlot(),
          date: '2000-01-01',
          end_time: '08:00:00',
        },
        error: null,
      };

      await expect(
        createAppointmentBooking({
          patientId: 'patient-1',
          clinicId: 'clinic-1',
          slotId: 'slot-1',
        })
      ).rejects.toMatchObject({
        message: 'Selected slot has already expired.',
        statusCode: 409,
      });
    });

    test('throws when the slot is already full', async () => {
      slotFetchResult = {
        data: futureSlot({ capacity: 2, booked_count: 2 }),
        error: null,
      };

      await expect(
        createAppointmentBooking({
          patientId: 'patient-1',
          clinicId: 'clinic-1',
          slotId: 'slot-1',
        })
      ).rejects.toMatchObject({
        message: 'Selected slot is already full.',
        statusCode: 409,
      });
    });

    test('throws when existing booking validation fails', async () => {
      existingBookingsResult = {
        data: null,
        error: { message: 'lookup failed' },
      };

      await expect(
        createAppointmentBooking({
          patientId: 'patient-1',
          clinicId: 'clinic-1',
          slotId: 'slot-1',
        })
      ).rejects.toMatchObject({
        message: 'Failed to validate existing bookings.',
        statusCode: 500,
      });
    });

    test('throws when the patient already booked the slot', async () => {
      existingBookingsResult = {
        data: [{ id: 'appointment-1', status: 'booked' }],
        error: null,
      };

      await expect(
        createAppointmentBooking({
          patientId: 'patient-1',
          clinicId: 'clinic-1',
          slotId: 'slot-1',
        })
      ).rejects.toMatchObject({
        message: 'You have already booked this slot.',
        statusCode: 409,
      });
    });

    test('throws when slot availability update fails', async () => {
      slotUpdateResult = {
        data: null,
        error: { message: 'update failed' },
      };

      await expect(
        createAppointmentBooking({
          patientId: 'patient-1',
          clinicId: 'clinic-1',
          slotId: 'slot-1',
        })
      ).rejects.toMatchObject({
        message: 'Failed to update slot availability.',
        statusCode: 500,
      });
    });

    test('throws when no slot row is updated during availability check', async () => {
      slotUpdateResult = {
        data: [],
        error: null,
      };

      await expect(
        createAppointmentBooking({
          patientId: 'patient-1',
          clinicId: 'clinic-1',
          slotId: 'slot-1',
        })
      ).rejects.toMatchObject({
        message: 'Slot is no longer available. Please refresh and try again.',
        statusCode: 409,
      });
    });

    test('rolls back slot count when appointment creation fails', async () => {
      appointmentInsertResult = {
        data: null,
        error: { message: 'insert failed' },
      };

      await expect(
        createAppointmentBooking({
          patientId: 'patient-1',
          clinicId: 'clinic-1',
          slotId: 'slot-1',
        })
      ).rejects.toMatchObject({
        message: 'Failed to create appointment booking.',
        statusCode: 500,
      });

      expect(mockSlotUpdate).toHaveBeenNthCalledWith(1, {
        booked_count: 3,
      });
      expect(mockSlotUpdate).toHaveBeenNthCalledWith(2, {
        booked_count: 2,
      });
      expect(slotUpdateEq).toHaveBeenNthCalledWith(3, 'id', 'slot-1');
      expect(slotUpdateEq).toHaveBeenNthCalledWith(4, 'booked_count', 3);
    });

    test('creates an appointment booking and returns updated availability', async () => {
      const result = await createAppointmentBooking({
        patientId: 'patient-1',
        clinicId: 'clinic-1',
        slotId: 'slot-1',
      });

      expect(mockSlotUpdate).toHaveBeenCalledWith({
        booked_count: 3,
      });
      expect(mockAppointmentsInsert).toHaveBeenCalledWith([
        {
          patient_id: 'patient-1',
          clinic_id: 'clinic-1',
          slot_id: 'slot-1',
          status: 'booked',
        },
      ]);
      expect(result).toEqual({
        appointment: appointmentInsertResult.data,
        slot: {
          ...slotUpdateResult.data[0],
          availability: 2,
        },
      });
    });
  });

  describe('fetchAppointmentsByPatientId', () => {
    test('throws when patient id is missing', async () => {
      await expect(fetchAppointmentsByPatientId()).rejects.toMatchObject({
        message: 'patient_id is required.',
        statusCode: 400,
      });
    });

    test('returns appointment records with slot ids for patient slot matching', async () => {
      patientAppointmentsResult = {
        data: [
          {
            id: 'appointment-1',
            clinic_id: 'clinic-1',
            slot_id: 'slot-1',
            status: 'booked',
            created_at: '2026-04-15T08:00:00.000Z',
            clinic: {
              name: 'Mangaung Clinic',
              address: '123 Main Rd',
              province: 'Free State',
              district: 'Mangaung',
              area: 'Botshabelo',
              facility_type: 'clinic',
            },
            slot: {
              date: '2026-04-16',
              start_time: '11:30:00',
              end_time: '12:00:00',
            },
          },
        ],
        error: null,
      };

      const result = await fetchAppointmentsByPatientId('patient-1');

      expect(mockFrom).toHaveBeenCalledWith('appointments');
      expect(appointmentsSelectEq).toHaveBeenCalledWith('patient_id', 'patient-1');
      expect(appointmentsSelectOrder).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
      expect(result[0].slot_id).toBe('slot-1');
    });

    test('throws a clean error when patient appointment lookup fails', async () => {
      patientAppointmentsResult = {
        data: null,
        error: { message: 'db failed' },
      };

      await expect(fetchAppointmentsByPatientId('patient-1')).rejects.toMatchObject({
        message: 'Failed to fetch patient appointments.',
        statusCode: 500,
      });
    });
  });
});
