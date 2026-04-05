const express = require('express');
const cors = require('cors');

const clinicsRoutes = require('./modules/clinics/clinics.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Backend is running'
  });
});

app.use('/api/clinics', clinicsRoutes);

module.exports = app;