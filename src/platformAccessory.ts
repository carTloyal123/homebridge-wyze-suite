/* eslint-disable max-len */
/* eslint-disable max-len */
import { Service, PlatformAccessory, CharacteristicValue, Characteristic } from 'homebridge';
import { WyzeSuitePlatform } from './platform';

const sleep1 = t => new Promise(s => setTimeout(s, (t * 1000)));

/* eslint-disable */
const { exec } = require('child_process');
/* eslint-enable */

export class WyzeThermostatAccessory {
  private service: Service;
  private isOn = false;
  private currentStatus = '';
  private accLogName = '';
  private p2stubs = this.platform.config.path2py_stubs;
  private username = this.platform.config.username;

  private stateOff = this.platform.Characteristic.TargetHeatingCoolingState.OFF;
  private stateCool = this.platform.Characteristic.TargetHeatingCoolingState.COOL;
  private stateHeat = this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
  private stateAuto = this.platform.Characteristic.TargetHeatingCoolingState.AUTO;

  private currentHeatingCoolingState;
  private targetHeatingCoolingState;

  private currentTemperature;
  private targetCurrentTemperature;

  private targetCoolingThreshold;
  private targetHeatingThreshold;

  private currentCoolingThreshold;
  private currentHeatingThreshold;

  private currentTempUnit = this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT;
  private targetTempUnits = this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT;

  constructor(
    private readonly platform: WyzeSuitePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly deviceNickname: string,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Wyze')
      .setCharacteristic(this.platform.Characteristic.Model, 'Thermostat')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    // get the Switch service if it exists, otherwise create a new Switch service
    // you can create multiple services for each accessory
    // eslint-disable-next-line max-len
    this.service = this.accessory.getService(this.platform.Service.Thermostat) || this.accessory.addService(this.platform.Service.Thermostat);

    // create handlers for required characteristics
    // GET current heat/cool/off state
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.handleCurrentHeatingCoolingStateGet.bind(this));

