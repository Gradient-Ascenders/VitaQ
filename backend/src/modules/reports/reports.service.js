const supabase = require('../../lib/supabaseClient');

const REPORT_TYPES = ['wait-times', 'no-shows', 'summary'];

const REPORT_CONFIGS = {
  'wait-times': {
    viewName: 'report_wait_time_export_dataset',
    dateColumn: 'report_date',
    orderColumns: ['report_date', 'clinic_name'],
    fields: [
      'report_type',
      'date_range',
      'clinic_filter',
      'generated_at',
      'clinic_name',
      'report_date',
      'joined_hour',
      'queue_number',
      'source',
      'status',
      'wait_minutes',
      'consultation_minutes',
      'joined_at',
      'consultation_started_at',
      'completed_at'
    ]
  },

  'no-shows': {
    viewName: 'report_no_show_export_dataset',
    dateColumn: 'report_date',
    orderColumns: ['report_date', 'clinic_name'],
    fields: [
      'report_type',
      'date_range',
      'clinic_filter',
      'generated_at',
      'clinic_name',
      'report_date',
      'start_time',
      'end_time',
      'appointment_status',
      'queue_entry_count',
      'has_queue_entry',
      'is_past_appointment',
      'is_no_show'
    ]
  },

  summary: {
    viewName: 'report_clinic_summary_export_dataset',
    dateColumn: null,
    orderColumns: ['clinic_name'],
    fields: [
      'report_type',
      'date_range',
      'clinic_filter',
      'generated_at',
      'clinic_name',
      'completed_queue_count',
      'average_wait_minutes',
      'average_consultation_minutes',
      'total_tracked_appointments',
      'attended_queue_count',
      'no_show_count',
      'no_show_rate_percentage'
    ]
  }
};

const DAILY_SUMMARY_CONFIG = {
  viewName: 'report_daily_clinic_summary_export_dataset',
  dateColumn: 'report_date',
  orderColumns: ['report_date', 'clinic_name'],
  fields: [
    'report_type',
    'date_range',
    'clinic_filter',
    'generated_at',
    'clinic_name',
    'report_date',
    'completed_queue_count',
    'average_wait_minutes',
    'average_consultation_minutes',
    'total_tracked_appointments',
    'attended_queue_count',
    'no_show_count',
    'no_show_rate_percentage'
  ]
};

/**
 * Creates a service error with an HTTP status code.
 * Controllers use statusCode to decide the response status.
 */
function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Validates YYYY-MM-DD date strings before they are sent to Supabase.
 */
function validateDateFilter(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const trimmedValue = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmedValue);

  if (!match) {
    throw createServiceError(`${fieldName} must be in YYYY-MM-DD format.`, 400);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  const isRealDate =
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day;

  if (!isRealDate) {
    throw createServiceError(`${fieldName} must be a valid date.`, 400);
  }

  return trimmedValue;
}

/**
 * Normalizes the optional clinic filter.
 * Empty values and "all" mean no clinic filter should be applied.
 */
function normalizeClinicId(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmedValue = String(value).trim();

  if (!trimmedValue || trimmedValue.toLowerCase() === 'all') {
    return null;
  }

  return trimmedValue;
}

/**
 * Validates and normalizes the export filters.
 */
function normalizeReportFilters(filters = {}) {
  const reportType = String(filters.reportType || '').trim().toLowerCase();

  if (!reportType) {
    throw createServiceError('reportType is required.', 400);
  }

  if (!REPORT_TYPES.includes(reportType)) {
    throw createServiceError(
      'reportType must be one of: wait-times, no-shows, summary.',
      400
    );
  }

  const clinicId = normalizeClinicId(filters.clinicId);
  const startDate = validateDateFilter(filters.startDate, 'startDate');
  const endDate = validateDateFilter(filters.endDate, 'endDate');

  if (startDate && endDate && startDate > endDate) {
    throw createServiceError('startDate cannot be after endDate.', 400);
  }

  return {
    reportType,
    clinicId,
    startDate,
    endDate,
    dateRangeLabel: buildDateRangeLabel(startDate, endDate)
  };
}

/**
 * Uses the daily summary dataset when summary reports need date filters.
 * Without date filters, summary stays clinic-level.
 */
function resolveReportConfig(normalizedFilters) {
  if (
    normalizedFilters.reportType === 'summary' &&
    (normalizedFilters.startDate || normalizedFilters.endDate)
  ) {
    return DAILY_SUMMARY_CONFIG;
  }

  return REPORT_CONFIGS[normalizedFilters.reportType];
}

/**
 * Builds a readable date-range label for CSV/PDF metadata.
 */
function buildDateRangeLabel(startDate, endDate) {
  if (startDate && endDate) {
    return `${startDate} to ${endDate}`;
  }

  if (startDate) {
    return `From ${startDate}`;
  }

  if (endDate) {
    return `Until ${endDate}`;
  }

  return 'All dates';
}

/**
 * Converts database field names into readable CSV/PDF headings.
 */
