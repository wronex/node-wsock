@echo off
cd ..
set jsdoc=../node-jsdoc2
set output=doc
set input=lib
:start
::node "%jsdoc%/app/run.js" -a -d=%output% -s -r -t="%jsdoc%/templates/jsdoc" %input%
jsdoc2 -a -d=%output% -s -r %input%
pause
goto start