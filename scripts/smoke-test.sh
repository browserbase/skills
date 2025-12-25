#!/bin/bash
set -e

run_test() {
    local name=$1
    shift
    
    echo "test: $name"
    result=$("$@" 2>&1)
    if echo "$result" | grep -q '"success": true'; then
        echo "  pass"
    else
        echo "  FAIL"
        echo "$result"
        exit 1
    fi
}

command -v browser &> /dev/null || { echo "error: 'browser' not found. Run 'npm link' first."; exit 1; }

run_test "navigate" browser --headless navigate https://example.com
run_test "extract" browser --headless extract "get the page title"
run_test "screenshot" browser --headless screenshot
run_test "close" browser --headless close

echo "all tests passed"
