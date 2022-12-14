# Changelog - homebridge-wyze-suite

## [0.7.39] - 2022-12-8

### Changed

- Update README.md

## [0.7.39] - 2022-12-8

### Changed

- Update to path calculation for py_helpers

## [0.7.36] - 2022-12-8

### Changed

- Fixed py_helpers path to use node:path package instead of path from JS

## [0.7.35] - 2022-12-7

### Changed

- Added auths to npmignore

## [0.7.33] - 2022-12-7

### BROKEN VERSION

### Changed

- Deprecated Python Stubs config option and always getting helpers from node_modules current directory
- Cleaned up device discovery logic

## [0.7.31] - 2022-12-5

### Changed

- Update authenticationService.py to not output errors, need to to fix this to handle error messages correctly


## [0.7.30] - 2022-12-5

### Changed

- Update wyze-sdk to have token authentication
- Changed python scripts to use authentication tokens instead of username/pass  every time

## [0.7.25] - 2022-11-28

### Changed

- Tidy up logger to actually be useful now, default to no logging. 1 for full logging

## [0.7.25] - 2022-11-28

### Changed

- Fixed set temperature for single mode heat/cool

## [0.7.24] - 2022-11-28

### Changed

- Update temperature logic for target temp during heat/cool

## [0.7.23] - 2022-11-28

### Changed

- Finally found bug breaking temperature conversions

## [0.7.22] - 2022-11-28

### Changed

- Trying to fix temperature logic...again

## [0.7.21] - 2022-11-28

### Changed

- Updated NPM version to 21

## [0.7.18] - 2022-11-28

### Changed

- Updated NPM version

## [0.7.15] - 2022-11-28

### Changed

- Updating retry logic to work correctly
- Updated retry logic to have  max attempts
- Updated log messages for clarity

## [0.7.12] - 2022-11-28

### Changed

- Tweaking temperature units

## [0.7.11] - 2022-11-28

### Changed

- Run get states once at startup for thermostat device loop
- Updated units for setting HK characteristics

## [0.7.8] - 2022-11-28

### Changed

- Updated correct temperature value being sent to Wyze based on temperature units, HK always sends celsius!

## [0.7.7] - 2022-11-28

### Changed

- Refactor device discovery setTimeout to be able to use 'this'

## [0.7.6] - 2022-11-28

### Changed

- Updated setters to update characteristics if set is successful
- Actually added processGetUpdate to getters to check data status each time

## [0.7.5] - 2022-11-28

### Changed

- Updated SET methods for sending HK values to Wyze scripts
- Updated refresh to use setinterval instead of while loops
- Updated get devices to use setTimeout recursively until devices found

## [0.7.4] - 2022-11-28

### Changed

- Updated wyze python scripts for possiblen input bug, thanks ([**@shauntarves**](https://github.com/shauntarves))
- Cleaned up debug messages
- Updated data refresh logic for thermostat

## [0.7.3] - 2022-11-28

### Changed

- cleaned up target vs current heating cooling state logic
- added wyze debug output

## [0.7.2] - 2022-11-28

### Changed

- Thermostat refreshes device states according to config param actually works
- Update to device discovery to use python shell, generate on close


## [0.7.2] - 2022-11-25

### Changed

- Thermostat refreshes device states according to config param
- Only runs python scripts in refresh time rather than every time get is called

## [0.7.1] - 2022-11-25

### Changed

- Changed get structure to refresh on an interval and populate homekit requests with previous value instead of python calls every get request

## [0.7.0] - 2022-11-25

### Changed

- Getting of values from Wyze looks good and works as expected so far

## [0.6.38] - 2022-11-25

### Changed

- Fixed wrong callback registered for heating threshold characteristic

## [0.6.21] - 2022-11-25

### Changed

- Fixed timeout issue using computational timer
- Added more debug messages for devices getting added or not

## [0.6.21] - 2022-11-25

### Changed

- Fixed stdout getting stuck on startup

## [0.6.21] - 2022-11-25

### Changed

- Updated lint errors

## [0.6.19] - 2022-11-25

### Changed

- Reverted discovery method to single try

## [0.6.18] - 2022-11-25

### Changed

- Retry discovery using promises

## [0.6.17] - 2022-11-25

### Changed

- Added real logic to discovery retry

## [0.6.16] - 2022-11-25

### Changed

- Changed retry logic to use setInterval instead of while loop

## [0.6.15] - 2022-11-25

### Changed

- Added homebridge config option for `deviceDiscoveryTimeout` and `maximumDiscoveryAttempts`

## [0.6.14] - 2022-11-25

### Changed

- Fixed retry process to actually stop if discovery works

## [0.6.12] - 2022-11-25

### Changed

- Fixed retry structure to wait before executing python again
- Setup to add variables to timeout and retries
- Corrected temperature target return

## [0.6.10] - 2022-11-25

### Changed

- Fixed retry logic for getting devices for the first time to have some parameters and not be infinite

## [0.6.8] - 2022-11-25

### Changed

- Fixed getTargetTemperature by switching heating and cooling threshold return values depending on state

## [0.6.8] - 2022-11-25

### Changed

- Fixed temperature units issue when returning them from wyze. Returns string not number of course

## [0.6.6] - 2022-11-25

### Changed

- Fixed getter for currentHeatingCoolingStateGet to use local enum instead of HAP enum class

## [0.6.4] - 2022-11-24

### Changed

- Fixed getters for characteristics to actually get data from Wyze
- Fixed Fahrenheit to Celsius conversion where needed to avoid weird data over 100 degrees
- Added logic to get current heating cooling state based on 

## [0.5.0] - 2022-11-23

### Changed

- Added default values for temperatures and system states ([**@carTloyal123**](https://github.com/carTloyal123))
- Fixed getters for Wyze thermostat information using python scripts

## [0.3.1] - 2022-11-23

### Changed

- Update `changelog` to `~0.3.1` ([**@carTloyal123**](https://github.com/carTloyal123))

## [0.2.0] - 2022-11-23

- Initial public release.