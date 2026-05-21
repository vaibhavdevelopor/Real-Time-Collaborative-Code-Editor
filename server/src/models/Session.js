/**
 * Session.js -- MongoDB schema for saved code sessions
 *
 * A session is a snapshot of a room at a point in time.
 * Created/updated when a user clicks Save, or when a room
 * is cleaned up after all users leave.
 *
 * One document per roomId (upserted, not appended).
 * If you want full history, change the save strategy to
 * always insert -- but that grows the collection fast.
 *
 * Note on unique: true
 *  This creates a MongoDB unique index, not a Mongoose validator.
 *  Duplicate roomId inserts throw a MongoDB E11000 error (not a
 *  ValidationError). Routes that create sessions must catch this
 *  error code explicitly -- see rooms.js.
 */

const mongoose = require('mongoose');

// ----------------------------------------------------------------
// Sub-schema: participant
// ----------------------------------------------------------------

const ParticipantSchema = new mongoose.Schema(
  {
    userId:   { type: String, required: true },
    username: { type: String, required: true },
    color:    { type: String, default: '#6366F1' },
  },
  { _id: false }
);

// ----------------------------------------------------------------
// Main schema
// ----------------------------------------------------------------

const SessionSchema = new mongoose.Schema(
  {
    roomId: {
      type:     String,
      required: true,
      unique:   true,  // unique index -- duplicate throws E11000, not ValidationError
      index:    true,
      trim:     true,
    },

    code: {
      type:    String,
      default: '',
    },

    // Add new languages here when the frontend Toolbar supports them.
    // Keep in sync with the language list in Toolbar.jsx.
    language: {
      type:    String,
      default: 'javascript',
      enum:    ['javascript', 'typescript', 'python', 'cpp', 'java', 'go', 'rust'],
    },

    // Populated on save via getRoomUsers() from roomHandler presence map.
    // Passed in by the caller -- editorHandler passes participants explicitly.
    participants: {
      type:    [ParticipantSchema],
      default: [],
    },

    // Incremented by the caller on each save so history pages can show activity.
    operationCount: {
      type:    Number,
      default: 0,
      min:     0,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt managed automatically
  }
);

// ----------------------------------------------------------------
// Instance method: summary for list views
// Returns metadata + preview, excludes full code to save bandwidth.
// ----------------------------------------------------------------

SessionSchema.methods.toSummary = function () {
  return {
    roomId:         this.roomId,
    language:       this.language,
    participants:   this.participants,
    operationCount: this.operationCount,
    createdAt:      this.createdAt,
    updatedAt:      this.updatedAt,
    preview:        this.code.slice(0, 100),
  };
};

// ----------------------------------------------------------------
// Static: recent sessions for history page
// ----------------------------------------------------------------

SessionSchema.statics.findRecent = function (limit = 10) {
  return this.find()
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('-code'); // exclude full code from list view
};

// ----------------------------------------------------------------
// Static: upsert helper
// Centralises the save logic so both editorHandler and rooms.js
// call the same function -- avoids the participants/operationCount
// being forgotten by one caller but not the other.
// ----------------------------------------------------------------

SessionSchema.statics.upsertSession = async function ({
  roomId,
  code,
  language,
  participants = [],
  operationCount = 0,
}) {
  return this.findOneAndUpdate(
    { roomId },
    {
      $set: {
        code,
        language:  language || 'javascript',
        participants,
        updatedAt: new Date(),
      },
      $max: { operationCount }, // only update if new count is higher
      $setOnInsert: { roomId, createdAt: new Date() },
    },
    { upsert: true, new: true, runValidators: true }
  );
};

module.exports = mongoose.model('Session', SessionSchema);