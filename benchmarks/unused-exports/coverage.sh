#!/usr/bin/env bash
# Deliberately a shell script, not JavaScript: parse= exists precisely so a
# script's own natural output format (whatever a real tool already emits)
# doesn't need a JSON wrapper bolted on just to satisfy @code's binding
# convention. This one prints ordinary CSV, the shape a coverage tool or
# `wc`/`du` pipeline would produce with zero extra work.
echo "file,coverage"
echo "src/engine/engine.ts,82"
echo "src/parser/lexer.ts,95"
echo "src/renderer/formats/table.ts,100"
