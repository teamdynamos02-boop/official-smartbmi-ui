#!/bin/bash

# SmartBMI Page Screenshots
echo "Taking screenshots of SmartBMI pages..."

# Define pages and their names
declare -A pages=(
    ["welcome"]="Welcome Page"
    ["reminders"]="Reminders Page"
    ["terms"]="Terms & Conditions"
    ["full-name"]="Full Name Input"
    ["input"]="Guest Input Page"
    ["age"]="Age Input"
    ["sex"]="Sex Selection"
    ["registration"]="Face Registration"
    ["identification"]="Face Identification"
    ["identity-confirm"]="Identity Confirmation"
    ["weight"]="Weight Measurement"
    ["height"]="Height Measurement"
    ["saving"]="Saving Data"
    ["result"]="BMI Results"
    ["analytics"]="Health Analytics"
)

# Base URL
BASE_URL="http://localhost:4173/?preview=1&screen="

# Take screenshots
for screen in "${!pages[@]}"; do
    echo "Capturing ${pages[$screen]}..."
    chromium --headless --disable-gpu --disable-software-rasterizer \
             --screenshot="screenshots/${screen}.png" \
             --window-size=1920,1080 \
             --virtual-time-budget=3000 \
             "${BASE_URL}${screen}" 2>/dev/null

    # Wait a bit between screenshots
    sleep 1
done

echo "All screenshots completed!"
ls -la screenshots/