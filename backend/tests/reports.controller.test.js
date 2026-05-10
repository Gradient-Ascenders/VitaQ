jest.mock('../src/modules/reports/reports.service', () => ({
  buildCsvReport: jest.fn(),
  buildPdfReport: jest.fn()
}));

const {
  buildCsvReport,
  buildPdfReport
} = require('../src/modules/reports/reports.service');

const {
  exportCsvReport,
  exportPdfReport
} = require('../src/modules/reports/reports.controller');

/**
 * Creates a minimal fake Express response object.
 */
function createMockResponse() {
  const res = {};

  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.setHeader = jest.fn(() => res);

  return res;
}

describe('reports controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exportCsvReport', () => {
    test('returns a CSV file response successfully', async () => {
      buildCsvReport.mockResolvedValueOnce({
        content: 'report_type,clinic_name\nsummary,Test Clinic',
        filename: 'vitaq-summary-report-2026-05-09.csv',
        rowCount: 1
      });

      const req = {
        query: {
          reportType: 'summary'
        }
      };
      const res = createMockResponse();

      await exportCsvReport(req, res);

      expect(buildCsvReport).toHaveBeenCalledWith(req.query);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv; charset=utf-8'
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="vitaq-summary-report-2026-05-09.csv"'
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(
        'report_type,clinic_name\nsummary,Test Clinic'
      );
    });

    test('returns a service error when CSV export fails', async () => {
      const error = new Error('reportType is required.');
      error.statusCode = 400;

      buildCsvReport.mockRejectedValueOnce(error);

      const req = {
        query: {}
      };
      const res = createMockResponse();

      await exportCsvReport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'reportType is required.'
      });
    });
  });

  describe('exportPdfReport', () => {
    test('returns a PDF file response successfully', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 test');

      buildPdfReport.mockResolvedValueOnce({
        content: pdfBuffer,
        filename: 'vitaq-summary-report-2026-05-09.pdf',
        rowCount: 1
      });

      const req = {
        query: {
          reportType: 'summary'
        }
      };
      const res = createMockResponse();

      await exportPdfReport(req, res);

      expect(buildPdfReport).toHaveBeenCalledWith(req.query);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="vitaq-summary-report-2026-05-09.pdf"'
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(pdfBuffer);
    });

    test('returns a service error when PDF export fails', async () => {
      const error = new Error('Failed to fetch report export data.');
      error.statusCode = 500;

      buildPdfReport.mockRejectedValueOnce(error);

      const req = {
        query: {
          reportType: 'summary'
        }
      };
      const res = createMockResponse();

      await exportPdfReport(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to fetch report export data.'
      });
    });
  });
});