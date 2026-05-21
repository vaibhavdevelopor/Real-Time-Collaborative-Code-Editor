/**
 * auth.js -- Authentication routes
 *
 * Routes:
 *  POST /api/auth/register  -- create account, return JWT
 *  POST /api/auth/login     -- verify credentials, return JWT
 *  GET  /api/auth/me        -- return current user from JWT
 *
 * JWT payload: { userId, username, iat, exp }
 * Token expiry: 7 days
 *
 * Password hashing: bcrypt with salt rounds = 12
 *  (10 is the common default; 12 adds ~4x more hashing time,
 *   meaningful protection against brute force at negligible UX cost)
 *
 * Error handling:
 *  Duplicate email/username throws MongoDB E11000 -- caught explicitly.
 *  All other errors fall through to the global error handler in server.js.
 *
 * Note on inline User model:
 *  Defined here for simplicity at this stage. If rooms or sockets
 *  need user data later, move to server/src/models/User.js and import.
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');

const router = express.Router();

const SALT_ROUNDS = 12;
const JWT_EXPIRY  = '7d';

// ----------------------------------------------------------------
// Startup guard -- fail fast if JWT_SECRET is missing
// jwt.sign() with undefined secret silently produces tokens that
// cannot be verified -- a critical security hole.
// Crashing here surfaces the misconfiguration immediately.
// ----------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    '[auth.js] JWT_SECRET is not set in environment variables. ' +
    'Add it to your .env file and restart the server.'
  );
}

// ----------------------------------------------------------------
// User schema
// ----------------------------------------------------------------

const UserSchema = new mongoose.Schema(
  {
    username: {
      type:      String,
      required:  true,
      unique:    true,
      trim:      true,
      minlength: 2,
      maxlength: 30,
    },
    email: {
      type:      String,
      required:  true,
      unique:    true,
      trim:      true,
      lowercase: true,
      match:     [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    passwordHash: {
      type:     String,
      required: true,
    },
  },
  { timestamps: true }
);

// Never return passwordHash in any JSON response
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

const User = mongoose.models.User || mongoose.model('User', UserSchema);

// ----------------------------------------------------------------
// Middleware: verifyToken
// Exported so other routes can protect their endpoints.
// Usage: const { verifyToken } = require('./auth');
// ----------------------------------------------------------------

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, username, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ----------------------------------------------------------------
// POST /api/auth/register
// ----------------------------------------------------------------

router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email, and password are required' });
    }

    // Password strength -- minimum 8 characters
    // Extend this with regex for digits/symbols if needed later
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ username, email, passwordHash });

    const token = jwt.sign(
      { userId: user._id.toString(), username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    return res.status(201).json({ token, user });

  } catch (err) {
    // E11000 = MongoDB duplicate key (unique index violation)
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0]; // 'email' or 'username'
      return res.status(409).json({ error: `${field} is already taken` });
    }
    next(err);
  }
});

// ----------------------------------------------------------------
// POST /api/auth/login
// ----------------------------------------------------------------

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Same message for "not found" and "wrong password" -- prevents user enumeration
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user._id.toString(), username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    return res.status(200).json({ token, user });

  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------
// GET /api/auth/me -- return current user from token
// ----------------------------------------------------------------

router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------
// Exports
// ----------------------------------------------------------------

module.exports = router;
module.exports.verifyToken = verifyToken;