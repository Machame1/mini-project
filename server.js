const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const mysql = require('mysql2');
// Database configuration
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mavasari@1928',
    database: 'user_accounts',
    connectionLimit: 100
});

db.connect(err => {
    if (err) {
        console.error('Error connecting to the database:', err.message || err);
        return;
    }
    console.log('Successfully connected to the database.');
});

const saltRounds = 10;

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465, // or 465
    secure: true, // true for 465, false for other ports
    auth: {
        user: 'vignanaiml@gmail.com', 
        pass: 'grnh vrcp hffd efyj' 
    },
});
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
// Function to dynamically map branches to their corresponding tables
// Function to get the correct attendance table for each branch
function getAttendanceTableForBranch(branch) {
    const branchMap = {
        cai: 'cai_students',
        cse: 'attendance',
        csm: 'csm_attendance',
        aiml: 'aiml_attendance',
        csd: 'csd_attendance',
    };

    return branchMap[branch.toLowerCase()] || null; // Return null if the branch is not found
}

// Route to add a new student
app.post('/add-student', (req, res) => {
    const { regdNo, name, technicalAttendance, nonTechnicalAttendance, branch } = req.body;

    // Debugging: log received data
    console.log("Received data:", req.body);

    // Validate inputs
    if (!regdNo || !name || technicalAttendance == null || nonTechnicalAttendance == null || !branch) {
        return res.json({ success: false, message: 'All fields are required and cannot be null.' });
    }

    // Get the appropriate table for the branch
    const tableName = getAttendanceTableForBranch(branch);
    if (!tableName) {
        return res.json({ success: false, message: 'Invalid branch selected.' });
    }

    // Check if the student with the same regdNo already exists
    const checkQuery = `SELECT * FROM ${tableName} WHERE regdNo = ?`;
    db.query(checkQuery, [regdNo], (err, results) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: 'Database error occurred' });
        }
        
        // If a student with this regdNo already exists, return an error message
        if (results.length > 0) {
            return res.json({ success: false, message: `Student with registration number ${regdNo} already exists.` });
        }

        // If no duplicate, proceed to insert the new student
        const insertQuery = `INSERT INTO ${tableName} (regdNo, name, technicalAttendance, nonTechnicalAttendance, branch) VALUES (?, ?, ?, ?, ?)`;
        db.query(insertQuery, [regdNo, name, technicalAttendance, nonTechnicalAttendance, branch], (err, results) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.json({ success: false, message: 'Duplicate registration number. Please use a unique regdNo.' });
                }
                console.error(err);
                return res.json({ success: false, message: 'Failed to add student' });
            }
            return res.json({ 
                success: true, 
                message: 'New student added ',
                studentDetails: {
                    regdNo,
                    name,
                    branch,
                    technicalAttendance,
                    nonTechnicalAttendance
                }
            });
        });
    });
});


app.get('/checkUserRole', (req, res) => {
    const role = req.query.role;

    if (role === 'placement') {
        return res.json({ success: true, message: 'Placement user' });
    }
    
    res.json({ success: false, message: 'Not a placement user' });
});
// Delete student route
app.delete('/deleteStudent/:regdNo', (req, res) => {
    const regdNo = req.params.regdNo;
    console.log(`Deleting student with regdNo: ${regdNo}`);

    // List of tables to delete from
    const tables = ['attendance', 'cai_students', 'csd_attendance', 'csm_attendance', 'aiml_attendance'];

    // Start a transaction to ensure all deletions happen atomically
    db.beginTransaction((err) => {
        if (err) {
            console.error('Transaction error:', err);
            return res.status(500).json({ success: false, message: 'Failed to initiate transaction.' });
        }

        // Delete the student from all tables
        const deletePromises = tables.map(table => 
            new Promise((resolve, reject) => {
                db.query(`DELETE FROM ${table} WHERE regdNo = ?`, [regdNo], (err, result) => {
                    if (err) {
                        reject(`Error deleting from ${table}: ${err}`);
                    } else {
                        resolve(`Student deleted from ${table}`);
                    }
                });
            })
        );

        // Run all delete queries
        Promise.all(deletePromises)
            .then(() => {
                db.commit((err) => {
                    if (err) {
                        return db.rollback(() => {
                            console.error('Transaction commit error:', err);
                            res.status(500).json({ success: false, message: 'Failed to commit transaction.' });
                        });
                    }
                    res.status(200).json({ success: true, message: 'Student and related records deleted successfully.' });
                });
            })
            .catch((error) => {
                db.rollback(() => {
                    console.error(error);
                    res.status(500).json({ success: false, message: 'Failed to delete student from one or more tables.' });
                });
            });
    });
});
app.post("/forgot-password", (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ message: "Email is required." });
    }

    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: "Database error." });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: "Email not found." });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        db.query(
            "UPDATE users SET otp = ? WHERE email = ?",
            [otp, email],
            (err) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ message: "Database error." });
                }

                const mailOptions = {
                    from: "vignanaiml@gmail.com",
                    to: email,
                    subject: "Password Reset OTP",
                    text: `Your OTP for password reset is ${otp}`
                };

                transporter.sendMail(mailOptions, (err, info) => {
                    if (err) {
                        console.error('Email error:', err);
                        return res.status(500).json({ message: "Failed to send OTP." });
                    }
                    res.status(200).json({ message: "OTP sent to your email." });
                });
            }
        );
    });
});
// Route to reset password with OTP verification
app.post("/reset-password", (req, res) => {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
        return res.status(400).json({ 
            success: false, 
            message: "All fields are required." 
        });
    }

    db.query(
        "SELECT * FROM users WHERE email = ? AND otp = ?", 
        [email, otp], 
        async (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: "Database error." 
                });
            }
            
            if (results.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Invalid OTP or email." 
                });
            }

            try {
                const hashedPassword = await bcrypt.hash(newPassword, 10);
                
                db.query(
                    "UPDATE users SET password = ?, otp = NULL WHERE email = ?",
                    [hashedPassword, email],
                    (err) => {
                        if (err) {
                            console.error('Database error:', err);
                            return res.status(500).json({ 
                                success: false, 
                                message: "Failed to reset password." 
                            });
                        }
                        
                        res.status(200).json({ 
                            success: true, 
                            message: "Password reset successful." 
                        });
                    }
                );
            } catch (error) {
                console.error('Hashing error:', error);
                res.status(500).json({ 
                    success: false, 
                    message: "Error processing password." 
                });
            }
        }
    );
});

