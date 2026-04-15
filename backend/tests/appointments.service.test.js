const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();

let appointmentsQueryResult = { data: [], error: null };

const appointmentsQuery = {
  select: mockSelect,
  eq: mockEq,
  order: mockOrder,
  then: (resolve, reject) => Promise.resolve(appointmentsQueryResult).then(resolve, reject),
};

jest.mock('../src/lib/supabaseClient', () => ({
  from: mockFrom,
}));

const { fetchAppointmentsByPatientId } = require('../src/modules/appointments/appointments.service');

describe('fetchAppointmentsByPatientId', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    appointmentsQueryResult = { data: [], error: null };

    mockFrom.mockImplementation((tableName) => {
      if (tableName === 'appointments') {
        return appointmentsQuery;
      }

      throw new Error(`Unexpected table queried: ${tableName}`);
    });

    mockSelect.mockReturnValue(appointmentsQuery);
    mockEq.mockReturnValue(appointmentsQuery);
    mockOrder.mockReturnValue(appointmentsQuery);
  });

  test('returns appointment records with slot ids for patient slot matching', async () => {
    appointmentsQueryResult = {
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
    expect(mockEq).toHaveBeenCalledWith('patient_id', 'patient-1');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result[0].slot_id).toBe('slot-1');
  });
});
