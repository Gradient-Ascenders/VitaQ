// Mock the Supabase client and queue-side effects before importing the appointments service.
// These tests focus on booking rules, slot count updates, and rollback behaviour.
const mockFrom = jest.fn();
const mockSlotSelect = jest.fn();
const mockSlotUpdate = jest.fn();
const mockAppointmentsSelect = jest.fn();
const mockAppointmentsInsert = jest.fn();
const mockAppointmentsDelete = jest.fn();
const mockQueueEntriesSelect = jest.fn();
const mockQueueEntriesInsert = jest.fn();
const mockAppointmentsUpdate = jest.fn();
const mockQueueEntriesUpdate = jest.fn();

// Each named result object controls one stage of the chained Supabase workflow.
let slotFetchResult;
let slotUpdateResult;
let rollbackResult;
let existingBookingsResult;
let appointmentInsertResult;
let patientAppointmentsResult;
let queueAppointmentFetchResult;
let queueExistingEntriesResult;
let queueNumberCountResult;
let queueOrderedEntriesResult;
let queueEntryInsertResult;
let appointmentDeleteResult;
let appointmentFetchResult;
let appointmentUpdateResult;
let queueEntryUpdateResult;

const slotSelectEq = jest.fn();
const slotSelectSingle = jest.fn();
const slotUpdateEq = jest.fn();
const slotUpdateSelect = jest.fn();
const appointmentsSelectEq = jest.fn();
const appointmentsSelectLimit = jest.fn();
const appointmentsSelectOrder = jest.fn();
const appointmentsSelectSingle = jest.fn();
const appointmentsInsertSelect = jest.fn();
const appointmentsInsertSingle = jest.fn();
const appointmentsDeleteEq = jest.fn();
const appointmentsUpdateEq = jest.fn();
const appointmentsUpdateSelect = jest.fn();
const appointmentsUpdateSingle = jest.fn();
const queueEntriesUpdateEq = jest.fn();
const queueEntriesUpdateSelect = jest.fn();

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
    single() {
        return appointmentsSelectSingle();
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

const appointmentsUpdateSingleChain = {
    single: appointmentsUpdateSingle,
};

const appointmentsUpdateChain = {
    eq(column, value) {
        return appointmentsUpdateEq(column, value);
    },
    select(selection) {
        return appointmentsUpdateSelect(selection);
    },
};

const queueEntriesUpdateChain = {
    eq(column, value) {
        return queueEntriesUpdateEq(column, value);
    },
    select(selection) {
        return queueEntriesUpdateSelect(selection);
    },
};

const appointmentsDeleteChain = {
    eq(column, value) {
        return appointmentsDeleteEq(column, value);
    },
};

function createQueueEntriesSelectChain(result) {
    const chain = {
        eq: jest.fn(() => chain),
        in: jest.fn(() => chain),
        order: jest.fn(() => chain),
        limit: jest.fn(() => Promise.resolve(result)),
        then(resolve, reject) {
            return Promise.resolve(result).then(resolve, reject);
        },
    };

    return chain;
}

const queueEntriesInsertSingleChain = {
    single: jest.fn(() => Promise.resolve(queueEntryInsertResult)),
};

const queueEntriesInsertChain = {
    select: jest.fn(() => queueEntriesInsertSingleChain),
};

jest.mock('../src/lib/supabaseClient', () => ({
    from: mockFrom,
}));

const {
    createAppointmentBooking,
    fetchAppointmentsByPatientId,
    cancelAppointment,
    rescheduleAppointment,
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

        appointmentFetchResult = {
            data: {
                id: 'appointment-1',
                patient_id: 'patient-1',
                clinic_id: 'clinic-1',
                slot_id: 'slot-1',
                status: 'booked',
                created_at: '2026-04-15T08:00:00.000Z',
                updated_at: '2026-04-15T08:00:00.000Z',
                cancelled_at: null,
                cancellation_reason: null,
                rescheduled_from_slot_id: null,
                rescheduled_at: null,
                notes: null,
            },
            error: null,
        };

        appointmentUpdateResult = {
            data: {
                ...appointmentFetchResult.data,
                status: 'cancelled',
                cancelled_at: '2026-04-15T09:00:00.000Z',
                cancellation_reason: 'No longer available',
                updated_at: '2026-04-15T09:00:00.000Z',
            },
            error: null,
        };

        queueEntryUpdateResult = {
            data: [
                {
                    id: 'queue-1',
                    clinic_id: 'clinic-1',
                    patient_id: 'patient-1',
                    appointment_id: 'appointment-1',
                    queue_number: 1,
                    queue_date: '2099-06-01',
                    source: 'appointment',
                    status: 'cancelled',
                    estimated_wait_minutes: 0,
                    created_at: '2026-04-15T08:05:00.000Z',
                    updated_at: '2026-04-15T09:00:00.000Z',
                },
            ],
            error: null,
        };

        patientAppointmentsResult = { data: [], error: null };
        queueAppointmentFetchResult = {
            data: {
                id: 'appointment-1',
                patient_id: 'patient-1',
                clinic_id: 'clinic-1',
                status: 'booked',
                slot: {
                    date: '2099-06-01',
                    start_time: '10:00:00',
                    end_time: '10:30:00',
                },
                clinic: {
                    name: 'Mangaung Clinic',
                    address: '123 Main Rd',
                    province: 'Free State',
                    district: 'Mangaung',
                    area: 'Botshabelo',
                    facility_type: 'clinic',
                },
            },
            error: null,
        };
        queueExistingEntriesResult = { data: [], error: null };
        queueNumberCountResult = { data: [], error: null };
        queueOrderedEntriesResult = { data: [], error: null };
        queueEntryInsertResult = {
            data: {
                id: 'queue-1',
                clinic_id: 'clinic-1',
                patient_id: 'patient-1',
                patient_label: null,
                visit_type: null,
                time_label: null,
                created_by_staff_user_id: null,
                appointment_id: 'appointment-1',
                queue_number: 1,
                queue_date: '2099-06-01',
                source: 'appointment',
                status: 'waiting',
                estimated_wait_minutes: 0,
                created_at: '2026-04-15T08:05:00.000Z',
                updated_at: '2026-04-15T08:05:00.000Z',
            },
            error: null,
        };
        appointmentDeleteResult = { data: null, error: null };

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
                    update: mockAppointmentsUpdate,
                    delete: mockAppointmentsDelete,
                };
            }

            if (tableName === 'queue_entries') {
                return {
                    select: mockQueueEntriesSelect,
                    update: mockQueueEntriesUpdate,
                    insert: mockQueueEntriesInsert,
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
        appointmentsSelectSingle.mockImplementation(() => Promise.resolve(queueAppointmentFetchResult));

        mockAppointmentsInsert.mockReturnValue(appointmentsInsertChain);
        appointmentsInsertSelect.mockReturnValue(appointmentsInsertSingleChain);
        appointmentsInsertSingle.mockImplementation(() => Promise.resolve(appointmentInsertResult));

        mockAppointmentsUpdate.mockReturnValue(appointmentsUpdateChain);
        appointmentsUpdateEq.mockImplementation(() => appointmentsUpdateChain);
        appointmentsUpdateSelect.mockReturnValue(appointmentsUpdateSingleChain);
        appointmentsUpdateSingle.mockImplementation(() => Promise.resolve(appointmentUpdateResult));

        mockAppointmentsDelete.mockReturnValue(appointmentsDeleteChain);
        appointmentsDeleteEq.mockImplementation(() => Promise.resolve(appointmentDeleteResult));

        mockQueueEntriesSelect
            .mockImplementationOnce(() => createQueueEntriesSelectChain(queueExistingEntriesResult))
            .mockImplementationOnce(() => createQueueEntriesSelectChain(queueNumberCountResult))
            .mockImplementationOnce(() => createQueueEntriesSelectChain(queueOrderedEntriesResult));
        mockQueueEntriesInsert.mockReturnValue(queueEntriesInsertChain);
        queueEntriesInsertSingleChain.single.mockImplementation(() =>
            Promise.resolve(queueEntryInsertResult)
        );
        mockQueueEntriesUpdate.mockReturnValue(queueEntriesUpdateChain);
        queueEntriesUpdateEq.mockImplementation(() => queueEntriesUpdateChain);
        queueEntriesUpdateSelect.mockImplementation(() => Promise.resolve(queueEntryUpdateResult));
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
                queue: queueEntryInsertResult.data,
                position: 1,
            });
        });

        test('rolls back appointment and slot when queue entry creation fails', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            queueEntryInsertResult = {
                data: null,
                error: { message: 'queue insert failed' },
            };

            await expect(
                createAppointmentBooking({
                    patientId: 'patient-1',
                    clinicId: 'clinic-1',
                    slotId: 'slot-1',
                })
            ).rejects.toMatchObject({
                message: 'Appointment could not be completed because the queue entry failed.',
                statusCode: 500,
            });

            expect(mockAppointmentsDelete).toHaveBeenCalledTimes(1);
            expect(appointmentsDeleteEq).toHaveBeenCalledWith('id', 'appointment-1');
            expect(mockSlotUpdate).toHaveBeenNthCalledWith(2, {
                booked_count: 2,
            });
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Queue creation after booking failed:',
                expect.objectContaining({
                    message: 'Failed to join the queue.',
                    statusCode: 500,
                    stage: 'queue_entry_insert',
                    patientId: 'patient-1',
                    clinicId: 'clinic-1',
                    slotId: 'slot-1',
                    appointmentId: 'appointment-1',
                    supabaseError: expect.objectContaining({
                        message: 'queue insert failed',
                    }),
                })
            );

            consoleErrorSpy.mockRestore();
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
                        updated_at: '2026-04-15T09:00:00.000Z',
                        cancelled_at: null,
                        cancellation_reason: null,
                        rescheduled_from_slot_id: null,
                        rescheduled_at: '2026-04-15T09:00:00.000Z',
                        notes: 'Bring your previous prescription.',
                        clinic: {
                            name: 'Mangaung Clinic',
                            province: 'Free State',
                            district: 'Mangaung',
                            area: 'Botshabelo',
                            municipality: 'Mangaung',
                            region: 'Mangaung Metro',
                            facility_type: 'clinic',
                            contact_website: 'https://mangaung.example.org',
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
            expect(mockAppointmentsSelect).toHaveBeenCalledWith(
                expect.stringContaining('slot:appointment_slots!appointments_slot_id_fkey')
            );
            const appointmentSelect = mockAppointmentsSelect.mock.calls[0][0];
            expect(appointmentSelect).not.toContain('address');
            expect(appointmentSelect).not.toContain('contact_number');
            expect(appointmentSelect).not.toContain('contact_email');
            expect(appointmentsSelectEq).toHaveBeenCalledWith('patient_id', 'patient-1');
            expect(appointmentsSelectOrder).toHaveBeenCalledWith('created_at', {
                ascending: false,
            });
            expect(result[0].slot_id).toBe('slot-1');
            expect(result[0].rescheduled_at).toBe('2026-04-15T09:00:00.000Z');
            expect(result[0].notes).toBe('Bring your previous prescription.');
            expect(result[0].clinic.contact_website).toBe('https://mangaung.example.org');
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

        describe('cancelAppointment', () => {
            beforeEach(() => {
                appointmentsSelectSingle.mockImplementation(() =>
                    Promise.resolve(appointmentFetchResult)
                );

                slotSelectSingle.mockImplementation(() =>
                    Promise.resolve({
                        data: futureSlot({ id: 'slot-1', booked_count: 2 }),
                        error: null,
                    })
                );

                slotUpdateSelect.mockImplementation(() =>
                    Promise.resolve({
                        data: [futureSlot({ id: 'slot-1', booked_count: 1 })],
                        error: null,
                    })
                );
            });

            test('throws when required cancel fields are missing', async () => {
                await expect(
                    cancelAppointment({
                        patientId: 'patient-1',
                    })
                ).rejects.toMatchObject({
                    message: 'patient_id and appointment_id are required.',
                    statusCode: 400,
                });
            });

            test('throws when a patient tries to cancel another patient appointment', async () => {
                appointmentFetchResult = {
                    data: {
                        ...appointmentFetchResult.data,
                        patient_id: 'other-patient',
                    },
                    error: null,
                };

                await expect(
                    cancelAppointment({
                        patientId: 'patient-1',
                        appointmentId: 'appointment-1',
                    })
                ).rejects.toMatchObject({
                    message: 'You can only modify your own appointments.',
                    statusCode: 403,
                });
            });

            test('throws when appointment is already cancelled', async () => {
                appointmentFetchResult = {
                    data: {
                        ...appointmentFetchResult.data,
                        status: 'cancelled',
                    },
                    error: null,
                };

                await expect(
                    cancelAppointment({
                        patientId: 'patient-1',
                        appointmentId: 'appointment-1',
                    })
                ).rejects.toMatchObject({
                    message: 'Appointment is already cancelled.',
                    statusCode: 409,
                });
            });

            test('cancels appointment, decreases slot count, and cancels linked queue entry', async () => {
                const result = await cancelAppointment({
                    patientId: 'patient-1',
                    appointmentId: 'appointment-1',
                    cancellationReason: 'No longer available',
                });

                expect(mockSlotUpdate).toHaveBeenCalledWith({
                    booked_count: 1,
                });

                expect(mockAppointmentsUpdate).toHaveBeenCalledWith(
                    expect.objectContaining({
                        status: 'cancelled',
                        cancellation_reason: 'No longer available',
                    })
                );

                expect(mockQueueEntriesUpdate).toHaveBeenCalledWith(
                    expect.objectContaining({
                        status: 'cancelled',
                        estimated_wait_minutes: 0,
                    })
                );

                expect(result.appointment.status).toBe('cancelled');
                expect(result.slot.availability).toBe(4);
                expect(result.queue.status).toBe('cancelled');
            });

            test('rolls back slot count when appointment cancellation update fails', async () => {
                appointmentUpdateResult = {
                    data: null,
                    error: { message: 'update failed' },
                };

                await expect(
                    cancelAppointment({
                        patientId: 'patient-1',
                        appointmentId: 'appointment-1',
                        cancellationReason: 'No longer available',
                    })
                ).rejects.toMatchObject({
                    message: 'Failed to cancel appointment.',
                    statusCode: 500,
                });

                expect(mockSlotUpdate).toHaveBeenNthCalledWith(1, {
                    booked_count: 1,
                });

                expect(mockSlotUpdate).toHaveBeenNthCalledWith(2, {
                    booked_count: 2,
                });
            });
        });

        describe('rescheduleAppointment', () => {
            beforeEach(() => {
                appointmentsSelectSingle.mockImplementation(() =>
                    Promise.resolve(appointmentFetchResult)
                );

                slotSelectSingle
                    .mockImplementationOnce(() =>
                        Promise.resolve({
                            data: futureSlot({
                                id: 'slot-1',
                                clinic_id: 'clinic-1',
                                booked_count: 2,
                            }),
                            error: null,
                        })
                    )
                    .mockImplementationOnce(() =>
                        Promise.resolve({
                            data: futureSlot({
                                id: 'slot-2',
                                clinic_id: 'clinic-2',
                                date: '2099-06-02',
                                booked_count: 1,
                                capacity: 4,
                            }),
                            error: null,
                        })
                    );

                slotUpdateSelect
                    .mockImplementationOnce(() =>
                        Promise.resolve({
                            data: [
                                futureSlot({
                                    id: 'slot-1',
                                    clinic_id: 'clinic-1',
                                    booked_count: 1,
                                }),
                            ],
                            error: null,
                        })
                    )
                    .mockImplementationOnce(() =>
                        Promise.resolve({
                            data: [
                                futureSlot({
                                    id: 'slot-2',
                                    clinic_id: 'clinic-2',
                                    date: '2099-06-02',
                                    booked_count: 2,
                                    capacity: 4,
                                }),
                            ],
                            error: null,
                        })
                    );

                appointmentUpdateResult = {
                    data: {
                        ...appointmentFetchResult.data,
                        clinic_id: 'clinic-2',
                        slot_id: 'slot-2',
                        status: 'booked',
                        rescheduled_from_slot_id: 'slot-1',
                        rescheduled_at: '2026-04-15T09:00:00.000Z',
                        updated_at: '2026-04-15T09:00:00.000Z',
                    },
                    error: null,
                };

                queueExistingEntriesResult = {
                    data: [{ queue_number: 4 }],
                    error: null,
                };

                queueEntryUpdateResult = {
                    data: [
                        {
                            id: 'queue-1',
                            clinic_id: 'clinic-2',
                            patient_id: 'patient-1',
                            appointment_id: 'appointment-1',
                            queue_number: 5,
                            queue_date: '2099-06-02',
                            source: 'appointment',
                            status: 'waiting',
                            estimated_wait_minutes: 0,
                            created_at: '2026-04-15T08:05:00.000Z',
                            updated_at: '2026-04-15T09:00:00.000Z',
                        },
                    ],
                    error: null,
                };
            });

            test('throws when required reschedule fields are missing', async () => {
                await expect(
                    rescheduleAppointment({
                        patientId: 'patient-1',
                        appointmentId: 'appointment-1',
                    })
                ).rejects.toMatchObject({
                    message: 'patient_id, appointment_id, and new_slot_id are required.',
                    statusCode: 400,
                });
            });

            test('throws when patient tries to reschedule another patient appointment', async () => {
                appointmentFetchResult = {
                    data: {
                        ...appointmentFetchResult.data,
                        patient_id: 'other-patient',
                    },
                    error: null,
                };

                await expect(
                    rescheduleAppointment({
                        patientId: 'patient-1',
                        appointmentId: 'appointment-1',
                        newSlotId: 'slot-2',
                    })
                ).rejects.toMatchObject({
                    message: 'You can only modify your own appointments.',
                    statusCode: 403,
                });
            });

            test('throws when rescheduling to the same slot', async () => {
                await expect(
                    rescheduleAppointment({
                        patientId: 'patient-1',
                        appointmentId: 'appointment-1',
                        newSlotId: 'slot-1',
                    })
                ).rejects.toMatchObject({
                    message: 'New slot must be different from the current slot.',
                    statusCode: 400,
                });
            });

            test('throws when selected new slot is full', async () => {
                slotSelectSingle
                    .mockReset()
                    .mockImplementationOnce(() =>
                        Promise.resolve({
                            data: futureSlot({
                                id: 'slot-1',
                                clinic_id: 'clinic-1',
                                booked_count: 2,
                            }),
                            error: null,
                        })
                    )
                    .mockImplementationOnce(() =>
                        Promise.resolve({
                            data: futureSlot({
                                id: 'slot-2',
                                clinic_id: 'clinic-2',
                                booked_count: 4,
                                capacity: 4,
                            }),
                            error: null,
                        })
                    );

                await expect(
                    rescheduleAppointment({
                        patientId: 'patient-1',
                        appointmentId: 'appointment-1',
                        newSlotId: 'slot-2',
                    })
                ).rejects.toMatchObject({
                    message: 'Selected new slot is already full.',
                    statusCode: 409,
                });
            });

            test('throws when patient already has a different appointment for the new slot', async () => {
                existingBookingsResult = {
                    data: [{ id: 'appointment-2', status: 'booked' }],
                    error: null,
                };

                await expect(
                    rescheduleAppointment({
                        patientId: 'patient-1',
                        appointmentId: 'appointment-1',
                        newSlotId: 'slot-2',
                    })
                ).rejects.toMatchObject({
                    message: 'You already have an appointment for the selected new slot.',
                    statusCode: 409,
                });
            });

            test('reschedules appointment, moves slot counts, and updates linked queue entry', async () => {
                const result = await rescheduleAppointment({
                    patientId: 'patient-1',
                    appointmentId: 'appointment-1',
                    newSlotId: 'slot-2',
                });

                expect(mockSlotUpdate).toHaveBeenNthCalledWith(1, {
                    booked_count: 1,
                });

                expect(mockSlotUpdate).toHaveBeenNthCalledWith(2, {
                    booked_count: 2,
                });

                expect(mockAppointmentsUpdate).toHaveBeenCalledWith(
                    expect.objectContaining({
                        clinic_id: 'clinic-2',
                        slot_id: 'slot-2',
                        status: 'booked',
                        rescheduled_from_slot_id: 'slot-1',
                    })
                );

                expect(mockQueueEntriesUpdate).toHaveBeenCalledWith(
                    expect.objectContaining({
                        clinic_id: 'clinic-2',
                        queue_date: '2099-06-02',
                        queue_number: 5,
                        status: 'waiting',
                        estimated_wait_minutes: 0,
                    })
                );

                expect(result.appointment.slot_id).toBe('slot-2');
                expect(result.old_slot.availability).toBe(4);
                expect(result.new_slot.availability).toBe(2);
                expect(result.queue.queue_number).toBe(5);
            });

            test('rolls back old slot when reserving the new slot fails', async () => {
                slotUpdateSelect
                    .mockReset()
                    .mockImplementationOnce(() =>
                        Promise.resolve({
                            data: [
                                futureSlot({
                                    id: 'slot-1',
                                    clinic_id: 'clinic-1',
                                    booked_count: 1,
                                }),
                            ],
                            error: null,
                        })
                    )
                    .mockImplementationOnce(() =>
                        Promise.resolve({
                            data: null,
                            error: { message: 'new slot update failed' },
                        })
                    );

                await expect(
                    rescheduleAppointment({
                        patientId: 'patient-1',
                        appointmentId: 'appointment-1',
                        newSlotId: 'slot-2',
                    })
                ).rejects.toMatchObject({
                    message: 'Failed to reserve the new appointment slot.',
                    statusCode: 500,
                });

                expect(mockSlotUpdate).toHaveBeenNthCalledWith(1, {
                    booked_count: 1,
                });

                expect(mockSlotUpdate).toHaveBeenNthCalledWith(3, {
                    booked_count: 2,
                });
            });
        });
    });
});
