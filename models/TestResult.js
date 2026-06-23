const mongoose = require('mongoose');

const testResultSchema = new mongoose.Schema({
  userName: {
    type: String,
    required: true,
  },
  testName: {
    type: String,
    required: true,
    trim: true,
    default: 'General Test'
  },
  score: {
    type: Number,
    required: true,
  },
  totalQuestions: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('TestResult', testResultSchema);
