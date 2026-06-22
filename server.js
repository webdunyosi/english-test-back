const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const TestQuestion = require('./models/TestQuestion');
const TestResult = require('./models/TestResult');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/english-test')
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Routes
app.get('/api/questions', async (req, res) => {
  try {
    const questions = await TestQuestion.find();
    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ message: 'Server error fetching questions' });
  }
});

app.post('/api/questions', async (req, res) => {
  try {
    const { question, options, correctAnswer } = req.body;
    const newQuestion = new TestQuestion({ question, options, correctAnswer });
    const savedQuestion = await newQuestion.save();
    res.status(201).json(savedQuestion);
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(400).json({ message: 'Error creating question', error: error.message });
  }
});

// Leaderboard routes
app.get('/api/results', async (req, res) => {
  try {
    // Eng yuqori ball to'plaganlarni olish (masalan top 10 ta)
    const results = await TestResult.find().sort({ score: -1, date: -1 }).limit(50);
    res.json(results);
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ message: 'Server error fetching results' });
  }
});

app.post('/api/results', async (req, res) => {
  try {
    const { userName, score, totalQuestions } = req.body;
    const newResult = new TestResult({ userName, score, totalQuestions });
    const savedResult = await newResult.save();
    res.status(201).json(savedResult);
  } catch (error) {
    console.error('Error saving result:', error);
    res.status(400).json({ message: 'Error saving result', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
