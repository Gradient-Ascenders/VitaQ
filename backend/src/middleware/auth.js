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
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is required.'
      });
    }

    const token = authHeader.split(' ')[1];
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data || !data.user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired authentication token.'
      });
    }

    req.user = data.user;
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
 * Helper that loads the logged-in user's profile role.
 * Role checks use the shared profiles table so staff/admin access stays
 * consistent across backend routes.
 */
async function fetchProfileRole(userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (error || !profile) {
    return null;
  }

  return profile.role;
}

/**
 * Middleware that allows only staff users through.
 *
 * This must run after authMiddleware, because it depends on req.user.id.
 */
async function requireStaff(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication is required before checking staff access.'
      });
    }

    const role = await fetchProfileRole(req.user.id);

    if (role !== 'staff') {
      return res.status(403).json({
        success: false,
        message: 'Staff access is required.'
      });
    }

    req.userRole = role;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Staff access check failed.',
      error: error.message
    });
  }
}

/**
 * Middleware that allows only admin users through.
 *
 * Admin routes are used for reviewing staff registration requests,
 * so normal patients and staff must not be able to call them.
 */
async function requireAdmin(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication is required before checking admin access.'
      });
    }

    const role = await fetchProfileRole(req.user.id);

    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access is required.'
      });
    }

    req.userRole = role;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Admin access check failed.',
      error: error.message
    });
  }
}

module.exports = authMiddleware;
module.exports.requireStaff = requireStaff;
module.exports.requireAdmin = requireAdmin;