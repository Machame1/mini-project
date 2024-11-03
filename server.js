const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Database configuration
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

const saltRounds = 10;

// Email transporter configuration
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465, // or 465
    secure: true, // true for 465, false for other ports
    auth: {
        user: 'vignanaiml@gmail.com', 
        pass: 'grnh vrcp hffd efyj' 
    },
});

// Signup endpoint with email verification
app.post('/signup', (req, res) => {
    const { fullName, email, username, password, role, branch } = req.body;

    if (!fullName || !email || !username || !password || !role) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');

    bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
        if (err) {
            console.error('Error hashing password:', err);
            return res.status(500).json({ success: false, message: 'Error signing up!' });
        }

        const query = `INSERT INTO users (fullName, email, username, password, role, branch, status, verificationToken) 
                       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`;
        const values = [fullName, email, username, hashedPassword, role, role === 'Student' ? branch : null, verificationToken];

        db.query(query, values, (err, results) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ success: false, message: 'Username or email already exists!' });
                }
                return res.status(500).json({ success: false, message: 'Error signing up!' });
            }

            // Send verification email
            const verificationLink = `http://localhost:3000/verify-email?token=${verificationToken}&email=${email}`;
            const mailOptions = {
                from: 'vignanaiml@gmail.com',

                to: email,
                subject: 'Email Verification',
                html: `<p>Thank you for signing up! Please <a href="${verificationLink}">click here</a> to verify your email.</p>`
            };

            transporter.sendMail(mailOptions, (error) => {
                if (error) {
                    console.error('Error sending verification email:', error);
                    return res.status(500).json({ success: false, message: 'Error sending verification email!' });
                }
                res.status(200).json({ success: true, message: 'Verification email sent! Please check your inbox.' });
            });
        });
    });
});

// Email verification endpoint
app.get('/verify-email', (req, res) => {
    const { token, email } = req.query;

    if (!token || !email) {
        return res.status(400).send('Invalid request.');
    }

    const query = `UPDATE users SET status = 'approved', verificationToken = NULL WHERE email = ? AND verificationToken = ?`;

    db.query(query, [email, token], (err, results) => {
        if (err) {
            console.error('Error verifying email:', err);
            return res.status(500).send('Database error.');
        }

        if (results.affectedRows === 0) {
            return res.status(400).send('Invalid or expired token.');
        }

        res.send('Email verified successfully! You can now log in.');
    });
});

// Login endpoint
app.post('/login', (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const query = `SELECT * FROM users WHERE username = ? AND role = ?`;
    db.query(query, [username, role], (err, results) => {
        if (err) {
            console.error('Error during login:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const user = results[0];

        if (user.status !== 'approved') {
            return res.status(403).json({ error: 'Please verify your email before logging in.' });
        }

        bcrypt.compare(password, user.password, (err, match) => {
            if (err) {
                console.error('Error comparing passwords:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            if (match) {
                const redirectPage = user.role === 'Student' ? '/index2.html' : '/index3.html';
                
                return res.status(200).json({
                    success: true,
                    message: 'Login successful',
                    redirectPage: redirectPage
                });
            } else {
                return res.status(401).json({ error: 'Invalid username or password.' });
            }
        });
    });
});

// Attendance routes for each branch
const attendanceRoutes = ['cai_students', 'csm_attendance', 'csd_attendance', 'aiml_attendance'];

attendanceRoutes.forEach(route => {
    app.get(`/${route}`, (req, res) => {
        const { branch } = req.query;
        const query = `SELECT regdNo, name, technicalAttendance, nonTechnicalAttendance FROM ${route} WHERE branch = ?`;

        db.query(query, [branch], (err, results) => {
            if (err) {
                console.error(`Error fetching data for ${route}:`, err);
                return res.status(500).json({ error: 'Error fetching data' });
            }

            const attendanceData = results.map(student => ({
                regdNo: student.regdNo,
                name: student.name,
                technicalAttendance: student.technicalAttendance,
                nonTechnicalAttendance: student.nonTechnicalAttendance
            }));

            return res.status(200).json(attendanceData);
        });
    });
});

// Fetch student details
app.get('/getStudentDetails', (req, res) => {
    const username = req.query.username;
    const sql = `
        SELECT id, username, branch, email, fullName
        FROM users 
        WHERE username = ? AND role = 'Student'
    `;

    db.query(sql, [username], (err, results) => {
        if (err) {
            console.error("Error fetching student data:", err);
            return res.status(500).send("Database error");
        } else if (results.length === 0) {
            return res.status(404).send("Student not found");
        } else {
            res.json(results[0]); 
        }
    });
});
app.post('/updateProfile', (req, res) => {
    const { username, fullName, email, branch } = req.body;

    if (!username || !fullName || !email || !branch) {
        return res.status(400).json({ 
            success: false, 
            message: 'All fields are required.' 
        });
    }

    const checkEmailQuery = 'SELECT id FROM users WHERE email = ? AND username != ?';
    db.query(checkEmailQuery, [email, username], (err, results) => {
        if (err) {
            console.error('Error checking email:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'Database error' 
            });
        }

        if (results.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already in use by another account' 
            });
        }

        const updateQuery = `
            UPDATE users 
            SET fullName = ?, 
                email = ?, 
                branch = ? 
            WHERE username = ? AND role = 'Student'
        `;

        db.query(updateQuery, [fullName, email, branch, username], (err, results) => {
            if (err) {
                console.error('Error updating profile:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Error updating profile' 
                });
            }

            if (results.affectedRows === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'User not found' 
                });
            }

           
                

            

            res.json({ 
                success: true, 
                message: 'Profile updated successfully' 
            });
        });
    });
});

// Helper function to get the correct attendance table name based on branch

// Server initialization
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
