# Rai Bee Exclusive — Render Deployment Guide

You're ready to deploy the app to Render (Mumbai region). Follow these steps.

## 1) Create a GitHub repo
- Create a new GitHub repository (private or public).
- Push the contents of this folder to that repo.

## 2) Create secrets on Render
In your Render dashboard, go to **Account > API Keys** to create an API key if needed.
Go to your **Service > Environment** and add the following encrypted secrets (or set them when creating the service):
- JWT_SECRET (string)
- ENCRYPTION_KEY (32-byte or base64 string)

> You can keep the default seed admin: admin@example.com / Admin123 (but change password after first login).

## 3) Deploy using render.yaml (auto)
- In Render dashboard, choose **New > Import from GitHub** and link your repo.
- Render will read `render.yaml` and create two services:
  - `rai-bee-exclusive-backend` (Node web service)
  - `rai-bee-exclusive-frontend` (Static site for React build)
- For the backend service, set the secret values for `JWT_SECRET` and `ENCRYPTION_KEY` in Render's Environment section (these are required).

## 4) Ensure seed runs
The repository contains `backend/seed_admin.js`. After Render deploys the backend, open the Shell for the backend service on Render and run:
```
node backend/seed_admin.js
```
Alternatively, you can add a `postdeploy` hook in Render to run the seed script automatically (not all accounts support hooks).

## 5) Visit the Live URL
- Render will provide a live URL for the frontend and backend.
- Frontend expects backend at: `https://rai-bee-exclusive-backend.onrender.com` — if your Render backend uses a different auto-generated URL, update the frontend's `REACT_APP_API` env var in Render to match it and trigger a rebuild.

## Notes about UPI
- UPI QR/deeplink generation is enabled and works without Razorpay/Stripe if the backend uses your UPI ID or merchant details.
- For production UPI collection you may need a payments provider or bank integration.

## Need help?
If you want, I can:
- Create a GitHub repo for you and populate it (you'll need to give me repository access or provide a link).
- Or guide you step-by-step while you click the Render UI.
