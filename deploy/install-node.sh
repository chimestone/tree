#!/usr/bin/env bash
set -euo pipefail

# Install an official Node.js 24 LTS binary after checking its published SHA256.
[[ "$(uname -m)" == x86_64 ]] || { echo 'This installer requires x86_64'; exit 1; }
work_dir=$(mktemp -d /tmp/tree-node.XXXXXX)
cd "$work_dir"
curl -fsS --retry 2 --max-time 90 https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o SHASUMS256.txt
archive=$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ {print $2}' SHASUMS256.txt)
[[ "$archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$ ]]
curl -fsS --retry 2 --max-time 180 "https://nodejs.org/dist/latest-v24.x/$archive" -o "$archive"
grep "  $archive$" SHASUMS256.txt | sha256sum -c -
tar -xJf "$archive" -C /opt
node_dir="/opt/${archive%.tar.xz}"
ln -sfn "$node_dir/bin/node" /usr/local/bin/node
ln -sfn "$node_dir/bin/npm" /usr/local/bin/npm
ln -sfn "$node_dir/bin/npx" /usr/local/bin/npx
node --version
npm --version
