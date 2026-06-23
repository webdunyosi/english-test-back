const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const TestQuestion = require('./models/TestQuestion');
const TestResult = require('./models/TestResult');
const User = require('./models/User');
const Group = require('./models/Group');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_123';


// Middleware
app.use(cors());
app.use(express.json());

// Database Connection & Admin Seeding
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/english-test')
  .then(async () => {
    console.log('Connected to MongoDB');
    try {
      const adminExists = await User.findOne({ username: 'admin' });
      if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        const defaultAdmin = new User({
          username: 'admin',
          password: hashedPassword,
          role: 'admin',
          isApproved: true,
          group: ''
        });
        await defaultAdmin.save();
        console.log('Default admin seeded: admin / admin123');
      }
    } catch (err) {
      console.error('Error seeding admin user:', err);
    }
  })
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

    // Auto-approve if username is "admin"
    const isAdmin = username.trim().toLowerCase() === 'admin';

    // Create user
    const newUser = new User({
      username: username.trim(),
      password: hashedPassword,
      role: isAdmin ? 'admin' : 'student',
      isApproved: isAdmin ? true : false,
      group: ''
    });
    await newUser.save();

    if (isAdmin) {
      // Generate JWT for admin
      const token = jwt.sign(
        { id: newUser._id, username: newUser.username, role: newUser.role },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(201).json({
        token,
        user: {
          id: newUser._id,
          username: newUser.username,
          role: newUser.role,
          isApproved: newUser.isApproved,
          group: newUser.group
        }
      });
    }

    // For student: no token, requires approval
    res.status(201).json({
      message: 'Ro\'yxatdan muvaffaqiyatli o\'tdingiz. Admin tasdiqlashini kuting!',
      user: {
        id: newUser._id,
        username: newUser.username,
        role: newUser.role,
        isApproved: false,
        group: ''
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

    // Check if user is approved (unless they are admin)
    if (user.role !== 'admin' && !user.isApproved) {
      return res.status(403).json({ 
        message: 'Hisobingiz hali admin tomonidan tasdiqlanmagan. Iltimos, kutib turing!' 
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        isApproved: user.isApproved,
        group: user.group
      }
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'Serverda xatolik yuz berdi' });
  }
});

// Admin Auth Middleware
const adminAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: 'Avtorizatsiyadan o\'tilmagan' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Avtorizatsiyadan o\'tilmagan' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Ushbu amalni bajarishga huquqingiz yo\'q' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Admin Auth Error:', error);
    return res.status(401).json({ message: 'Yaroqsiz token' });
  }
};

// General Auth Middleware (for both student and admin)
const auth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: 'Avtorizatsiyadan o\'tilmagan' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Avtorizatsiyadan o\'tilmagan' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Auth Error:', error);
    return res.status(401).json({ message: 'Yaroqsiz token' });
  }
};

// User Change Password Endpoint
app.put('/api/auth/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Joriy va yangi parollarni kiriting' });
    }
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    }
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Joriy parol noto\'g\'ri' });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: 'Parol muvaffaqiyatli o\'zgartirildi' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Serverda xatolik yuz berdi' });
  }
});


// Admin Endpoints
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find({}, '-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Foydalanuvchilarni yuklashda xatolik' });
  }
});

app.put('/api/admin/users/:id/approve', adminAuth, async (req, res) => {
  try {
    const { group } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    }
    user.isApproved = true;
    user.group = group || '';
    await user.save();
    res.json({ message: 'Foydalanuvchi muvaffaqiyatli tasdiqlandi', user });
  } catch (error) {
    console.error('Error approving user:', error);
    res.status(500).json({ message: 'Tasdiqlashda xatolik yuz berdi' });
  }
});

app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    }
    if (user.username.toLowerCase() === 'admin') {
      return res.status(400).json({ message: 'Asosiy adminni o\'chirib bo\'lmaydi' });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Foydalanuvchi muvaffaqiyatli o\'chirildi' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'O\'chirishda xatolik yuz berdi' });
  }
});

