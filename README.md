# Glonova Data Collector

A Cloudflare Worker that collects user data and photos from a frontend application and stores them in a GitHub repository.

## Project Structure

- `worker.js`: The Cloudflare Worker script that handles API requests and stores data in GitHub
- `index.html`: The frontend HTML file
- `script.js`: The frontend JavaScript file
- `style.css`: The frontend CSS file
- `wrangler.toml`: Configuration file for Cloudflare Workers

## Deployment

This project is deployed using Cloudflare Workers. The worker is configured to handle requests to the `/api/submit-data` endpoint.

### Environment Variables

- `GITHUB_PAT`: GitHub Personal Access Token with repo scope (added through Cloudflare dashboard)

## File Naming Conventions

- User data files: `phonenumber_YYYY-MM-DD_HH-MM-SS.json`
- Photo files: `phonenumber_YYYY-MM-DD_HH-MM-SS_timestamp.jpeg`
