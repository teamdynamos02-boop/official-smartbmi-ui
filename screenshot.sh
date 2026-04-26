#!/bin/bash

# SmartBMI Screenshot Manager
# Usage: ./screenshot.sh [page_name] or ./screenshot.sh all

BASE_URL="http://localhost:4173/?preview=1&screen="
SCREENSHOT_DIR="screenshots"

# Create screenshots directory if it doesn't exist
mkdir -p "$SCREENSHOT_DIR"

# Function to take screenshot of a specific page
take_screenshot() {
    local page="$1"
    local filename="$SCREENSHOT_DIR/${page}.png"

    echo "📸 Capturing $page page..."

    # Use chromium in headless mode to take screenshot
    chromium --headless --disable-gpu --disable-software-rasterizer \
             --screenshot="$filename" \
             --window-size=1920,1080 \
             --virtual-time-budget=3000 \
             "${BASE_URL}${page}" 2>/dev/null

    if [ $? -eq 0 ] && [ -f "$filename" ]; then
        local size=$(stat -c%s "$filename")
        echo "✅ Updated $filename ($(($size/1024))KB)"
    else
        echo "❌ Failed to capture $page"
    fi
}

# If no arguments, show usage
if [ $# -eq 0 ]; then
    echo "SmartBMI Screenshot Manager"
    echo "Usage:"
    echo "  ./screenshot.sh all          - Screenshot all pages"
    echo "  ./screenshot.sh page_name    - Screenshot specific page"
    echo "  ./screenshot.sh list         - List available pages"
    echo ""
    echo "Available pages:"
    echo "  welcome, reminders, terms, full-name, input, age, sex,"
    echo "  registration, identification, identity-confirm,"
    echo "  weight, height, saving, result, analytics"
    exit 1
fi

# Handle different commands
case "$1" in
    "all")
        echo "Taking screenshots of all SmartBMI pages..."
        pages=("welcome" "reminders" "terms" "full-name" "input" "age" "sex" "registration" "identification" "identity-confirm" "weight" "height" "saving" "result" "analytics")

        for page in "${pages[@]}"; do
            take_screenshot "$page"
            sleep 0.5  # Brief pause between screenshots
        done
        echo "🎉 All screenshots updated!"
        ;;

    "list")
        echo "Available pages to screenshot:"
        echo "  welcome        - Welcome/Intro page"
        echo "  reminders      - Health reminders page"
        echo "  terms          - Terms & conditions"
        echo "  full-name      - Full name input with keyboard"
        echo "  input          - Guest input page"
        echo "  age            - Age input with numeric keyboard"
        echo "  sex            - Sex selection page"
        echo "  registration   - Face registration"
        echo "  identification - Face identification"
        echo "  identity-confirm - Identity confirmation"
        echo "  weight         - Weight measurement"
        echo "  height         - Height measurement"
        echo "  saving         - Data saving page"
        echo "  result         - BMI results display"
        echo "  analytics      - Health analytics page"
        ;;

    *)
        # Screenshot specific page
        page="$1"
        take_screenshot "$page"
        ;;
esac