// Admin Group Management Endpoints
app.get('/api/admin/groups', adminAuth, async (req, res) => {
  try {
    const groups = await Group.find().sort({ createdAt: -1 });
    res.json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ message: 'Guruhlarni yuklashda xatolik yuz berdi' });
  }
});

app.post('/api/admin/groups', adminAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Guruh nomi kiritilishi shart' });
    }
    
    // Check if group already exists (case-insensitive)
    const existingGroup = await Group.findOne({ 
      name: { $regex: new RegExp('^' + name.trim() + '$', 'i') } 
    });
    if (existingGroup) {
      return res.status(400).json({ message: 'Ushbu nomdagi guruh allaqachon mavjud' });
    }

    const newGroup = new Group({ name: name.trim() });
    await newGroup.save();
    res.status(201).json(newGroup);
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ message: 'Guruh yaratishda xatolik yuz berdi' });
  }
});

app.delete('/api/admin/groups/:id', adminAuth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }

    // Set group empty string for all users of this group
    await User.updateMany({ group: group.name }, { group: '' });

    await Group.findByIdAndDelete(req.params.id);
    res.json({ message: 'Guruh muvaffaqiyatli o\'chirildi va uning a\'zolari guruhsiz qilindi' });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({ message: 'Guruhni o\'chirishda xatolik yuz berdi' });
  }
});

app.put('/api/admin/users/:id/group', adminAuth, async (req, res) => {
  try {
    const { group } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    }
    user.group = group || '';
    await user.save();
    res.json({ message: 'O\'quvchi guruhi muvaffaqiyatli yangilandi', user });
  } catch (error) {
    console.error('Error updating user group:', error);
    res.status(500).json({ message: 'O\'quvchi guruhini yangilashda xatolik yuz berdi' });
  }
});

app.delete('/api/questions/:id', adminAuth, async (req, res) => {
  try {
    const question = await TestQuestion.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ message: 'Savol topilmadi' });
    }
    await TestQuestion.findByIdAndDelete(req.params.id);
    res.json({ message: 'Savol muvaffaqiyatli o\'chirildi' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ message: 'Savolni o\'chirishda xatolik' });
  }
});

// Admin Test Settings Endpoint (to toggle Olympiad status & change password of an entire test group)
app.put('/api/admin/tests/settings', adminAuth, async (req, res) => {
  try {
    const { testName, isOlympiad, password } = req.body;
    if (!testName) {
      return res.status(400).json({ message: 'Test nomi kiritilishi shart' });
    }

    const updateFields = {
      isOlympiad: !!isOlympiad,
      password: isOlympiad ? (password || '').trim() : ''
    };

    const result = await TestQuestion.updateMany(
      { testName },
      { $set: updateFields }
    );

    res.json({ 
      message: 'Test sozlamalari muvaffaqiyatli yangilandi', 
      updatedCount: result.modifiedCount 
    });
  } catch (error) {
    console.error('Error updating test settings:', error);
    res.status(500).json({ message: 'Test sozlamalarini yangilashda xatolik yuz berdi' });
  }
});



app.get('/api/tests', async (req, res) => {
  try {
    const summary = await TestQuestion.aggregate([
      { 
        $group: { 
          _id: "$testName", 
          questionCount: { $sum: 1 },
          isOlympiad: { $first: "$isOlympiad" },
          password: { $first: "$password" }
        } 
      }
    ]);
    const tests = summary.map(item => ({
      name: item._id || 'General Test',
      questionCount: item.questionCount,
      isOlympiad: !!item.isOlympiad,
      hasPassword: !!(item.password && item.password.trim() !== '')
    })).sort((a, b) => a.name.localeCompare(b.name));
    res.json(tests);
  } catch (error) {
    console.error('Error fetching tests summary:', error);
    res.status(500).json({ message: 'Testlarni yuklashda xatolik yuz berdi' });
  }
});

