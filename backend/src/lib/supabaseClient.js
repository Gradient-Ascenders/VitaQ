// Import Supabase client creator
const { createClient } = require('@supabase/supabase-js');

// Read Supabase credentials from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

// Stop the app early if required environment variables are missing
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create a reusable Supabase client for backend database access
const supabase = createClient(supabaseUrl, supabaseKey);

// Export the client so it can be used in services
module.exports = supabase;