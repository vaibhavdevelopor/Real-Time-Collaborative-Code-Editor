/**
 * rooms.js -- Room management + code execution routes
 *
 * This router is mounted at /api/rooms in server.js.
 * All routes below are relative to that prefix.
 *
 * Full routes:
 *  GET  /api/rooms/recent          -- list recent saved sessions
 *  GET  /api/rooms/:roomId         -- get a single saved session
 *  POST /api/rooms/:roomId/save    -- explicitly save a session (protected)
 *  POST /api/rooms/execute         -- execute code via Piston API
 *
 * Code Execution -- Piston API:
 *  https://github.com/engineer-man/piston
 *  Free public instance: https://emkc.org/api/v2/piston/execute
 *  No API key required. Requires internet access.
 *  For offline use, self-host via Docker (see docker-compose.yml).
 *  Override with PISTON_URL in .env to point to a self-hosted instance.
 *
 * Dependencies:
 *  npm install axios   <-- required, make sure it is in package.json
 */

const express = require('express');
const axios   = require('axios');

const Session         = require('../models/Session');
const { verifyToken } = require('./auth');

const router = express.Router();

// ----------------------------------------------------------------
// Piston config
// ----------------------------------------------------------------

const PAIZA_URL_CREATE = 'https://api.paiza.io/runners/create';
const PAIZA_URL_GET = 'https://api.paiza.io/runners/get_details';

// Paiza language names.
// Keep in sync with Session.js enum and Toolbar.jsx language list.
const PAIZA_LANGUAGES = {
  javascript: 'javascript',
  typescript: 'typescript',
  python:     'python3',
  cpp:        'cpp',
  java:       'java',
  go:         'go',
  rust:       'rust',
};

// ----------------------------------------------------------------
// GET /api/rooms/recent
// IMPORTANT: this route must be defined BEFORE /:roomId
// otherwise Express matches 'recent' as a roomId param.
// ----------------------------------------------------------------

router.get('/recent', async (req, res, next) => {
  try {
    const limit    = Math.min(parseInt(req.query.limit) || 10, 50);
    const sessions = await Session.findRecent(limit);
    return res.json({ sessions: sessions.map(s => s.toSummary()) });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------
// POST /api/rooms/execute
// IMPORTANT: must also be before /:roomId to avoid param collision.
// Execute code via Paiza.IO API -- asynchronous, polling needed.
// ----------------------------------------------------------------

router.post('/execute', async (req, res, next) => {
  try {
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'code and language are required' });
    }

    const paizaLang = PAIZA_LANGUAGES[language];
    if (!paizaLang) {
      return res.status(400).json({ error: `Unsupported language: ${language}` });
    }

    // Step 1: Create runner
    const createRes = await axios.post(
      PAIZA_URL_CREATE,
      {
        source_code: code,
        language: paizaLang,
        api_key: 'guest'
      },
      { timeout: 10000 }
    );

    const runnerId = createRes.data.id;
    if (!runnerId) {
      throw new Error('Failed to create execution runner');
    }

    // Step 2: Poll for results (max 15 seconds)
    let details;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const getRes = await axios.get(`${PAIZA_URL_GET}?id=${runnerId}&api_key=guest`, { timeout: 5000 });
      details = getRes.data;
      if (details.status === 'completed') {
        break;
      }
    }

    if (!details || details.status !== 'completed') {
      return res.status(408).json({ error: 'Execution timed out waiting for engine' });
    }

    // Paiza response fields:
    //  build_stdout, build_stderr, build_exit_code
    //  stdout, stderr, exit_code
    //  result: "success", "failure", "error", "timeout"

    return res.json({
      stdout:         details.stdout || '',
      stderr:         details.stderr || '',
      compile_output: details.build_stderr || details.build_stdout || null,
      exit_code:      parseInt(details.exit_code) || parseInt(details.build_exit_code) || 0,
      language:       language,
      version:        details.language || paizaLang,
      timed_out:      details.result === 'timeout',
    });

  } catch (err) {
    if (err.response) {
      return res.status(502).json({
        error:  'Execution engine error',
        detail: err.response.data,
      });
    }
    if (err.code === 'ECONNABORTED') {
      return res.status(408).json({ error: 'Execution timed out' });
    }
    next(err);
  }
});

// ----------------------------------------------------------------
// GET /api/rooms/:roomId
// ----------------------------------------------------------------

router.get('/:roomId', async (req, res, next) => {
  try {
    const { roomId } = req.params;

    if (!roomId || roomId.trim() === '') {
      return res.status(400).json({ error: 'roomId is required' });
    }

    const session = await Session.findOne({ roomId });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json({ session });

  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------
// POST /api/rooms/:roomId/save
// ----------------------------------------------------------------

router.post('/:roomId/save', verifyToken, async (req, res, next) => {
  try {
    const { roomId }                             = req.params;
    const { code, language, participants,
            operationCount }                     = req.body;

    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }

    const session = await Session.upsertSession({
      roomId,
      code:           code           || '',
      language:       language       || 'javascript',
      participants:   participants   || [],
      operationCount: operationCount || 0,
    });

    return res.status(200).json({ session });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Session already exists for this room' });
    }
    next(err);
  }
});

// ----------------------------------------------------------------
// Helper -- filename per language
// Java requires filename to match the public class name (Main.java).
// ----------------------------------------------------------------

function getFileName(language) {
  const map = {
    javascript: 'main.js',
    typescript: 'main.ts',
    python:     'main.py',
    cpp:        'main.cpp',
    java:       'Main.java',
    go:         'main.go',
    rust:       'main.rs',
  };
  return map[language] || 'main.txt';
}

module.exports = router;