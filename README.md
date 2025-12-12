# Rai Bee Exclusive — Full Stack (Demo)

This repository is a functional, minimal full-stack demo for a content platform with:
- React frontend (frontend/)
- Node/Express backend (backend/)
- SQLite demo database (backend/data/db.sqlite created on first run)
- Payments: Stripe / Razorpay integrations (server-side). UPI QR + deep-link generation endpoint included.
- Encrypted server-side storage for uploaded files (AES-256-GCM). Demo uses ENV ENCRYPTION_KEY.

## Quick start (local)

### Backend
1. cd backend
2. npm install
3. Copy `.env.example` to `.env` and edit values (especially JWT_SECRET and ENCRYPTION_KEY). For local demo you can leave Stripe/Razorpay disabled.
4. npm start
Server runs on PORT (default 4000).

### Frontend
1. cd frontend
2. npm install
3. In development, set REACT_APP_API to backend URL if different: `export REACT_APP_API=http://localhost:4000`
4. npm start

### Demo accounts
- Creator: admin@raibee.test / DemoPass123
- Fan: fan@raibee.test / FanPass123

## Payments
- Stripe: set STRIPE_SECRET_KEY in backend .env. Frontend will call backend to create checkout session.
- Razorpay: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.
- UPI: endpoint `/api/pay/upi/create` returns deep link and QR Data URL.

## Notes & Limitations
- This is a demo. For production use:
  - Use real KMS for encryption keys.
  - Use proper webhooks and verify signatures.
  - Use chunked streaming for large files and range requests.
  - Use DRM (Widevine/FairPlay) for strong content protection.