function formatHeading(fieldName) {
  return String(fieldName)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Escapes CSV cells so commas, quotes, and new lines do not break the export.
 */
function formatCsvCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Converts rows and selected fields into CSV text.
 * Empty reports still return a header row so the download remains valid.
 */
function buildCsvContent(rows, fields) {
  const headerRow = fields.map(formatCsvCell).join(',');
  const dataRows = rows.map((row) =>
    fields.map((field) => formatCsvCell(row[field])).join(',')
  );

  return [headerRow, ...dataRows].join('\n');
}

/**
 * Adds consistent report metadata to every exported row.
 */
function addExportMetadata(row, normalizedFilters, generatedAt) {
  return {
    ...row,
    report_type: normalizedFilters.reportType,
    date_range: normalizedFilters.dateRangeLabel,
    clinic_filter: normalizedFilters.clinicId || 'All clinics',
    generated_at: generatedAt
  };
}

/**
 * Fetches report rows from the correct export dataset view.
 */
async function fetchReportRows(filters = {}) {
  const normalizedFilters = normalizeReportFilters(filters);
  const config = resolveReportConfig(normalizedFilters);

  let query = supabase.from(config.viewName).select('*');

  if (normalizedFilters.clinicId) {
    query = query.eq('clinic_id', normalizedFilters.clinicId);
  }

  if (config.dateColumn && normalizedFilters.startDate) {
    query = query.gte(config.dateColumn, normalizedFilters.startDate);
  }

  if (config.dateColumn && normalizedFilters.endDate) {
    query = query.lte(config.dateColumn, normalizedFilters.endDate);
  }

  config.orderColumns.forEach((column) => {
    query = query.order(column, { ascending: true });
  });

  const { data, error } = await query;

  if (error) {
    throw createServiceError('Failed to fetch report export data.', 500);
  }

  const generatedAt = new Date().toISOString();
  const rows = (Array.isArray(data) ? data : []).map((row) =>
    addExportMetadata(row, normalizedFilters, generatedAt)
  );

  return {
    rows,
    config,
    filters: normalizedFilters,
    generatedAt
  };
}

/**
 * Creates a safe filename for downloaded reports.
 */
function buildReportFilename(reportType, extension) {
  const datePart = new Date().toISOString().slice(0, 10);
  return `vitaq-${reportType}-report-${datePart}.${extension}`;
}

/**
 * Builds a downloadable CSV report.
 */
async function buildCsvReport(filters = {}) {
  const reportData = await fetchReportRows(filters);
  const csv = buildCsvContent(reportData.rows, reportData.config.fields);

  return {
    content: csv,
    filename: buildReportFilename(reportData.filters.reportType, 'csv'),
    rowCount: reportData.rows.length
  };
}

/**
 * Converts a value into a number for simple PDF summary calculations.
 */
function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

/**
 * Builds a few summary lines for the PDF report.
 */
function buildPdfSummaryLines(rows, reportType) {
  if (reportType === 'wait-times') {
    const totalWait = rows.reduce((total, row) => total + toNumber(row.wait_minutes), 0);
    const totalConsultation = rows.reduce(
      (total, row) => total + toNumber(row.consultation_minutes),
      0
    );

    return [
      `Completed queue rows: ${rows.length}`,
      `Average wait minutes: ${rows.length ? (totalWait / rows.length).toFixed(2) : '0.00'}`,
      `Average consultation minutes: ${
        rows.length ? (totalConsultation / rows.length).toFixed(2) : '0.00'
      }`
    ];
  }

  if (reportType === 'no-shows') {
    const noShowCount = rows.filter((row) => row.is_no_show === true).length;
    const attendedCount = rows.filter((row) => row.has_queue_entry === true).length;

    return [
      `Appointment rows: ${rows.length}`,
      `No-show rows: ${noShowCount}`,
      `Rows with queue entry: ${attendedCount}`
    ];
  }

  const completedQueueCount = rows.reduce(
    (total, row) => total + toNumber(row.completed_queue_count),
    0
  );
  const noShowCount = rows.reduce((total, row) => total + toNumber(row.no_show_count), 0);
  const trackedAppointments = rows.reduce(
    (total, row) => total + toNumber(row.total_tracked_appointments),
    0
  );

  return [
    `Summary rows: ${rows.length}`,
    `Completed queue count: ${completedQueueCount}`,
    `Tracked appointments: ${trackedAppointments}`,
    `No-show count: ${noShowCount}`
  ];
}

const PDF_TABLE_COLUMNS = {
  summary: [
    { field: 'clinic_name', heading: 'Clinic', width: 24, align: 'left' },
    { field: 'completed_queue_count', heading: 'Queues', width: 7, align: 'right' },
    { field: 'average_wait_minutes', heading: 'Avg Wait', width: 9, align: 'right' },
    { field: 'average_consultation_minutes', heading: 'Avg Cons', width: 9, align: 'right' },
    { field: 'total_tracked_appointments', heading: 'Tracked', width: 8, align: 'right' },
    { field: 'no_show_count', heading: 'No-show', width: 8, align: 'right' },
    { field: 'no_show_rate_percentage', heading: 'Rate %', width: 7, align: 'right' }
  ],

  'wait-times': [
    { field: 'clinic_name', heading: 'Clinic', width: 24, align: 'left' },
    { field: 'report_date', heading: 'Date', width: 10, align: 'left' },
    { field: 'joined_hour', heading: 'Hour', width: 5, align: 'right' },
    { field: 'queue_number', heading: 'Queue', width: 6, align: 'right' },
    { field: 'wait_minutes', heading: 'Wait', width: 7, align: 'right' },
    { field: 'consultation_minutes', heading: 'Consult', width: 8, align: 'right' }
  ],

  'no-shows': [
    { field: 'clinic_name', heading: 'Clinic', width: 24, align: 'left' },
    { field: 'report_date', heading: 'Date', width: 10, align: 'left' },
    { field: 'start_time', heading: 'Start', width: 8, align: 'left' },
    { field: 'appointment_status', heading: 'Status', width: 10, align: 'left' },
    { field: 'has_queue_entry', heading: 'Queued', width: 7, align: 'left' },
    { field: 'is_no_show', heading: 'No-show', width: 8, align: 'left' }
  ]
};

/**
 * Shortens long PDF table values so they do not wrap and break alignment.
 */
function truncatePdfCell(value, width) {
  const stringValue = String(value ?? '');

  if (stringValue.length <= width) {
    return stringValue;
  }

  if (width <= 3) {
    return '.'.repeat(width);
  }

  return `${stringValue.slice(0, width - 3)}...`;
}

/**
 * Formats booleans and empty values into readable PDF table cells.
 */
function formatPdfTableValue(field, value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (field === 'has_queue_entry' || field === 'is_no_show') {
    return value === true || String(value).toLowerCase() === 'true' ? 'Yes' : 'No';
  }

  return String(value);
}

/**
 * Pads a PDF table cell to a fixed width so columns line up consistently.
 */
function padPdfCell(value, width, align = 'left') {
  const truncatedValue = truncatePdfCell(value, width);

  if (align === 'right') {
    return truncatedValue.padStart(width, ' ');
  }

  return truncatedValue.padEnd(width, ' ');
}

/**
 * Builds a fixed-width PDF preview table.
 * This avoids pipe-separated text that becomes unreadable when values are long.
 */
function buildPdfPreviewTableRows(rows, reportType) {
  const columns = PDF_TABLE_COLUMNS[reportType] || PDF_TABLE_COLUMNS.summary;

  const headerRow = columns
    .map((column) => padPdfCell(column.heading, column.width, column.align))
    .join(' ');

  const separatorRow = columns
    .map((column) => '-'.repeat(column.width))
    .join(' ');

  const dataRows = rows.slice(0, 25).map((row) =>
    columns
      .map((column) =>
        padPdfCell(
          formatPdfTableValue(column.field, row[column.field]),
          column.width,
          column.align
        )
      )
      .join(' ')
  );

  return [headerRow, separatorRow, ...dataRows];
}

/**
 * Keeps PDF text simple and ASCII-safe for the lightweight PDF generator.
 */
function escapePdfText(value) {
  return String(value ?? '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Creates a simple valid PDF buffer without adding a new package dependency.
 * The PDF intentionally stays basic for Sprint 4: title, filters, summary,
 * and a small preview table.
 */
function createSimplePdfBuffer(lines) {
  const textCommands = [
    'BT',
    '/F1 9 Tf',
    '12 TL',
    '40 790 Td',
    ...lines.map((line, index) => {
      const text = `(${escapePdfText(line).slice(0, 110)}) Tj`;
      return index === 0 ? text : `T* ${text}`;
    }),
    'ET'
  ].join('\n');

  const contentLength = Buffer.byteLength(textCommands, 'ascii');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    `<< /Length ${contentLength} >>\nstream\n${textCommands}\nendstream`
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'ascii');

  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'ascii');
}

/**
 * Builds the PDF lines shown in the exported report.
 */
function buildPdfLines(reportData) {
  const { rows, filters, generatedAt } = reportData;

  const lines = [
    'VitaQ Report',
    `Report type: ${filters.reportType}`,
    `Date range: ${filters.dateRangeLabel}`,
    `Clinic filter: ${filters.clinicId || 'All clinics'}`,
    `Generated at: ${generatedAt}`,
    `Rows exported: ${rows.length}`,
    '',
    'Summary statistics:',
    ...buildPdfSummaryLines(rows, filters.reportType),
    '',
    'Preview table:',
    ...buildPdfPreviewTableRows(rows, filters.reportType)
  ];

  if (rows.length > 25) {
    lines.push(`Showing first 25 of ${rows.length} rows. Use CSV for full row-level export.`);
  }

  return lines;
}

/**
 * Builds a downloadable PDF report.
 */
async function buildPdfReport(filters = {}) {
  const reportData = await fetchReportRows(filters);
  const pdfLines = buildPdfLines(reportData);
  const pdfBuffer = createSimplePdfBuffer(pdfLines);

  return {
    content: pdfBuffer,
    filename: buildReportFilename(reportData.filters.reportType, 'pdf'),
    rowCount: reportData.rows.length
  };
}

module.exports = {
  buildCsvReport,
  buildPdfReport,
  fetchReportRows
};