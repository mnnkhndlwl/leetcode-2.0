#!/bin/sh
set -e

# Compile — class name must be Main (matches Main.java)
javac -d /tmp /code/Main.java

# Replace shell with JVM; stdin is piped test case input
exec java -cp /tmp Main
