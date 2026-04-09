const supabase = require('../lib/supabaseClient');

/**
 * Middleware that protects backend routes.
 *
 * What it does:
 * - reads the Bearer token from the Authorization header
 * - verifies the token with Supabase
 * - attaches the authenticated user to req.user
 * - blocks access if the token is missing or invalid
 */
async function authMiddleware(req, res, next) {
  try {
    // Read the Authorization header from the incoming request
    const authHeader = req.headers.authorization;

    // Stop early if the header is missing or badly formatted
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is required.'
      });
    }

    // Extract the token after the word "Bearer"
    const token = authHeader.split(' ')[1];

    // Ask Supabase to validate the token and return the logged-in user
    const { data, error } = await supabase.auth.getUser(token);

    // If Supabase cannot verify the token, reject the request
    if (error || !data || !data.user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired authentication token.'
      });
    }

    // Attach the authenticated user to the request object
    // so controllers can use req.user.id
    req.user = data.user;

    // Continue to the protected route
    next();
  } catch (error) {
    // Handle unexpected middleware failures
    return res.status(500).json({
      success: false,
      message: 'Authentication check failed.',
      error: error.message
    });
  }
}

module.exports = authMiddleware;