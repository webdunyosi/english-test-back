const mongoose = require('mongoose');

const testQuestionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
  },
  options: {
    type: [String],
    required: true,
    validate: [v => v.length > 0, 'Options array cannot be empty']
  },
  correctAnswer: {
    type: String,
    required: true,
  }
}, { timestamps: true });

module.exports = mongoose.model('TestQuestion', testQuestionSchema);
