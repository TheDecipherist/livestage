#!/usr/bin/env bash
# A script whose output is genuinely just text, no structure to parse at
# all: parse="text" is the explicit way to say so, rather than relying on
# "stdout happened not to be valid JSON" to fall back to a string.
echo "livestage: $(node -e 'console.log(1 + 1)') exported symbols checked, all clean"
