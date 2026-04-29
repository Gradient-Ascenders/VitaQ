// Mock the Supabase client before importing the clinics service.
// The service queries clinics first, then appointment slots to compute availability counts.
const mockFrom = jest.fn();
const mockClinicSelect = jest.fn();
const mockClinicOrder = jest.fn();
const mockClinicLimit = jest.fn();
const mockClinicIlike = jest.fn();
const mockClinicOr = jest.fn();
const mockClinicEq = jest.fn();
const mockClinicUpdate = jest.fn();
const mockClinicSingle = jest.fn();

const mockSlotSelect = jest.fn();
const mockSlotIn = jest.fn();
const mockSlotEq = jest.fn();

let clinicQueryResult = { data: [], error: null };
let slotQueryResult = { data: [], error: null };

const clinicQuery = {
  select: mockClinicSelect,
  order: mockClinicOrder,
  limit: mockClinicLimit,
  ilike: mockClinicIlike,
  or: mockClinicOr,
  eq: mockClinicEq,
  update: mockClinicUpdate,
  single: mockClinicSingle,
  then: (resolve, reject) => Promise.resolve(clinicQueryResult).then(resolve, reject),
};

const slotQuery = {
  select: mockSlotSelect,
  in: mockSlotIn,
  eq: mockSlotEq,
  then: (resolve, reject) => Promise.resolve(slotQueryResult).then(resolve, reject),
};

jest.mock("../src/lib/supabaseClient", () => ({
  from: mockFrom,
}));

const {
  fetchClinics,
  updateClinicDetails,
} = require("../src/modules/clinics/clinics.service");

