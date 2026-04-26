#!/bin/bash

# Quick screenshot update after changes
# Usage: ./update_screenshots.sh [page_name]

if [ $# -eq 0 ]; then
    echo "Usage: ./update_screenshots.sh <page_name>"
    echo "Example: ./update_screenshots.sh full-name"
    echo ""
    echo "This will update the screenshot for the specified page."
    echo "Use './screenshot.sh all' to update all pages."
    exit 1
fi

page="$1"
echo "🔄 Updating screenshot for $page page..."

# Run the screenshot script for the specific page
./screenshot.sh "$page"

echo "✨ Screenshot updated! Check screenshots/$page.png"