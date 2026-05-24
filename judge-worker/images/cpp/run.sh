#!/bin/sh
set -e

# Compile — errors go to stderr (caller maps non-zero exit → RUNTIME_ERROR)
g++ -O2 -std=c++17 -o /tmp/solution /code/solution.cpp

# Replace shell with the binary; stdin is piped test case input
exec /tmp/solution
