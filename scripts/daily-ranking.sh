#!/bin/zsh
# Once a day, with Claude Code: hunts the web for new postings (scripts/job-hunt.md), then ranks every unscored job
# (scripts/daily-ranking.md), including the Grok bot's findings. Run by launchd
# (~/Library/LaunchAgents/com.jobbing.daily-ranking.plist); if the Mac was asleep at the scheduled time, launchd runs
# it on wake. Summaries are saved to data/ranking/<date>-hunt.md and <date>.md and shown as notifications.

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "${0:A:h}/.." || exit 1

today=$(date +%F)
mkdir -p data/ranking

notify() {
  local text=${1//\"/\\\"}
  osascript -e "display notification \"$text\" with title \"Jobbing\" subtitle \"$2\""
}

# Runs one Claude step: $1 = prompt file, $2 = summary file, $3 = notification subtitle, then the allowed tools.
step() {
  local promptFile=$1 summary=$2 label=$3
  shift 3
  if [[ -s "$summary" ]]; then
    echo "$(date) $label already done today"
    return 0
  fi
  echo "$(date) $label starting"
  claude -p "$(cat "$promptFile")

Today's date is $today." --permission-mode acceptEdits --allowedTools "$@" >"$summary.tmp" 2>&1
  local code=$?
  if [[ $code -eq 0 && -s "$summary.tmp" ]]; then
    mv "$summary.tmp" "$summary"
    notify "$(head -n 1 "$summary" | sed 's/^#* *//')" "$label · $summary"
  else
    mv "$summary.tmp" "${summary%.md}-failed.log"
    notify "Failed, see ${summary%.md}-failed.log" "$label"
  fi
  echo "$(date) $label done (exit $code)"
  return $code
}

# A failed hunt still lets the ranking run on the Grok bot's findings.
step scripts/job-hunt.md "data/ranking/$today-hunt.md" "Job hunt" \
  "WebSearch" "WebFetch" "Bash(npm run *)" "Bash(sqlite3 *)" "Read" "Write"
step scripts/daily-ranking.md "data/ranking/$today.md" "Job ranking" \
  "Bash(npm run *)" "Bash(cp data/jobbing.db *)" "Bash(sqlite3 *)" "Read" "Write"
