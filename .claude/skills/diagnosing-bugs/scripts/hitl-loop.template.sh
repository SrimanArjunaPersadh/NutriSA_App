#!/usr/bin/env bash
# Human-in-the-loop reproduction loop for NutriSA.
#
# The agent cannot run the app — Sriman has Expo running in his own terminal. This script
# is how the agent structures his half of the loop: one run, one clean signal back.
#
# The agent copies this file to .scratch/, edits the block between the markers, and asks
# Sriman to run it. Captured values print at the end for the agent to parse.
#
# Usage:
#   bash .scratch/<bug-name>-loop.sh
#
# Two helpers:
#   step "<instruction>"          → show instruction, wait for Enter
#   capture VAR "<question>"      → show question, read the answer into VAR
#
# Rule: `step` is for things Sriman does; `capture` is for things he observes. Never
# capture a secret, a weight, or a macro value — those must not reach the transcript.

set -euo pipefail

step() {
  printf '\n>>> %s\n' "$1"
  read -r -p "    [Enter when done] " _
}

capture() {
  local var="$1" question="$2" answer
  printf '\n>>> %s\n' "$question"
  read -r -p "    > " answer
  printf -v "$var" '%s' "$answer"
}

# --- edit below ---------------------------------------------------------------

step "Make sure Expo is running and the app is open on the iPhone."

step "Force-reload the app (shake > Reload) so Metro serves the current bundle."

capture TAB_RENDERS "Open the Nutrition tab. Does the tab bar render at all? (y/n)"

capture SYMPTOM "Describe exactly what you see instead of the expected screen:"

capture CONSOLE "Paste the last red line from the Metro terminal (or 'none'):"

# --- edit above ---------------------------------------------------------------

printf '\n--- Captured ---\n'
printf 'TAB_RENDERS=%s\n' "$TAB_RENDERS"
printf 'SYMPTOM=%s\n' "$SYMPTOM"
printf 'CONSOLE=%s\n' "$CONSOLE"