describe("fetchClinics", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset query results for each test so clinic and slot lookups stay independent.
    clinicQueryResult = { data: [], error: null };
    slotQueryResult = { data: [], error: null };

    mockFrom.mockImplementation((tableName) => {
      if (tableName === "clinics") {
        return clinicQuery;
      }

      if (tableName === "appointment_slots") {
        return slotQuery;
      }

      throw new Error(`Unexpected table queried: ${tableName}`);
    });

    mockClinicSelect.mockReturnValue(clinicQuery);
    mockClinicOrder.mockReturnValue(clinicQuery);
    mockClinicLimit.mockReturnValue(clinicQuery);
    mockClinicIlike.mockReturnValue(clinicQuery);
    mockClinicOr.mockReturnValue(clinicQuery);
    mockClinicEq.mockReturnValue(clinicQuery);
    mockClinicUpdate.mockReturnValue(clinicQuery);
    mockClinicSingle.mockImplementation(() => Promise.resolve(clinicQueryResult));

    mockSlotSelect.mockReturnValue(slotQuery);
    mockSlotIn.mockReturnValue(slotQuery);
    mockSlotEq.mockReturnValue(slotQuery);
  });

  test("returns normalized clinic data", async () => {
    clinicQueryResult = {
      data: [
        {
          id: 1,
          name: "Hillbrow Clinic",
          province: "Gauteng",
          district: "Johannesburg",
          area: "Hillbrow",
          municipality: "City of Johannesburg",
          region: "Johannesburg Metro",
          facility_type: "Clinic",
          address: "12 Claim St",
          services_offered: "Primary Care",
          latitude: -26.1,
          longitude: 28.04,
          contact_number: "011 123 4567",
          contact_email: "info@hillbrowclinic.gov.za",
          contact_website: "https://example.com/hillbrow",
          source_dataset: "DSFSI covid19za health_system_za_hospitals_v1.csv",
          source_record_id: "hillbrow-clinic-001",
          source_last_updated: "2026-04-29T00:00:00.000Z",
          is_active: true,
          created_at: "2026-04-29T00:00:00.000Z",
          updated_at: "2026-04-29T00:00:00.000Z",
        },
      ],
      error: null,
    };

    slotQueryResult = {
      data: [
        {
          clinic_id: 1,
          date: "2099-06-01",
          end_time: "11:00:00",
          capacity: 5,
          booked_count: 2,
        },
      ],
      error: null,
    };

    const result = await fetchClinics();

    expect(result).toEqual([
      {
        id: 1,
        name: "Hillbrow Clinic",
        province: "Gauteng",
        district: "Johannesburg",
        area: "Hillbrow",
        municipality: "City of Johannesburg",
        region: "Johannesburg Metro",
        facility_type: "Clinic",
        address: "12 Claim St",
        services_offered: "Primary Care",
        latitude: -26.1,
        longitude: 28.04,
        contact_number: "011 123 4567",
        contact_email: "info@hillbrowclinic.gov.za",
        contact_website: "https://example.com/hillbrow",
        source_dataset: "DSFSI covid19za health_system_za_hospitals_v1.csv",
        source_record_id: "hillbrow-clinic-001",
        source_last_updated: "2026-04-29T00:00:00.000Z",
        is_active: true,
        created_at: "2026-04-29T00:00:00.000Z",
        updated_at: "2026-04-29T00:00:00.000Z",
        available_slots_count: 1,
      },
    ]);
  });

  test("normalizes missing optional dataset fields safely", async () => {
    clinicQueryResult = {
      data: [
        {
          id: 2,
          name: "Orange Farm Clinic",
          province: "Gauteng",
          district: "Johannesburg",
          area: null,
          municipality: null,
          region: null,
          facility_type: "Clinic",
          address: null,
          services_offered: null,
          latitude: null,
          longitude: null,
          contact_number: null,
          contact_email: null,
          contact_website: null,
          source_dataset: null,
          source_record_id: null,
          source_last_updated: null,
          is_active: false,
          created_at: null,
          updated_at: null,
        },
      ],
      error: null,
    };

    slotQueryResult = {
      data: [],
      error: null,
    };

    const result = await fetchClinics();

    expect(result).toEqual([
      {
        id: 2,
        name: "Orange Farm Clinic",
        province: "Gauteng",
        district: "Johannesburg",
        area: "",
        municipality: "",
        region: "",
        facility_type: "Clinic",
        address: "",
        services_offered: "",
        latitude: null,
        longitude: null,
        contact_number: "",
        contact_email: "",
        contact_website: "",
        source_dataset: "",
        source_record_id: "",
        source_last_updated: null,
        is_active: false,
        created_at: null,
        updated_at: null,
        available_slots_count: 0,
      },
    ]);
  });

  test("applies filters", async () => {
    await fetchClinics({
      search: "Hill",
      province: "Gauteng",
      district: "Johannesburg",
      area: "Hillbrow",
      municipality: "City of Johannesburg",
      region: "Johannesburg Metro",
      facility_type: "Clinic",
      services_offered: "Care",
    });

    expect(mockClinicEq).toHaveBeenCalledWith("is_active", true);
    expect(mockClinicLimit).toHaveBeenCalledWith(1000);

    expect(mockClinicOr).toHaveBeenCalledWith(
      "name.ilike.%Hill%,address.ilike.%Hill%,area.ilike.%Hill%,district.ilike.%Hill%,region.ilike.%Hill%,municipality.ilike.%Hill%"
    );

    expect(mockClinicIlike).toHaveBeenCalledWith("province", "Gauteng");
    expect(mockClinicIlike).toHaveBeenCalledWith("district", "Johannesburg");
    expect(mockClinicIlike).toHaveBeenCalledWith("area", "Hillbrow");
    expect(mockClinicIlike).toHaveBeenCalledWith("municipality", "City of Johannesburg");
    expect(mockClinicIlike).toHaveBeenCalledWith("region", "Johannesburg Metro");
    expect(mockClinicIlike).toHaveBeenCalledWith("facility_type", "Clinic");
    expect(mockClinicIlike).toHaveBeenCalledWith("services_offered", "%Care%");
  });

  test("returns an empty array when no clinics match", async () => {
    clinicQueryResult = {
      data: [],
      error: null,
    };

    const result = await fetchClinics();

    expect(result).toEqual([]);
    expect(mockFrom).toHaveBeenCalledWith("clinics");
    expect(mockFrom).not.toHaveBeenCalledWith("appointment_slots");
  });

  test("counts only bookable future slots for each clinic", async () => {
    clinicQueryResult = {
      data: [
        {
          id: "clinic-1",
          name: "Berario Clinic",
          province: "Gauteng",
          district: "City of Johannesburg",
          area: "Randburg",
          municipality: "City of Johannesburg",
          region: "Johannesburg Metro",
          facility_type: "Clinic",
          address: "12 Example St",
          services_offered: "General;Child health",
          latitude: null,
          longitude: null,
          contact_number: "",
          contact_email: "",
          contact_website: "",
          source_dataset: "",
          source_record_id: "",
          source_last_updated: null,
          is_active: true,
          created_at: null,
          updated_at: null,
        },
      ],
      error: null,
    };

    slotQueryResult = {
      data: [
        {
          clinic_id: "clinic-1",
          date: "2099-06-01",
          end_time: "10:00:00",
          capacity: 5,
          booked_count: 1,
        },
        {
          clinic_id: "clinic-1",
          date: "2099-06-02",
          end_time: "12:00:00",
          capacity: 2,
          booked_count: 2,
        },
        {
          clinic_id: "clinic-1",
          date: "2000-01-01",
          end_time: "09:00:00",
          capacity: 3,
          booked_count: 1,
        },
        {
          clinic_id: "clinic-1",
          date: new Date().toISOString().split("T")[0],
          end_time: "00:00:00",
          capacity: 4,
          booked_count: 1,
        },
      ],
      error: null,
    };

    const result = await fetchClinics();

    expect(mockSlotIn).toHaveBeenCalledWith("clinic_id", ["clinic-1"]);
    expect(mockSlotEq).toHaveBeenCalledWith("status", "available");
    expect(result[0].available_slots_count).toBe(1);
  });

  test("sorts clinics by available slots and uses clinic name as tie breaker", async () => {
    clinicQueryResult = {
      data: [
        {
          id: "clinic-2",
          name: "Zulu Clinic",
          province: "Gauteng",
          district: "Johannesburg",
          area: "Soweto",
          municipality: "City of Johannesburg",
          region: "Johannesburg Metro",
          facility_type: "Clinic",
          address: "2 Example St",
          services_offered: "General",
          latitude: null,
          longitude: null,
          contact_number: "",
          contact_email: "",
          contact_website: "",
          source_dataset: "",
          source_record_id: "",
          source_last_updated: null,
          is_active: true,
          created_at: null,
          updated_at: null,
        },
        {
          id: "clinic-1",
          name: "Alpha Clinic",
          province: "Gauteng",
          district: "Johannesburg",
          area: "Randburg",
          municipality: "City of Johannesburg",
          region: "Johannesburg Metro",
          facility_type: "Clinic",
          address: "1 Example St",
          services_offered: "General",
          latitude: null,
          longitude: null,
          contact_number: "",
          contact_email: "",
          contact_website: "",
          source_dataset: "",
          source_record_id: "",
          source_last_updated: null,
          is_active: true,
          created_at: null,
          updated_at: null,
        },
        {
          id: "clinic-3",
          name: "Beta Clinic",
          province: "Gauteng",
          district: "Johannesburg",
          area: "Roodepoort",
          municipality: "City of Johannesburg",
          region: "Johannesburg Metro",
          facility_type: "Clinic",
          address: "3 Example St",
          services_offered: "General",
          latitude: null,
          longitude: null,
          contact_number: "",
          contact_email: "",
          contact_website: "",
          source_dataset: "",
          source_record_id: "",
          source_last_updated: null,
          is_active: true,
          created_at: null,
          updated_at: null,
        },
      ],
      error: null,
    };

    slotQueryResult = {
      data: [
        {
          clinic_id: "clinic-1",
          date: "2099-06-01",
          end_time: "09:00:00",
          capacity: 5,
          booked_count: 4,
        },
        {
          clinic_id: "clinic-2",
          date: "2099-06-01",
          end_time: "10:00:00",
          capacity: 5,
          booked_count: 4,
        },
        {
          clinic_id: "clinic-3",
          date: "2099-06-02",
          end_time: "11:00:00",
          capacity: 5,
          booked_count: 5,
        },
      ],
      error: null,
    };

    const result = await fetchClinics();

    expect(result.map((clinic) => clinic.name)).toEqual([
      "Alpha Clinic",
      "Zulu Clinic",
      "Beta Clinic",
    ]);
    expect(result.map((clinic) => clinic.available_slots_count)).toEqual([1, 1, 0]);
  });

  test("batches slot lookups when many clinics are returned", async () => {
    const clinics = Array.from({ length: 101 }, (_, index) => ({
      id: `clinic-${index + 1}`,
      name: `Clinic ${index + 1}`,
      province: "Gauteng",
      district: "Johannesburg",
      area: "Randburg",
      municipality: "City of Johannesburg",
      region: "Johannesburg Metro",
      facility_type: "Clinic",
      address: "Example Address",
      services_offered: "General",
      latitude: null,
      longitude: null,
      contact_number: "",
      contact_email: "",
      contact_website: "",
      source_dataset: "",
      source_record_id: "",
      source_last_updated: null,
      is_active: true,
      created_at: null,
      updated_at: null,
    }));

    clinicQueryResult = {
      data: clinics,
      error: null,
    };

    slotQueryResult = {
      data: [],
      error: null,
    };

    const result = await fetchClinics();

    expect(result).toHaveLength(101);
    expect(mockSlotIn).toHaveBeenCalledTimes(2);

    expect(mockSlotIn).toHaveBeenNthCalledWith(
      1,
      "clinic_id",
      clinics.slice(0, 100).map((clinic) => clinic.id)
    );

    expect(mockSlotIn).toHaveBeenNthCalledWith(
      2,
      "clinic_id",
      ["clinic-101"]
    );
  });

  test("counts same-day slots using South Africa time consistently", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse("2026-04-17T22:30:00.000Z"));

    try {
      clinicQueryResult = {
        data: [
          {
            id: "clinic-1",
            name: "Berario Clinic",
            province: "Gauteng",
            district: "City of Johannesburg",
            area: "Randburg",
            municipality: "City of Johannesburg",
            region: "Johannesburg Metro",
            facility_type: "Clinic",
            address: "12 Example St",
            services_offered: "General;Child health",
            latitude: null,
            longitude: null,
            contact_number: "",
            contact_email: "",
            contact_website: "",
            source_dataset: "",
            source_record_id: "",
            source_last_updated: null,
            is_active: true,
            created_at: null,
            updated_at: null,
          },
        ],
        error: null,
      };

      slotQueryResult = {
        data: [
          {
            clinic_id: "clinic-1",
            date: "2026-04-18",
            end_time: "00:15:00",
            capacity: 3,
            booked_count: 0,
          },
          {
            clinic_id: "clinic-1",
            date: "2026-04-18",
            end_time: "01:15:00",
            capacity: 3,
            booked_count: 0,
          },
        ],
        error: null,
      };

      const result = await fetchClinics();

      expect(result[0].available_slots_count).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("throws a clean error when appointment slot lookup fails", async () => {
    clinicQueryResult = {
      data: [
        {
          id: "clinic-1",
          name: "Berario Clinic",
          province: "Gauteng",
          district: "City of Johannesburg",
          area: "Randburg",
          municipality: "City of Johannesburg",
          region: "Johannesburg Metro",
          facility_type: "Clinic",
          address: "12 Example St",
          services_offered: "General",
          latitude: null,
          longitude: null,
          contact_number: "",
          contact_email: "",
          contact_website: "",
          source_dataset: "",
          source_record_id: "",
          source_last_updated: null,
          is_active: true,
          created_at: null,
          updated_at: null,
        },
      ],
      error: null,
    };

    slotQueryResult = {
      data: null,
      error: { message: "slot lookup failed" },
    };

    await expect(fetchClinics()).rejects.toThrow(
      "Clinic search failed: slot lookup failed"
    );
  });

  test("throws a clean error when supabase returns an error", async () => {
    clinicQueryResult = {
      data: null,
      error: { message: "db failed" },
    };

    await expect(fetchClinics()).rejects.toThrow(
      "Clinic search failed: db failed"
    );
  });

  test("updates approved clinic fields and returns normalized clinic data", async () => {
    clinicQueryResult = {
      data: {
        id: "clinic-1",
        name: "Berario Clinic",
        province: "Gauteng",
        district: "City of Johannesburg",
        area: "Randburg",
        municipality: "City of Johannesburg",
        region: "Johannesburg Metro",
        facility_type: "Clinic",
        address: "12 Example Street",
        services_offered: "Primary care;Child health",
        latitude: -26.1,
        longitude: 28.04,
        contact_number: "011 123 4567",
        contact_email: "info@berario.gov.za",
        contact_website: "https://example.com/berario",
        source_dataset: "dsfsi/covid19za health_system_za_hospitals_v1.csv",
        source_record_id: "berario-clinic-001",
        source_last_updated: "2026-04-29T00:00:00.000Z",
        is_active: false,
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-29T10:00:00.000Z",
      },
      error: null,
    };

    const result = await updateClinicDetails("clinic-1", {
      name: "  Berario Clinic  ",
      province: "Gauteng",
      district: "City of Johannesburg",
      area: "Randburg",
      municipality: "City of Johannesburg",
      region: "Johannesburg Metro",
      facility_type: "Clinic",
      address: "  12 Example Street  ",
      services_offered: "Primary care;Child health",
      latitude: "-26.1",
      longitude: 28.04,
      contact_number: "011 123 4567",
      contact_email: "info@berario.gov.za",
      contact_website: "https://example.com/berario",
      is_active: "false",
    });

    expect(mockFrom).toHaveBeenCalledWith("clinics");
    expect(mockClinicUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Berario Clinic",
        province: "Gauteng",
        district: "City of Johannesburg",
        area: "Randburg",
        municipality: "City of Johannesburg",
        region: "Johannesburg Metro",
        facility_type: "Clinic",
        address: "12 Example Street",
        services_offered: "Primary care;Child health",
        latitude: -26.1,
        longitude: 28.04,
        contact_number: "011 123 4567",
        contact_email: "info@berario.gov.za",
        contact_website: "https://example.com/berario",
        is_active: false,
        updated_at: expect.any(String),
      })
    );
    expect(mockClinicEq).toHaveBeenCalledWith("id", "clinic-1");
    expect(mockClinicSelect).toHaveBeenCalledWith(expect.stringContaining("source_record_id"));
    expect(mockClinicSingle).toHaveBeenCalledTimes(1);

    expect(result).toEqual({
      id: "clinic-1",
      name: "Berario Clinic",
      province: "Gauteng",
      district: "City of Johannesburg",
      area: "Randburg",
      municipality: "City of Johannesburg",
      region: "Johannesburg Metro",
      facility_type: "Clinic",
      address: "12 Example Street",
      services_offered: "Primary care;Child health",
      latitude: -26.1,
      longitude: 28.04,
      contact_number: "011 123 4567",
      contact_email: "info@berario.gov.za",
      contact_website: "https://example.com/berario",
      source_dataset: "dsfsi/covid19za health_system_za_hospitals_v1.csv",
      source_record_id: "berario-clinic-001",
      source_last_updated: "2026-04-29T00:00:00.000Z",
      is_active: false,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-29T10:00:00.000Z",
      available_slots_count: 0,
    });
  });

  test("rejects protected or unknown clinic update fields", async () => {
    await expect(
      updateClinicDetails("clinic-1", {
        source_dataset: "changed-source",
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid clinic update field(s): source_dataset",
    });

    expect(mockFrom).not.toHaveBeenCalled();
  });

  test("rejects empty required clinic fields", async () => {
    await expect(
      updateClinicDetails("clinic-1", {
        name: "   ",
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "name cannot be empty.",
    });

    expect(mockFrom).not.toHaveBeenCalled();
  });

  test("rejects invalid latitude and longitude values", async () => {
    await expect(
      updateClinicDetails("clinic-1", {
        latitude: -91,
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "latitude must be between -90 and 90.",
    });

    await expect(
      updateClinicDetails("clinic-1", {
        longitude: 181,
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "longitude must be between -180 and 180.",
    });

    expect(mockFrom).not.toHaveBeenCalled();
  });

  test("rejects an empty clinic update payload", async () => {
    await expect(updateClinicDetails("clinic-1", {})).rejects.toMatchObject({
      statusCode: 400,
      message: "At least one clinic detail must be provided.",
    });

    expect(mockFrom).not.toHaveBeenCalled();
  });

  test("throws a not found error when updating a missing clinic", async () => {
    clinicQueryResult = {
      data: null,
      error: {
        code: "PGRST116",
        message: "No rows found",
      },
    };

    await expect(
      updateClinicDetails("missing-clinic", {
        name: "Missing Clinic",
      })
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Clinic not found.",
    });
  });

  test("throws a clean error when clinic update fails", async () => {
    clinicQueryResult = {
      data: null,
      error: {
        message: "database update failed",
      },
    };

    await expect(
      updateClinicDetails("clinic-1", {
        name: "Berario Clinic",
      })
    ).rejects.toMatchObject({
      statusCode: 500,
      message: "Failed to update clinic details.",
    });
  });

});