// Mock the Supabase client before importing the reports service.
// This avoids real database calls during unit tests.
jest.mock('../src/lib/supabaseClient', () => ({
  from: jest.fn()
}));

const supabase = require('../src/lib/supabaseClient');
const {
  buildCsvReport,
  buildPdfReport,
  fetchReportRows
} = require('../src/modules/reports/reports.service');

/**
 * Creates a fake Supabase query builder.
 * The service chains select/filters/order, then awaits the query.
 */
function createMockQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    gte: jest.fn(() => query),
    lte: jest.fn(() => query),
    order: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  };

  return query;
}

describe('reports service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('exports a wait-time CSV report and applies clinic/date filters', async () => {
    const query = createMockQuery({
      data: [
        {
          report_type: 'wait-times',
          clinic_id: 'clinic-1',
          clinic_name: 'Rosebank Med Dental Centre',
          report_date: '2026-05-08',
          joined_hour: 8,
          queue_number: 1,
          source: 'appointment',
          status: 'complete',
          wait_minutes: 25,
          consultation_minutes: 20,
          joined_at: '2026-05-08T06:00:00Z',
          consultation_started_at: '2026-05-08T06:25:00Z',
          completed_at: '2026-05-08T06:45:00Z'
        }
      ],
      error: null
    });

    supabase.from.mockReturnValueOnce(query);

    const result = await buildCsvReport({
      reportType: 'wait-times',
      clinicId: ' clinic-1 ',
      startDate: '2026-05-01',
      endDate: '2026-05-31'
    });

    expect(supabase.from).toHaveBeenCalledWith('report_wait_time_export_dataset');
    expect(query.eq).toHaveBeenCalledWith('clinic_id', 'clinic-1');
    expect(query.gte).toHaveBeenCalledWith('report_date', '2026-05-01');
    expect(query.lte).toHaveBeenCalledWith('report_date', '2026-05-31');

    expect(result.filename).toMatch(/^vitaq-wait-times-report-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.rowCount).toBe(1);
    expect(result.content).toContain('report_type,date_range,clinic_filter');
    expect(result.content).toContain('wait-times,2026-05-01 to 2026-05-31,clinic-1');
    expect(result.content).toContain('Rosebank Med Dental Centre');
    expect(result.content).toContain('25');
  });

  test('escapes CSV values that contain commas or quotes', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [
          {
            report_type: 'summary',
            clinic_id: 'clinic-1',
            clinic_name: 'Clinic, "Central"',
            completed_queue_count: 1,
            average_wait_minutes: 25,
            average_consultation_minutes: 20,
            total_tracked_appointments: 3,
            attended_queue_count: 2,
            no_show_count: 1,
            no_show_rate_percentage: 33.33
          }
        ],
        error: null
      })
    );

    const result = await buildCsvReport({
      reportType: 'summary'
    });

    expect(result.content).toContain('"Clinic, ""Central"""');
  });

  test('exports an empty CSV report with only headers', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [],
        error: null
      })
    );

    const result = await buildCsvReport({
      reportType: 'no-shows'
    });

    expect(result.rowCount).toBe(0);
    expect(result.content).toContain('report_type,date_range,clinic_filter');
    expect(result.content).toContain('is_no_show');
  });

  test('uses the daily summary dataset when summary report has date filters', async () => {
    const query = createMockQuery({
      data: [],
      error: null
    });

    supabase.from.mockReturnValueOnce(query);

    await fetchReportRows({
      reportType: 'summary',
      startDate: '2026-05-01',
      endDate: '2026-05-31'
    });

    expect(supabase.from).toHaveBeenCalledWith(
      'report_daily_clinic_summary_export_dataset'
    );
    expect(query.gte).toHaveBeenCalledWith('report_date', '2026-05-01');
    expect(query.lte).toHaveBeenCalledWith('report_date', '2026-05-31');
  });

  test('rejects missing report type before querying Supabase', async () => {
    await expect(buildCsvReport({})).rejects.toMatchObject({
      message: 'reportType is required.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('rejects invalid report type before querying Supabase', async () => {
    await expect(
      buildCsvReport({
        reportType: 'appointments'
      })
    ).rejects.toMatchObject({
      message: 'reportType must be one of: wait-times, no-shows, summary.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('rejects invalid date format before querying Supabase', async () => {
    await expect(
      buildCsvReport({
        reportType: 'wait-times',
        startDate: '2026/05/01'
      })
    ).rejects.toMatchObject({
      message: 'startDate must be in YYYY-MM-DD format.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('rejects invalid date ranges before querying Supabase', async () => {
    await expect(
      buildCsvReport({
        reportType: 'wait-times',
        startDate: '2026-05-31',
        endDate: '2026-05-01'
      })
    ).rejects.toMatchObject({
      message: 'startDate cannot be after endDate.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('throws a service error when Supabase report query fails', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: null,
        error: { message: 'Database unavailable' }
      })
    );

    await expect(
      buildCsvReport({
        reportType: 'summary'
      })
    ).rejects.toMatchObject({
      message: 'Failed to fetch report export data.',
      statusCode: 500
    });
  });

  test('exports a simple PDF report as a buffer', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [
          {
            report_type: 'summary',
            clinic_id: 'clinic-1',
            clinic_name: 'Very Long Clinic Name That Should Be Truncated In PDF',
            completed_queue_count: 1,
            average_wait_minutes: 25,
            average_consultation_minutes: 20,
            total_tracked_appointments: 3,
            attended_queue_count: 2,
            no_show_count: 1,
            no_show_rate_percentage: 33.33
          }
        ],
        error: null
      })
    );

    const result = await buildPdfReport({
      reportType: 'summary'
    });

    expect(result.filename).toMatch(/^vitaq-summary-report-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(result.rowCount).toBe(1);
    expect(Buffer.isBuffer(result.content)).toBe(true);
    expect(result.content.toString('ascii', 0, 8)).toBe('%PDF-1.4');
    const pdfText = result.content.toString('ascii');

    expect(pdfText).toContain('Clinic');
    expect(pdfText).toContain('Avg Wait');
    expect(pdfText).toContain('--------');
    expect(pdfText).toContain('Very Long Clinic Name...');
  });
});