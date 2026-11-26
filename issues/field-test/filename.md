# What filename should a walk use when the ID is empty?

Label: wayfinder:grilling
Status: closed

Parent: [Field-test walk improvements](map.md)

## Question

Use the entered ID for the PDF name. What fallback and filename-character handling should apply?

## Resolution

Use the sanitized Job/Lot ID as the filename. If the ID is blank or sanitizes to an empty string, use the walk creation date and local time with AM or PM, for example `Field-Walk_2026-11-26_2.35.08 PM.pdf`.
