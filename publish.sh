#! /bin/sh
# Stolen from  NorthernMan54/homebridge-tasmota
# Do NOT run via sudo or root!

npm audit

if  true; then
  if npm run build; then
    git add .
    npm version patch -m "$1" --force
    npm publish --tag latest
    git commit -m "$1"
    git push "https://github.com/carTloyal123/homebridge-wyze-suite" master --tags
  else
    echo "Not publishing due to build failure"
  fi
else
  echo "Not publishing due to lint failure"
fi
