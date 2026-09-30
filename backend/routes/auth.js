const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );
}

router.post('/register/student', async (req, res) => {
  try {
    const { name, email, password, college, course, graduation_year } = req.body;

    if (!name || !email || !password || !college || !course || !graduation_year) {
      return res.status(400).json({ message: 'All student fields are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    if (existing.length) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      `INSERT INTO users
       (name, email, password_hash, role, college, course, graduation_year, status)
       VALUES (?, ?, ?, 'student', ?, ?, ?, 'active')`,
      [
        name.trim(),
        email.toLowerCase().trim(),
        passwordHash,
        college.trim(),
        course.trim(),
        Number(graduation_year)
      ]
    );

    const [rows] = await pool.execute(
      'SELECT id, name, email, role, college, course, graduation_year, status, created_at FROM users WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      message: 'Student registered successfully.',
      user: rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while registering student.' });
  }
});

router.post('/register/company', async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { name, email, password, website, description } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Company name, email and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    await connection.beginTransaction();

    const [existing] = await connection.execute(
      'SELECT id FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    if (existing.length) {
      await connection.rollback();
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [userResult] = await connection.execute(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES (?, ?, ?, 'company', 'pending')`,
      [name.trim(), email.toLowerCase().trim(), passwordHash]
    );

    await connection.execute(
      `INSERT INTO companies (user_id, name, website, description, status, verified)
       VALUES (?, ?, ?, ?, 'pending', FALSE)`,
      [userResult.insertId, name.trim(), website || null, description || null]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Company registered. Waiting for admin verification.'
    });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: 'Server error while registering company.' });
  } finally {
    connection.release();
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const [rows] = await pool.execute(
      `SELECT id, name, email, password_hash, role, college, course,
              graduation_year, status
       FROM users
       WHERE email = ?`,
      [email.toLowerCase().trim()]
    );

    if (!rows.length) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = rows[0];

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (user.status === 'suspended' || user.status === 'rejected') {
      return res.status(403).json({ message: `Your account is ${user.status}.` });
    }

    const token = createToken(user);
    delete user.password_hash;

    res.json({
      message: 'Login successful.',
      token,
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while logging in.' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, email, role, college, course, graduation_year, status,
              created_at, updated_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ user: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
