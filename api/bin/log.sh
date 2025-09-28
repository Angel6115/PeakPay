#!/usr/bin/env bash
set -euo pipefail

AUTHOR="${AUTHOR:-macmini}"
DATE_LOCAL="$(date '+%Y-%m-%d %H:%M %Z')"
SUMMARY="${1:-Entrada rápida}"
shift || true

{
  echo "- ${DATE_LOCAL} — ${AUTHOR} — ${SUMMARY}"
  while (( "$#" )); do
    echo "  - $1"
    shift || true
  done
  echo
} >> docs/WORKLOG.md

echo "Añadido a docs/WORKLOG.md"
