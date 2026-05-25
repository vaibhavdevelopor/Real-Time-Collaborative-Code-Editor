/**
 * server.js -- Main entry point
 *
 * Responsibilities:
 *  1. Create Express app + HTTP server
 *  2. Attach Socket.io
 *  3. Connect to MongoDB and Redis
 *  4. Register middleware (helmet, cors, rateLimit, json)
 *  5. Mount REST route files
 *  6. Register Socket.io event handlers
 *  7. Start listening
 */

require('dotenv').config();

const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const mongoose     = require('mongoose');
const { createClient } = require('redis');
const helmet       = require('helmet');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');

// ----------------------------------------------------------------
const authRoutes  = require('./src/routes/auth');
const roomRoutes  = require('./src/routes/rooms');

// ----------------------------------------------------------------
const roomHandler   = require('./src/socket/roomHandler');
const editorHandler = require('./src/socket/editorHandler');

// ----------------------------------------------------------------
// App + HTTP server
// ----------------------------------------------------------------

const app    = express();
const server = http.createServer(app);

// ----------------------------------------------------------------
// Socket.io
// ----------------------------------------------------------------

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // How long to wait before considering a client disconnected
  pingTimeout: 60000,
});

// Make io accessible to route handlers if needed
app.set('io', io);

// ----------------------------------------------------------------
// Redis
// ----------------------------------------------------------------

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => console.error('[Redis] Error:', err));

// Make redis client available app-wide
app.set('redis', redisClient);

// ----------------------------------------------------------------
// Middleware
// ----------------------------------------------------------------

// Security headers (XSS, clickjacking, MIME sniffing, etc.)
app.use(helmet());

// CORS -- only allow our frontend origin
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

// Parse JSON bodies
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '200kb' }));

// Rate limiting -- 100 requests per 15 minutes per IP on all /api routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,  // return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', apiLimiter);

// ----------------------------------------------------------------
// REST Routes
// ----------------------------------------------------------------

app.use('/api/auth',  authRoutes);
app.use('/api/rooms', roomRoutes);

// Health check -- used by Docker, Render, and load balancers
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    redis: redisClient.isReady ? 'connected' : 'disconnected',
  });
});

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// ----------------------------------------------------------------
// Socket.io event registration
// ----------------------------------------------------------------

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Register all room events (join, leave, presence)
  roomHandler(io, socket, redisClient);

  // Register all editor events (code-change, cursor-move, OT)
  editorHandler(io, socket, redisClient);

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ----------------------------------------------------------------
// Bootstrap -- connect DB + Redis, then start server
// ----------------------------------------------------------------

const PORT = process.env.PORT || 5001;

async function bootstrap() {
  try {
    // Connect MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/collab-editor');
    console.log('[MongoDB] Connected');

    // Connect Redis
    await redisClient.connect();
    console.log('[Redis] Connected');

    // Start HTTP server only after DB connections are ready
    server.listen(PORT, () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/health`);
    });

  } catch (err) {
    console.error('[Bootstrap] Failed to start server:', err);
    process.exit(1); // crash fast -- let Docker/Render restart the container
  }
}

// Graceful shutdown -- close connections cleanly on SIGTERM (Docker stop)
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received -- shutting down gracefully');
  server.close(async () => {
    await mongoose.connection.close();
    await redisClient.quit();
    console.log('[Server] Shutdown complete');
    process.exit(0);
  });
});

if (require.main === module) {
  bootstrap();
}

module.exports = { app, server, io, bootstrap }; // exported for testing
