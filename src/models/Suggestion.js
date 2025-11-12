const mongoose = require('mongoose');

function isMongoConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

const CounterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 }
});

const counterModel = mongoose.model('Counter', CounterSchema);

async function getNextSequence(name) {
  if (!isMongoConnected()) return null;

  try {
    const ret = await counterModel
      .findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      )
      .exec();
    return ret ? ret.seq : null;
  } catch (err) {
    console.error('Error obteniendo secuencia desde MongoDB:', err.message || err);
    return null;
  }
}

const SuggestionSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  authorId: String,
  authorTag: String,
  authorAvatar: String,
  messageId: String,
  channelId: String,
  content: String,
  status: { type: String, default: 'Pendiente' },
  approvals: { type: Number, default: 0 },
  reason: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

SuggestionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Suggestion = mongoose.model('Suggestion', SuggestionSchema);

module.exports = { Suggestion, getNextSequence, isMongoConnected };
