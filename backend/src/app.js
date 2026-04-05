// Import required packages
const express = require('express');
const cors = require('cors');

// Import the clinics route module
const clinicsRoutes = require('./modules/clinics/clinics.routes');

// Create the Express application
const app = express();

// Enable CORS so the frontend can make requests to the backend
app.use(cors());

// Allow the backend to read JSON request bodies
app.use(express.json());

// Simple health-check route to confirm the backend is running
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Backend is running'
  });
});

// Mount the clinics route module at /api/clinics
// Example: GET /api/clinics
app.use('/api/clinics', clinicsRoutes);

// Export the app so server.js can run it
module.exports = app;