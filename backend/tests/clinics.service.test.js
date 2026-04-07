const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockIlike = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

let mockResult = { data: [], error: null };

const mockQuery = {
  select: mockSelect,
  order: mockOrder,
  limit: mockLimit,
  ilike: mockIlike,
  then: (resolve, reject) => Promise.resolve(mockResult).then(resolve, reject),
};

jest.mock("../src/lib/supabaseClient", () => ({
  from: mockFrom,
}));

const { fetchClinics } = require("../src/modules/clinics/clinics.service");

describe("fetchClinics", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockResult = { data: [], error: null };

    mockFrom.mockReturnValue(mockQuery);
    mockSelect.mockReturnValue(mockQuery);
    mockOrder.mockReturnValue(mockQuery);
    mockLimit.mockReturnValue(mockQuery);
    mockIlike.mockReturnValue(mockQuery);
  });

  test("returns normalized clinic data", async () => {
    mockResult = {
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

    expect(mockIlike).toHaveBeenCalledWith("name", "%Hill%");
    expect(mockIlike).toHaveBeenCalledWith("province", "Gauteng");
    expect(mockIlike).toHaveBeenCalledWith("district", "Johannesburg");
    expect(mockIlike).toHaveBeenCalledWith("area", "Hillbrow");
    expect(mockIlike).toHaveBeenCalledWith("facility_type", "Clinic");
    expect(mockIlike).toHaveBeenCalledWith("services_offered", "%Care%");
  });

  test("throws a clean error when supabase returns an error", async () => {
    mockResult = {
      data: null,
      error: { message: "db failed" },
    };

    await expect(fetchClinics()).rejects.toThrow(
      "Clinic search failed: db failed"
    );
  });
});