# MVP alignment record

Destination: produce `pik-2-pdf-playbook.md` using `Orchestration-Playbook-Design-Guide.md`, ready for an orchestration agent to build the MVP in two days.

These are conversation notes. The execution handoff is now `pik-2-pdf-playbook.md`, which separates agreed requirements from engineering defaults and pending field verification.

## Confirmed requirements

- Black and white UI, basic lines, minimal design. Prioritize functionality and durability.
- Offline work is required while the app is already open and connectivity is poor or absent. Capture/import, notes, and PDF generation must not require network access.
- Reopening the app offline is outside the MVP. Keep the handoff's no-service-worker scope.
- Keep one current walk, with pause and resume. No multiple-walk management.
- Automatically save changes on the same device.
- Resume the saved walk after closing Safari when connectivity is available to reopen the app.
- Export retains the walk. Explicitly clearing it requires confirmation.
- Enforce a hard limit of 50 photos per walk. At capacity, disable adding photos and explain that the walk is full. Verify saving, resuming, and exporting all 50 on an actual iPhone or iPad.
- Notes are optional and limited to 200 characters per photo, with a visible character counter. Include the full note in the four-photo-per-page PDF without silent truncation.
- Reject a photo selection in full if it exceeds the remaining capacity. Show the number of spaces remaining and ask the user to select that many or fewer. Do not silently import a subset.
- For a selection within capacity, keep successfully imported photos when an individual file fails. Identify the failed file and allow retry without duplicating successful imports. Previously saved photos remain untouched. Storage failures still pause further additions under the save-failure rule above.
- Show "Saved" only after the device confirms persistence. On a storage or save failure, preserve the existing walk, visibly mark unsaved changes, and pause further photo additions. Offer retry and PDF export as recovery options; never imply that unsaved changes will survive closing the app.
- The user will test on an iPad. iPad is the required real-device acceptance target; iPhone verification must not be claimed without separate testing. Plan an early camera/import/export check on day one and full 50-photo recovery/export checks on day two.
- On day one, the user will privately test uploading an exported PDF from the iPad into the internal job-jacket program. The program name and upload limit are not shared and are not prerequisites for implementation. Record pass/fail and any shareable error; do not assume a size limit or claim upload acceptance before this test. Include a representative 50-photo export in this early upload check. If upload fails, investigate the observed failure before changing compression or the single-PDF contract.

## Deferred to implementation and field verification

- The playbook proposes restoring committed photos after interrupted imports and testing actual iPad image formats early. These are engineering defaults, not additional user decisions.
- The playbook defines the two-day acceptance checks. Real-device and internal-upload results remain pending.

The source handoff remains the baseline for requirements not yet discussed. These notes record explicit changes and clarifications, not approval of every implementation detail.
