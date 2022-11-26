# Changelog - homebridge-wyze-suite

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