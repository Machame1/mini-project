const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto'); // for generating unique verification tokens

// Initialize the Express application
const app = express();

// Middleware for serving static files and parsing request bodies
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Database connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mavasari@1928',
    database: 'user_accounts'
});

db.connect(err => {
    if (err) {
        console.error('Error connecting to the database:', err.message || err);
        return;
    }
    console.log('Successfully connected to the database.');
});
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html')); 
});

const saltRounds = 10;

// Nodemailer setup for email verification
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'your_email@gmail.com',
        pass: 'your_email_password'
    }
});

// Endpoint for handling signup with email verification
app.post('/signup', (req, res) => {
    const { fullName, email, username, password, role } = req.body;

    if (!fullName || !email || !username || !password || !role) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    // Generate a verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
        if (err) {
            console.error('Error hashing password:', err);
            return res.status(500).json({ success: false, message: 'Error signing up!' });
        }

        const query = 'INSERT INTO users (fullName, email, username, password, role, verified, verificationToken) VALUES (?, ?, ?, ?, ?, ?, ?)';
        db.query(query, [fullName, email, username, hashedPassword, role, 0, verificationToken], (err, results) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ success: false, message: 'Username or email already exists!' });
                } else {
                    return res.status(500).json({ success: false, message: 'Error signing up!' });
                }
            }

            // Send verification email
            const verificationUrl = `http://localhost:3001/verify-email?token=${verificationToken}`;
            const mailOptions = {
                from: 'your_email@gmail.com',
                to: email,
                subject: 'Verify your email',
                text: `Click the link to verify your email: ${verificationUrl}`
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('Error sending verification email:', error);
                    return res.status(500).json({ success: false, message: 'Error sending verification email.' });
                }
                console.log('Verification email sent:', info.response);
                return res.status(200).json({ success: true, message: 'Signup successful! Please verify your email to activate your account.' });
            });
        });
    });
});

// Email verification endpoint
app.get('/verify-email', (req, res) => {
    const { token } = req.query;

    if (!token) return res.status(400).json({ success: false, message: 'Invalid or missing verification token.' });

    const query = 'UPDATE users SET verified = 1 WHERE verificationToken = ?';
    db.query(query, [token], (err, results) => {
        if (err || results.affectedRows === 0) {
            return res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
        }
        return res.status(200).json({ success: true, message: 'Email verified successfully! You can now log in.' });
    });
});

// Login route with verification check
app.post('/login', (req, res) => {
    const username = req.body.username.trim();
    const password = req.body.password.trim();
    const role = req.body.role.trim();

    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Username, password, and role are required.' });
    }

    const query = 'SELECT * FROM users WHERE username = ? AND role = ? AND verified = 1';
    db.query(query, [username, role], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials or email not verified.' });
        }

        const user = results[0];
        bcrypt.compare(password, user.password, (err, match) => {
            if (err) return res.status(500).json({ error: 'Internal server error' });
            if (!match) return res.status(401).json({ error: 'Invalid credentials.' });

            const redirectPage = user.role === 'Student' ? '/index2.html' : '/index3.html';
            res.status(200).json({ success: true, message: 'Login successful', redirectPage });
        });
    });
});

// Attendance data retrieval
app.get('/attendance', (req, res) => {
    const { branch } = req.query;
    const query = 'SELECT * FROM attendance WHERE branch = ?';

    db.query(query, [branch], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error fetching data' });
        return res.status(200).json(results);
    });
});

// CAI student data retrieval
app.get('/cai_students', (req, res) => {
    const { branch } = req.query;
    const query = 'SELECT regdNo, name, technicalAttendance, nonTechnicalAttendance FROM cai_students WHERE branch = ?';

    db.query(query, [branch], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error fetching data' });
        const attendanceData = results.map(student => ({
            regdNo: student.regdNo,
            name: student.name,
            technicalAttendance: student.technicalAttendance,
            nonTechnicalAttendance: student.nonTechnicalAttendance
        }));
        res.status(200).json(attendanceData);
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
