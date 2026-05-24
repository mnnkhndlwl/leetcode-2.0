#!/bin/sh
set -e

export GOCACHE=/tmp/gocache
export GOTMPDIR=/tmp

# Replace shell with the compiled binary; stdin is piped test case input
exec go run /code/solution.go
