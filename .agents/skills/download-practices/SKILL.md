---
name: download-practices
description: Download practice image files from the project's Google Drive folder into their corresponding folders in this repository.
---

# Download practices

The Drive root `1Ewx7UlTgu7OyNC8kpSFtlottw9EG4QaK` corresponds to the repository root. Ask the user to identify a descendant by URL or ID, then run the helper with that folder. It derives the destination from the folder's ancestry under the root. The known example is `1Gxxxauy6ENBv08Y8IVyRi-bVELMqXnbU` → `grade_11/math/段考2周考2`; if ancestry differs, ask the user to resolve the mapping.

Run `python3 .agents/skills/download-practices/scripts/download.py FOLDER_URL --destination EXPECTED_PATH` from the repository root; `--destination` is optional and checks the derived path. The helper requires `google-auth`, `google-auth-oauthlib`, and `requests`. Credentials and OAuth tokens are in `~/.config/HighSchoolPractice/`, outside the repository. The first run prints a Google authorization URL for the user to open and complete. If login is not reachable in this environment, report the failure and work with the user to authorize locally.

The helper verifies ancestry, recursively downloads image MIME types, skips identical files and preserves differing files as conflicts. Report downloaded, identical, conflicting and failed files. Ask the user how to handle conflicts; do not overwrite without direction. Report incomplete listings or downloads as failures. The repository ignores JPG files, so they remain local unless the user changes that policy.
