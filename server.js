const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const TestQuestion = require('./models/TestQuestion');
const TestResult = require('./models/TestResult');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_123';


// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/english-test')
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username va password kiritilishi shart' });
    }
    
    // Check if user already exists (case-insensitive)
    const existingUser = await User.findOne({ 
      username: { $regex: new RegExp('^' + username.trim() + '$', 'i') } 
    });
    if (existingUser) {
      return res.status(400).json({ message: 'Foydalanuvchi nomi band' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = new User({
      username: username.trim(),
      password: hashedPassword
    });
    await newUser.save();

    // Generate JWT
    const token = jwt.sign({ id: newUser._id, username: newUser.username }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: {
        id: newUser._id,
        username: newUser.username
      }
    });
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ message: 'Serverda xatolik yuz berdi' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username va password kiritilishi shart' });
    }

    const user = await User.findOne({ 
      username: { $regex: new RegExp('^' + username.trim() + '$', 'i') } 
    });
    if (!user) {
      return res.status(400).json({ message: 'Foydalanuvchi topilmadi yoki parol noto\'g\'ri' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Foydalanuvchi topilmadi yoki parol noto\'g\'ri' });
    }

    // Generate JWT
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'Serverda xatolik yuz berdi' });
  }
});

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
