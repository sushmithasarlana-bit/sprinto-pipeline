#!/bin/zsh
# Type the GitHub dispatch token into a hidden prompt; it is written to .dispatch-token (git-ignored)
# so it can be uploaded to Vercel as GITHUB_DISPATCH_TOKEN. Nothing is echoed.
cd "${0:A:h}/.." || exit 1
read -s "T?Paste the GitHub token (hidden), then press Enter: "
echo
if [[ -z "$T" ]]; then echo "Nothing entered; nothing saved."; exit 1; fi
umask 077
printf '%s' "$T" > .dispatch-token
unset T
echo "saved"
