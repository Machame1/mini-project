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
// const transporter = nodemailer.createTransport({
//     host: 'smtp.gmail.com',
//     port: 465, // or 465
//     secure: true, // true for 465, false for other ports
//     auth: {
//         user: 'vignanaiml@gmail.com', 
//         pass: 'grnh vrcp hffd efyj' 
//     },
// });
function generateOtp() {
    return crypto.randomInt(100000, 999999).toString(); // Generate a 6-digit OTP
}

// Send OTP email
function sendOtpEmail(email, otp) {
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'vignanaiml@gmail.com', // Replace with your email
            pass: 'grnh vrcp hffd efyj' // Use an environment variable for the password
        }
    });

    let mailOptions = {
        from: 'vignanaiml@gmail.com',
        to: email,
        subject: 'OTP for Email Verification',
        text: `Your OTP for verification is: ${otp}`
    };

    transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
            console.log('Error sending OTP:', err);
        } else {
            console.log('OTP sent:', info.response);
        }
    });
}

// Sign-Up Route
app.post('/signup', (req, res) => {
    const { fullName, email, username, password, role, branch } = req.body;

    // Check if the email already exists
    const checkEmailQuery = 'SELECT * FROM users WHERE email = ?';
    db.execute(checkEmailQuery, [email], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Error checking email.' });
        if (results.length > 0) return res.status(400).json({ success: false, message: 'Email already exists.' });

        // Generate OTP
        const otp = generateOtp();

        // Store user data with "pending" status and OTP in the database
        const insertQuery = 'INSERT INTO users (fullName, email, username, password, role, branch, otp, status) VALUES (?, ?, ?, ?, ?, ?, ?, "pending")';
        db.execute(insertQuery, [fullName, email, username, bcrypt.hashSync(password, 10), role, branch, otp], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Error storing user data.' });

            // Send OTP email
            sendOtpEmail(email, otp);

            res.status(200).json({ success: true, message: 'Signup successful. OTP sent to your email for verification.' });
        });
    });
});

// OTP Verification Route
app.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;

    // Fetch the OTP stored in the database for this email
    const query = 'SELECT otp, status FROM users WHERE email = ?';
    db.execute(query, [email], (err, result) => {
        if (err || result.length === 0) {
            return res.status(500).json({ success: false, message: 'User not found or error in retrieving OTP.' });
        }

        const storedOtp = result[0].otp;
        const status = result[0].status;

        if (status === 'approved') {
            return res.status(400).json({ success: false, message: 'This email is already verified.' });
        }

        // Verify the OTP
        if (storedOtp !== otp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
        }

        // Update the user status to 'approved' and save the user details
        const updateQuery = 'UPDATE users SET status = "approved" WHERE email = ?';
        db.execute(updateQuery, [email], (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error updating user status.' });
            }

            res.status(200).json({ success: true, message: 'Account verified and successfully created.' });
        });
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

        // Check if the user's account is approved
        if (user.status !== 'approved') {
            return res.status(403).json({ error: 'Account not verified. Please complete OTP verification.' });
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
const attendanceRoutes = ['attendance','cai_students', 'csm_attendance', 'csd_attendance', 'aiml_attendance'];

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
