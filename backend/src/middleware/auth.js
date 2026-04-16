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
    // Read the Authorization header from the incoming request.
    const authHeader = req.headers.authorization;

    // Stop early if the header is missing or badly formatted.
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is required.'
      });
    }

    // Extract the token after the word "Bearer".
    const token = authHeader.split(' ')[1];

    // Ask Supabase to validate the token and return the logged-in user.
    const { data, error } = await supabase.auth.getUser(token);

    // If Supabase cannot verify the token, reject the request.
    if (error || !data || !data.user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired authentication token.'
      });
    }

    // Attach the authenticated user to the request object.
    req.user = data.user;

    // Continue to the protected route.
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Authentication check failed.',
      error: error.message
    });
  }
}

/**
 * Middleware that allows only staff users through.
 *
 * This must run after authMiddleware, because it depends on req.user.id.
 */
async function requireStaff(req, res, next) {
  try {
    // If authMiddleware did not attach a user, block the request.
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication is required before checking staff access.'
      });
    }

    // Look up the logged-in user's role from the profiles table.
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', req.user.id)
      .single();

    // If there is no valid profile, the user cannot access staff tools.
    if (error || !profile) {
      return res.status(403).json({
        success: false,
        message: 'Staff access is required.'
      });
    }

    // Only users with the staff role may manage the staff queue.
    if (profile.role !== 'staff') {
      return res.status(403).json({
        success: false,
        message: 'Staff access is required.'
      });
    }

    // Store the role on the request in case controllers need it later.
    req.userRole = profile.role;

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Staff access check failed.',
      error: error.message
    });
  }
}

// Keep the existing default export working.
module.exports = authMiddleware;

// Add role-check middleware as a property of the same export.
module.exports.requireStaff = requireStaff;