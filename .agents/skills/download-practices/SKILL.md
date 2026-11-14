---
name: download-practices
description: Download practice image files from the project's Google Drive folder into their corresponding folders in this repository.
---

# Download practices

The Drive root `1Ewx7UlTgu7OyNC8kpSFtlottw9EG4QaK` corresponds to the repository root. Ask the user to identify a descendant by URL or ID, then run the helper with that folder. It derives the destination from the folder's ancestry under the root. The known example is `1Gxxxauy6ENBv08Y8IVyRi-bVELMqXnbU` → `grade_11/math/段考2周考2`; if ancestry differs, ask the user to resolve the mapping.

Install the pinned dependencies with `python3 -m pip install -r tests/requirements-download.txt`. Run `python3 .agents/skills/download-practices/scripts/download.py FOLDER_URL --destination EXPECTED_PATH` from the repository root; `--destination` is optional and checks the derived path. Credentials and OAuth tokens are in `~/.config/HighSchoolPractice/`, outside the repository.

The first run prints a Google authorization URL and waits for sign-in. Give the user the complete URL in a copyable code block, including its final character; keep the process running until the browser redirects to localhost. If the process stops or the link expires, rerun the helper and share the newly printed URL. If localhost is unreachable from the browser, report the failure and work with the user to authorize locally.

The helper verifies ancestry, recursively downloads image MIME types, skips identical files and preserves differing files as conflicts. Report downloaded, identical, conflicting and failed files. Ask the user how to handle conflicts; do not overwrite without direction. Report incomplete listings or downloads as failures. The repository ignores JPG files, so they remain local unless the user changes that policy.
