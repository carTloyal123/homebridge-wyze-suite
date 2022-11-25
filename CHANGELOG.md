# Changelog

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