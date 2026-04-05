// Load environment variables from the root .env file
require('dotenv').config();

// Import the configured Express app
const app = require('./src/app');

// Use the port from .env, or default to 3000
const PORT = process.env.PORT || 3000;

// Start the backend server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});