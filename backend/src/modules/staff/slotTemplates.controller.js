const {
  createSlotTemplateForStaff,
  generateUpcomingSlotsForStaff,
  listSlotTemplatesForStaff,
  updateSlotTemplateForStaff
} = require('./slotTemplates.service');

async function getSlotTemplates(req, res) {
  try {
    const templates = await listSlotTemplatesForStaff({
      staffUserId: req.user.id
    });

    return res.status(200).json({
      success: true,
      count: templates.length,
      data: templates
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch slot templates.'
    });
  }
}

async function createSlotTemplate(req, res) {
  try {
    const {
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      capacity,
      status
    } = req.body;

    const template = await createSlotTemplateForStaff({
      staffUserId: req.user.id,
      dayOfWeek,
      startTime,
      endTime,
      capacity,
      status
    });

    return res.status(201).json({
      success: true,
      message: 'Slot template created successfully.',
      data: template
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create slot template.'
    });
  }
}

async function updateSlotTemplate(req, res) {
  try {
    const { templateId } = req.params;
    const {
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      capacity,
      status
    } = req.body;

    const template = await updateSlotTemplateForStaff({
      staffUserId: req.user.id,
      templateId,
      dayOfWeek,
      startTime,
      endTime,
      capacity,
      status
    });

    return res.status(200).json({
      success: true,
      message: 'Slot template updated successfully.',
      data: template
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update slot template.'
    });
  }
}

async function generateUpcomingSlots(req, res) {
  try {
    const { days_ahead: daysAhead } = req.body || {};

    const result = await generateUpcomingSlotsForStaff({
      staffUserId: req.user.id,
      daysAhead: daysAhead === undefined ? 14 : daysAhead
    });

    return res.status(200).json({
      success: true,
      message: 'Upcoming appointment slots generated successfully.',
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to generate appointment slots.'
    });
  }
}

module.exports = {
  createSlotTemplate,
  generateUpcomingSlots,
  getSlotTemplates,
  updateSlotTemplate
};