app.get('/api/questions', async (req, res) => {
  try {
    const { testName, password } = req.query;
    const query = testName ? { testName } : {};

    // Check if password matches if it's an Olympiad test
    if (testName) {
      const sampleQuestion = await TestQuestion.findOne({ testName });
      if (sampleQuestion && sampleQuestion.isOlympiad && sampleQuestion.password && sampleQuestion.password.trim() !== '') {
        if (sampleQuestion.password.trim() !== (password || '').trim()) {
          return res.status(401).json({ message: 'Olimpiada testiga kirish paroli noto\'g\'ri!' });
        }
      }
    }

    const questions = await TestQuestion.find(query);
    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ message: 'Server error fetching questions' });
  }
});

app.post('/api/questions', adminAuth, async (req, res) => {
  try {
    const { testName, isOlympiad, password, question, options, correctAnswer } = req.body;
    if (!testName || !testName.trim()) {
      return res.status(400).json({ message: 'Test nomi kiritilishi shart' });
    }

    // Inherit Olympiad settings if test already exists to keep it consistent
    const existingQuestion = await TestQuestion.findOne({ 
      testName: { $regex: new RegExp('^' + testName.trim() + '$', 'i') } 
    });

    let finalIsOlympiad = !!isOlympiad;
    let finalPassword = isOlympiad ? (password || '').trim() : '';

    if (existingQuestion) {
      finalIsOlympiad = existingQuestion.isOlympiad;
      finalPassword = existingQuestion.password;
    }

    const newQuestion = new TestQuestion({ 
      testName: testName.trim(), 
      isOlympiad: finalIsOlympiad,
      password: finalPassword,
      question, 
      options, 
      correctAnswer 
    });
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
    const { testName } = req.query;
    // Get all approved students
    const students = await User.find({ role: 'student', isApproved: true });
    
    // Get test results filtered by testName if provided
    const resultsQuery = testName ? { testName } : {};
    const results = await TestResult.find(resultsQuery);
    
    // Map results to each student
    const leaderboard = students.map(student => {
      // Find all results for this student (case-insensitive username matching)
      const studentResults = results.filter(r => r.userName.toLowerCase() === student.username.toLowerCase());
      
      if (studentResults.length > 0) {
        // Find highest score result. If scores are equal, pick the most recent one.
        const bestResult = studentResults.reduce((best, current) => {
          if (current.score > best.score) return current;
          if (current.score === best.score && new Date(current.date) > new Date(best.date)) return current;
          return best;
        }, studentResults[0]);

        return {
          _id: student._id,
          userName: student.username,
          group: student.group || '',
          score: bestResult.score,
          totalQuestions: bestResult.totalQuestions,
          date: bestResult.date,
          attemptsCount: studentResults.length,
          hasTakenTest: true
        };
      } else {
        return {
          _id: student._id,
          userName: student.username,
          group: student.group || '',
          score: 0,
          totalQuestions: 0,
          date: null,
          attemptsCount: 0,
          hasTakenTest: false
        };
      }
    });

    // Sort leaderboard: highest score first.
    // If scores are equal: those who took the test are ranked higher than those who haven't.
    // If both have taken the test and have equal score, sort by newer date.
    // If neither took the test or same date/score, sort alphabetically.
    leaderboard.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.hasTakenTest !== b.hasTakenTest) {
        return a.hasTakenTest ? -1 : 1;
      }
      if (a.hasTakenTest && b.hasTakenTest) {
        return new Date(b.date) - new Date(a.date);
      }
      return a.userName.localeCompare(b.userName);
    });

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ message: 'Server error fetching results' });
  }
});

app.post('/api/results', async (req, res) => {
  try {
    const { userName, testName, score, totalQuestions } = req.body;
    if (!testName || !testName.trim()) {
      return res.status(400).json({ message: 'Test nomi kiritilishi shart' });
    }
    const newResult = new TestResult({ 
      userName, 
      testName: testName.trim(), 
      score, 
      totalQuestions 
    });
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