    // GET current temperature
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));

    // Target heat/cool/off state
    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.handleTargetHeatingCoolingStateGet.bind(this))
      .onSet(this.handleTargetHeatingCoolingStateSet.bind(this));

    // Target temperature handlers - needed given that the system is not in auto
    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(this.handleTargetTemperatureGet.bind(this))
      .onSet(this.handleTargetTemperatureSet.bind(this));

    // Cooling setpoint handlers - needed for system in Auto
    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .onGet(this.handleCoolingThresholdTemperatureGet.bind(this))
      .onSet(this.handleCoolingThresholdTemperatureSet.bind(this));

    // Heating setpoint handlers - needed for system in Auto
    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .onGet(this.handleCoolingThresholdTemperatureGet.bind(this))
      .onSet(this.handleCoolingThresholdTemperatureSet.bind(this));

    // Target display unit handlers
    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(this.handleTemperatureDisplayUnitsGet.bind(this))
      .onSet(this.handleTemperatureDisplayUnitsSet.bind(this));
  }

  /*
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Switch.
   *
   * data: home app -> request to HK ->
   */
  async handleTargetHeatingCoolingStateSet(value: CharacteristicValue) {

    this.targetHeatingCoolingState = value as number;
    // value can be heat, cool, off
    this.accLogName = `'${this.accessory.displayName}'(${this.deviceNickname})`;
    this.myLogger(`Room '${this.accessory.displayName}'(${this.deviceNickname}): Set Characteristic On -> '${this.isOn}'`);

    if (value === this.currentHeatingCoolingState) {
      this.myLogger('System state already set!');
      return;
    }

    // run script to set system state in python
    // eslint-disable-next-line max-len
    exec(`python3 ${this.p2stubs}/setThermostatSystemState.py ${this.username} ${this.platform.config.password} '${this.deviceNickname}' '${this.targetHeatingCoolingState}'`,
      (error, stdout, stderr) => {
        if (error) {
          this.platform.log.info(`error: ${error.message}`);
          // unable to set state?
          return;
        }
        if (stderr) {
          this.platform.log.info(`stderr: ${stderr}`);
          return;
        }

        this.currentStatus = stdout.slice(0, -1);  // Strip off trailing newline ('\n')
        this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState).updateValue(this.targetHeatingCoolingState);
        this.currentHeatingCoolingState = this.targetHeatingCoolingState;
      });
  }

  async handleTargetTemperatureSet(value: CharacteristicValue) {
    // set target temperature in wyze-sdk
    this.targetCurrentTemperature = value as number;

    // check if they are already the same for some reason
    if (this.currentTemperature === this.targetCurrentTemperature) {
      this.myLogger('System current temperature already set!');
      return;
    }

    if (this.currentHeatingCoolingState === this.stateOff) {
      this.myLogger('System currently OFF, not setting temp!');
      return;
    }

    if (this.currentHeatingCoolingState === this.stateAuto) {
      this.myLogger('System currently AUTO, not setting single setpoint temp!');
      return;
    }

    // check for current state to set temp correctly
    let py_prog = '';

    if (this.currentHeatingCoolingState === this.stateCool) {
      py_prog = 'setThermostatTargetCoolingTemp';
    }

    if (this.currentHeatingCoolingState === this.stateHeat) {
      py_prog = 'setThermostatTargetHeatingTemp';
    }

    exec(`python3 ${this.p2stubs}/${py_prog}.py ${this.username} ${this.platform.config.password} '${this.deviceNickname}' '${this.targetCurrentTemperature}'`,
      (error, stdout, stderr) => {
        if (error) {
          this.platform.log.info(`error: ${error.message}`);
          // unable to set state?
          return;
        }
        if (stderr) {
          this.platform.log.info(`stderr: ${stderr}`);
          return;
        }

        this.currentTemperature = this.targetCurrentTemperature;
        this.myLogger(`Room '${this.accessory.displayName}'(${this.deviceNickname}): Set Characteristic TargetTemp -> '${this.targetCurrentTemperature}'`);

      });

  }

  async handleCoolingThresholdTemperatureSet(value: CharacteristicValue) {
    // set target temperature in wyze-sdk
    this.targetCoolingThreshold = value as number;

    if (this.currentHeatingCoolingState !== this.stateAuto) {
      this.myLogger('System currently NOT AUTO, not setting cooling threshold setpoint temp!');
      return;
    }
    // check for current state to set temp correctly
    const py_prog = 'setThermostatTargetCoolingTemp';

    exec(`python3 ${this.p2stubs}/${py_prog}.py ${this.username} ${this.platform.config.password} '${this.deviceNickname}' '${this.targetCoolingThreshold}'`,
      (error, stdout, stderr) => {
        if (error) {
          this.platform.log.info(`error: ${error.message}`);
          // unable to set state?
          return;
        }
        if (stderr) {
          this.platform.log.info(`stderr: ${stderr}`);
          return;
        }

        this.currentCoolingThreshold = this.targetCoolingThreshold;
        this.myLogger(`Room '${this.accessory.displayName}'(${this.deviceNickname}): Set Characteristic Cooling Threshold -> '${this.targetCoolingThreshold}'`);

      });

  }

  async handleHeatingThresholdTemperatureSet(value: CharacteristicValue) {
    // set target temperature in wyze-sdk
    this.targetHeatingThreshold = value as number;

    if (this.currentHeatingCoolingState !== this.stateAuto) {
      this.myLogger('System currently NOT AUTO, not setting cooling threshold setpoint temp!');
      return;
    }
    // check for current state to set temp correctly
    const py_prog = 'setThermostatTargetHeatingTemp';

    exec(`python3 ${this.p2stubs}/${py_prog}.py ${this.username} ${this.platform.config.password} '${this.deviceNickname}' '${this.targetHeatingThreshold}'`,
      (error, stdout, stderr) => {
        if (error) {
          this.platform.log.info(`error: ${error.message}`);
          // unable to set state?
          return;
        }
        if (stderr) {
          this.platform.log.info(`stderr: ${stderr}`);
          return;
        }

        this.currentHeatingThreshold = this.targetHeatingThreshold;
        this.myLogger(`Room '${this.accessory.displayName}'(${this.deviceNickname}): Set Characteristic Heating Threshold -> '${this.currentHeatingThreshold}'`);

      });

  }

  async handleTemperatureDisplayUnitsSet(value: CharacteristicValue) {
    // set target temperature in wyze-sdk
    this.targetTempUnits = value as number;

    if (this.targetTempUnits === this.currentTempUnit) {
      this.myLogger('System units already match!');
      return;
    }

    // check for current state to set temp correctly
    const py_prog = 'setThermostatTempUnits';

    // might need to do some conversion math here or set up F to C conversion and vice versa?

  }



  // -----------------------------------------------------------------------------------


  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   */
  async handleCurrentHeatingCoolingStateGet(): Promise<CharacteristicValue> {
    this.myLogger(`Room '${this.accessory.displayName}'(${this.deviceNickname}): Get Characteristic CurrentHeatingCoolingState -> ${this.currentHeatingCoolingState}`);

    return this.currentHeatingCoolingState;
  }

  async handleTargetHeatingCoolingStateGet(): Promise<CharacteristicValue> {
    this.myLogger(`Room '${this.accessory.displayName}'(${this.deviceNickname}): Get Characteristic TargetHeatingCoolingState -> ${this.targetHeatingCoolingState}`);

    return this.targetHeatingCoolingState;
  }

  async handleCurrentTemperatureGet(): Promise<CharacteristicValue> {
    this.myLogger(`Room '${this.accessory.displayName}'(${this.deviceNickname}): Get Characteristic Current Temp -> ${this.currentTemperature}`);

    return this.currentTemperature;
  }

  async handleTargetTemperatureGet(): Promise<CharacteristicValue> {
    this.myLogger(`Room '${this.accessory.displayName}'(${this.deviceNickname}): Get Characteristic Target Temperature -> ${this.targetCurrentTemperature}`);

    return this.targetCurrentTemperature;
  }

  async handleTemperatureDisplayUnitsGet(): Promise<CharacteristicValue> {
    this.myLogger(`Room '${this.accessory.displayName}'(${this.deviceNickname}): Get Characteristic Temp Display Units -> ${this.targetCurrentTemperature}`);

    return this.currentTempUnit;
  }

  async handleCoolingThresholdTemperatureGet(): Promise<CharacteristicValue> {
    this.myLogger(`Room '${this.accessory.displayName}'(${this.deviceNickname}): Get Characteristic Cooling Threshold -> ${this.currentCoolingThreshold}`);

    return this.currentCoolingThreshold;
  }

  async handleHeatingThresholdTemperatureGet(): Promise<CharacteristicValue> {
    this.myLogger(`Room '${this.accessory.displayName}'(${this.deviceNickname}): Get Characteristic Cooling Threshold -> ${this.currentHeatingThreshold}`);

    return this.currentHeatingThreshold;
  }

  myLogger( line ) {
    switch( this.platform.config.debugLevel ) {
      case 0:   // No logging
        return;
        break;
      case 1:   // Logging to homebridge.log
        this.platform.log.info( line );
        break;
      case 2:   // Logging to system level logs.
        this.platform.log.debug( line );
        break;
      default:
    }
  }
}
