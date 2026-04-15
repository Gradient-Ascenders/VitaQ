const express = require('express');
const cors = require('cors');
const path = require('path');

// Import route modules
const clinicsRoutes = require('./modules/clinics/clinics.routes');
const slotRoutes = require('./modules/slots/slot.routes');
const appointmentsRoutes = require('./modules/appointments/appointments.routes');

// Create the Express application
const app = express();

// Root/frontend paths
const rootDir = path.join(__dirname, '..', '..');
const frontendDir = path.join(rootDir, 'frontend');

// Enable CORS
app.use(cors());

// Allow JSON request bodies
app.use(express.json());

// Serve frontend static files
app.use('/assets', express.static(path.join(frontendDir, 'assets')));
app.use('/js', express.static(path.join(frontendDir, 'js')));
app.use('/lib', express.static(path.join(frontendDir, 'lib')));

// Simple health-check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Backend is running'
  });
});

// API routes
app.use('/api/clinics', clinicsRoutes);
app.use('/api/clinics', slotRoutes);
app.use('/api/appointments', appointmentsRoutes);

// Helper to serve page files
function sendPage(pageFolder) {
  return (req, res) => {
    res.sendFile(path.join(frontendDir, 'pages', pageFolder, 'index.html'));
  };
}

// Frontend page routes
app.get('/', sendPage('landing'));
app.get('/register', sendPage('register'));
app.get('/login', sendPage('login'));
app.get('/dashboard', sendPage('dashboard'));
app.get('/admin', sendPage('admin'));
app.get('/clinics', sendPage('clinics'));
app.get('/clinic/:id', sendPage('clinic'));
app.get('/booking-confirmation', sendPage('booking-confirmation'));
app.get('/appointments', sendPage('appointments'));
app.get('/queue', sendPage('queue'));

// Final 404 fallback
app.use((req, res) => {
  res.status(404).send('404 Not Found');
});

module.exports = app;
