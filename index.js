import express from 'express';
import fs from "fs";
import mysql from "mysql2/promise";
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());


const ca = process.env.CA_CERT ? Buffer.from(process.env.CA_CERT, 'base64') : fs.readFileSync(process.env.CA_CERT_PATH);

const pool = mysql.createPool({
  host: process.env.DB_HOST,  
  port: process.env.DB_PORT,      
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {  
    ca: ca,                
    rejectUnauthorized: true
  },
  waitForConnections: true,
  connectionLimit: 12,
  queueLimit: 0
});

async function initializeDb() {
  try {
    const query = `
      CREATE TABLE IF NOT EXISTS schools (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(255) NOT NULL,
        latitude FLOAT NOT NULL,
        longitude FLOAT NOT NULL
      )
    `;
    
    await pool.execute(query);
    console.log('Schools Table exists!');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

initializeDb();


app.post('/addSchool', async (req, res) => {
  const { name, address, latitude, longitude } = req.body;
  if (!name || !address || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'All fields (name, address, latitude, longitude) are required' });
  }
  if (typeof name !== 'string' || typeof address !== 'string') {
    return res.status(400).json({ error: 'Name and address must be strings' });
  }
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'Latitude and longitude must be numbers' });
  }
  if (latitude < -90 || latitude > 90) {
    return res.status(400).json({ error: 'Latitude must be between -90 and 90' });
  }
  if (longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Longitude must be between -180 and 180' });
  }
  const query = `
    INSERT INTO schools (name, address, latitude, longitude)
    VALUES (?, ?, ?, ?)
  `;
  try{
    const [results] = await pool.execute(query, [name, address, latitude, longitude]);
    res.json({ message: 'School added successfully', schoolId: results.insertId });
  } catch (err) {
    console.error('Error adding school:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/listSchools', async (req, res) => {
  const {latitude, longitude} = req.query;
  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Latitude and longitude are required' });
  }
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'Latitude and longitude must be numbers' });
  }
  const query = `
    SELECT id, name, address, latitude, longitude 
    FROM schools
    ORDER BY (6371 * acos(cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) + sin(radians(?)) * sin(radians(latitude))));
  `;
  try {
    const [results] = await pool.execute(query, [lat, lng, lat]);
    res.json(results);
  } catch (err) {
    console.error('Error fetching schools:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const port = parseInt(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
