#!/bin/sh
# Ensure data dir exists
mkdir -p ./data
# Run seed (non-fatal)
node seed_admin.js || true
# Start server
node server.js
