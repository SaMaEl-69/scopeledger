# Document review and storage update — 9 October 2026

## Implemented

- **Brief, Invoice and Credit note** can be selected directly above the guided preview. Each kind keeps its own revision-scoped draft, and the selection carries through Export and Back. Choosing Invoice does not create approval, issue a record or charge a client; existing approval, billing and due-date checks still apply.
- Editing **Tax percentage** in **Including tax** mode updates the proposed client total while preserving the document's before-tax fee and credit at cent precision. For example, a $1,100 total at 10% becomes $1,200 at 20%, retaining a $1,000 before-tax fee. Excluding tax and Custom retain the entered before-tax amount and recalculate the tax breakdown. Invalid or unfinished tax inputs do not overwrite the fee. Tax changes invalidate current approval while previously issued documents retain their exact snapshots.
- Logo and signature imports accept **PNG, JPEG, WebP, GIF, AVIF and BMP**, up to **2 MiB** each, with dimensions up to **4096 × 4096**. Supported headers are checked before decoding. Browser decoding then verifies the actual image; SVG and executable/remote payloads remain excluded.
- Images become static local PNGs. Animation and metadata are not carried into documents. Logos fit within 600 × 240 pixels, signatures within 1280 × 384, and busy images shrink further automatically. Normalized storage bounds remain approximately 300 KiB for a logo and 256 KiB for a signature. The 2 MiB allowance applies to the source upload, not every repeated document snapshot. Transparency is retained.
- The app's **expanded workspace safety cap is 50 MiB**, increased from 10 MiB. The size meter and rejection rules use the same cap. Browser storage is separate and may grant less space. Exceeding a limit or a browser quota does not replace the previous saved workspace or silently delete history.
- Downloaded backups store repeated logos/signatures once, then restore the exact validated workspace and immutable document snapshots. Encryption is the default; plain JSON requires explicit acknowledgement. Old plain and encrypted backups remain readable. Encrypted transport allows about **67 MiB** for base64/encryption overhead; this is not an extra workspace allowance. Compressed envelopes that expand beyond 50 MiB are rejected.
- Settings show the browser's reported available site storage and retention status. **Keep storage on this device** asks the browser for persistent retention when supported. A refused request is reported honestly. Persistence does not survive deliberate site-data clearing or device loss; keep an external backup and recovery phrase.

## Why the old cap existed

The 10 MiB figure was an application guard, not a Cloudflare storage plan or a maximum backup count. This app saves the complete validated browser workspace and a previous recovery version. Document snapshots contain their own images so later branding/signature edits cannot rewrite historical documents. Without a shared asset store, repeated snapshots increase workspace size. Raising the cap and fitting images gives immediate room; compact backup transport reduces downloaded file size.

The current database layout remains compatible. Images are still embedded in device-side workspace snapshots, and saves still validate/serialize the entire graph. A 50 MiB workspace is a safety ceiling, not a promise of equally fast editing on every phone. No customer data is automatically uploaded to Cloudflare.

## Recommended next storage architecture

1. **Shared local image assets.** Store canonical PNG blobs in a dedicated IndexedDB asset store, keyed by a content hash. Drafts and immutable documents reference an immutable asset ID, so one unchanged logo is stored once. Keep record history separate from image bytes.
2. **Atomic migration and recovery.** Migrate the existing embedded images in a versioned transaction, verify hashes and exact rendered content, and retain a recoverable pre-migration copy. Test interrupted upgrades, cross-tab edits, quota failures, close/reopen, and old backup imports before rollout.
3. **Portable backups.** Bundle every referenced asset once, alongside validated records, in an encrypted versioned backup. Restore must reject missing assets, altered bytes, oversized expansion and invalid relationships before replacing the current workspace. Never prune an image referenced by a historical document.
4. **Optional encrypted remote backup.** Add authenticated, user-initiated cloud backup only after the production identity/backend is implemented. Keep recovery encryption keys off the storage service, enforce per-customer authorization and quotas, and offer retention/delete/restore controls. Cloud backup should be a separate opt-in feature; it does not imply team synchronization.

Prioritize the shared local asset store before increasing the cap again or selling cloud storage. It addresses duplication and save costs without changing the local-first workflow. Paid checkout, licensing and protected PDF services remain disabled on the public Cloudflare demo until their production backend is configured.

## Verification

Results for this update are recorded in the release checkpoint and Cloudflare deployment guide. Automated coverage includes fee/credit cent arithmetic, invalid tax drafts, approval invalidation, exact issued-image backup restoration, legacy transport, malformed references, oversized expansion, source-upload bounds, actual six-format image decoding, document selection through Export/Back, and responsive controls in both themes.

Completed before publication: **465 unit/server tests**, **15 new cross-engine document/storage journeys**, **9 real PDF/capacity journeys** across Chromium, Firefox and WebKit, and **13 targeted existing workflow/signature/logo checks**. The new responsive matrix covers 320, 390, 588, 768, 1024, 1440 and 1920 pixels in both themes, with accessibility checks for the switch. Strict TypeScript/build and both production/full dependency audits pass. These are automated desktop engine checks; physical devices, large-workspace performance benchmarks and a production paid backend are outside this update. Live deployment results are recorded separately in the Cloudflare guide.