app.post('/verify_otp', (req, res) => {
    const { otp, email } = req.body;

    if (!otp || !email) {
        return res.status(400).json({ 
            success: false, 
            message: 'OTP and Email are required' 
        });
    }

    const sqlQuery = 'SELECT otp FROM users WHERE email = ?';
    db.query(sqlQuery, [email], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'Server error' 
            });
        }

        if (results.length > 0) {
            const storedOtp = results[0].otp;
            
            if (storedOtp === otp) {
                res.json({ 
                    success: true, 
                    message: 'OTP verified successfully!' 
                });
            } else {
                res.json({ 
                    success: false, 
                    message: 'Invalid OTP. Please try again.' 
                });
            }
        } else {
            res.json({ 
                success: false, 
                message: 'Email not found.' 
            });
        }
    });
});
app.get('/fee_list', (req, res) => {
    const { branch, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const query = branch
        ? "SELECT * FROM fee_payments WHERE branch = ? LIMIT ? OFFSET ?"
        : "SELECT * FROM fee_payments LIMIT ? OFFSET ?";

    const values = branch ? [branch, parseInt(limit), parseInt(offset)] : [parseInt(limit), parseInt(offset)];

    db.query(query, values, (err, results) => {
        if (err) {
            console.error('Error fetching fee data:', err);
            return res.status(500).json({
                success: false,
                message: 'Error fetching fee data',
            });
        }
        res.json(results);
    });
});

// Add fee details
app.post('/add_fee', (req, res) => {
    const { RegdNo, student_name, phone_no, branch, amount, payment_status } = req.body;

    if (!RegdNo || !student_name || !phone_no || !branch || amount == null || !payment_status) {
        return res.status(400).json({
            success: false,
            message: 'All fields are required',
        });
    }

    const query = 'INSERT INTO fee_payments (RegdNo, student_name, phone_no, branch, amount, payment_status) VALUES (?, ?, ?, ?, ?, ?)';


    db.query(query, [RegdNo, student_name, phone_no, branch, amount, payment_status], (err) => {
        if (err) {
            console.error('Error adding fee details:', err);
            return res.status(500).json({
                success: false,
                message: 'Error adding fee details',
            });
        }

        res.status(201).json({
            success: true,
            message: 'student fee added',
        });
    });
});

// Delete fee details by ID
app.delete('/delete_fee/:RegdNo', (req, res) => {
    const regdNo = req.params.RegdNo;

    if (!regdNo) {
        return res.status(400).json({ error: "RegdNo is required" });
    }

    // Delete the fee payment record from fee_payments table
    const sql = 'DELETE FROM fee_payments WHERE RegdNo = ?';
    db.query(sql, [regdNo], (err, result) => {
        if (err) {
            console.error("Error deleting fee payment:", err);
            return res.status(500).json({ error: "Failed to delete the fee payment record" });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "No record found with that RegdNo" });
        }

        res.status(200).json({ message: "student deleted " });
    });
});
app.get("/get_user_details/:RegdNo", (req, res) => {
    const RegdNo = req.params.RegdNo;

    // SQL query to join the 'users' and 'fee_payments' table based on RegdNo
    const query = `
        SELECT u.username AS RegdNo, u.fullname, u.branch
        FROM users u
        LEFT JOIN fee_payments f ON u.username = f.RegdNo
        WHERE u.username = ?
    `;

    db.query(query, [RegdNo], (err, results) => {
        if (err) {
            res.status(500).json({ success: false, message: "Database error." });
        } else if (results.length > 0) {
            const user = results[0];
            res.json({
                success: true,
                fullname: user.fullname,
                branch: user.branch,
            });
        } else {
            res.json({ success: false, message: "No user found with the provided Registration Number." });
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});