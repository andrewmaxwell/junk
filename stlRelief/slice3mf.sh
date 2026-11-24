#!/bin/zsh
# slice3mf.sh <project.3mf>: slice a Bambu Studio project on the command line, with its own settings, and
# print Bambu's warning (the "floating regions" one shows up here), print time and filament weight
P=${1:A}; o=$(mktemp -d); cd $o
/Applications/BambuStudio.app/Contents/MacOS/BambuStudio --slice 0 --outputdir . $P > log.txt 2>&1
grep -o '"warning_message": "[^"]*"' result.json
grep -m1 'total estimated time' plate_1.gcode; grep -m1 'total filament weight' plate_1.gcode
cd /; rm -rf $o
