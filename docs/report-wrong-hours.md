# Report wrong hours → Pam's nightly call list

**How reports arrive.** The "Report wrong hours" link on each opened card opens the site's existing
Suggest-an-update dialog in "report" mode and sends through the same FormSubmit.co endpoint
(`config.js` → `formEndpoint`), so reports land in **jcshowalter23@gmail.com** like every other
update. Subject: `Open Late · Report wrong hours: <place> (<city, county>)`.
Fields: `type` = "Report wrong hours", `what` = issues picked (Closed now, Wrong close time,
Wrong kitchen hours, Permanently closed, Other), `days` = days picked (or "not given"),
`details` = optional note, `placeKey` = `<area>|<place id>`, `page` = listing link.

**Into the call list.**
1. Gmail search: `subject:"Open Late · Report wrong hours" newer_than:1d`.
2. Save the bodies to a text file (or one JSON object per line with the fields above).
3. `python3 tools/hours_reports.py reports.txt > /workspace/calls/reports-call-list.csv`
   gives rows in the same columns as `/workspace/calls/call-list.csv`, filled with the place's current
   site hours, kitchen hours and phone from `data/county/*.json` (blank when not on file; nothing guessed).
   "Closed now" / "Permanently closed" get priority 1, the rest 2.
4. Append those rows ahead of the regular list for Pam. A report is only a lead: hours change on the
   site only after Pam's call or a source confirms them (same rule as suggestions).
