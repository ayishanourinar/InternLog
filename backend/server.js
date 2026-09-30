const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { testDatabaseConnection } = require('./config/database');
const authRoutes = require('./routes/auth');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', async (req, res) => {
  res.json({
    success: true,
    message: 'InternLog backend is running.'
  });
});

app.use('/api/auth', authRoutes);

// Serve the existing frontend
const frontendPath = path.join(__dirname, '..', 'Internlogg-main');

app.use(express.static(frontendPath));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      message: 'API endpoint not found.'
    });
  }

  res.sendFile(path.join(frontendPath, 'index.html'));
});

async function startServer() {
  try {
    await testDatabaseConnection();

    app.listen(PORT, () => {
      console.log(`InternLog server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Unable to connect to MySQL. Check your .env settings.');
    console.error(error.message);
    process.exit(1);
  }
}

startServer();