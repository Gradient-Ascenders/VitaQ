const mockFrom = jest.fn();
const mockClinicSelect = jest.fn();
const mockClinicOrder = jest.fn();
const mockClinicLimit = jest.fn();
const mockClinicIlike = jest.fn();
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

const { fetchClinics } = require("../src/modules/clinics/clinics.service");

describe("fetchClinics", () => {
  beforeEach(() => {
    jest.clearAllMocks();

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
          facility_type: "Clinic",
          address: "12 Claim St",
          services_offered: "Primary Care",
          latitude: -26.1,
          longitude: 28.04,
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
        facility_type: "Clinic",
        address: "12 Claim St",
        services_offered: "Primary Care",
        latitude: -26.1,
        longitude: 28.04,
        available_slots_count: 1,
      },
    ]);
  });

  test("applies filters", async () => {
    await fetchClinics({
      search: "Hill",
      province: "Gauteng",
      district: "Johannesburg",
      area: "Hillbrow",
      facility_type: "Clinic",
      services_offered: "Care",
    });

    expect(mockClinicIlike).toHaveBeenCalledWith("name", "%Hill%");
    expect(mockClinicIlike).toHaveBeenCalledWith("province", "Gauteng");
    expect(mockClinicIlike).toHaveBeenCalledWith("district", "Johannesburg");
    expect(mockClinicIlike).toHaveBeenCalledWith("area", "Hillbrow");
    expect(mockClinicIlike).toHaveBeenCalledWith("facility_type", "Clinic");
    expect(mockClinicIlike).toHaveBeenCalledWith("services_offered", "%Care%");
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
          facility_type: "Clinic",
          address: "12 Example St",
          services_offered: "General;Child health",
          latitude: null,
          longitude: null,
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

  test("throws a clean error when supabase returns an error", async () => {
    clinicQueryResult = {
      data: null,
      error: { message: "db failed" },
    };

    await expect(fetchClinics()).rejects.toThrow(
      "Clinic search failed: db failed"
    );
  });
});
