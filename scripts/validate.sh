#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

node -c timemachine/index.js
node -e "
const fs = require('fs');
[
  'timemachine/package.json',
  'timemachine/UIConfig.json',
  'timemachine/config.json',
  'timemachine/i18n/strings_en.json'
].forEach((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
console.log('syntax/json ok');
"
