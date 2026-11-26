# How should reopening and editing a recent walk work?

Label: wayfinder:grilling
Assignee: nick
Status: closed

Parent: [Field-test walk improvements](map.md)

## Question

Given three distinct walks, what happens to an unfinished draft when opening another walk, and when does an edited export replace the saved version?

## Resolution

Viewing or downloading a recent walk leaves the active walk open. Editing a recent walk preserves the unfinished active walk offline. After exporting the correction or canceling the edit, return to the active walk at the same photo.

When exporting an edited walk, ask “Download the previous PDF before replacing it?” Offer “Download previous PDF”, “Continue without downloading”, and “Cancel”. Keep the previous PDF available until the corrected export has been saved successfully. The corrected export replaces the same walk in recent history and uses one slot. Canceling the replacement or a failed export preserves the previous PDF.
