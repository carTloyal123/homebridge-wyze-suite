/* eslint-disable max-len */

import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { WyzeSuitePlatform } from './platform';
import {Options, PythonShell} from 'python-shell';

/* eslint-disable */
const { exec } = require('child_process');
/* eslint-enable */

export class WyzeThermostatAccessory {
  private service: Service;
  private isOn = false;

  private accLogName = '';
  private currentStatus = '';
  private wyzeDataUpdated = false;
  private lastWyzeUpdate: Date = new Date();
  private dataTimeout = this.platform.config.newDataTimeout;
  private refreshIntervalID;

  private p2stubs = this.platform.config.path2py_stubs;
  private username = this.platform.config.username;

  private stateOff = this.platform.Characteristic.TargetHeatingCoolingState.OFF;
  private stateCool = this.platform.Characteristic.TargetHeatingCoolingState.COOL;
  private stateHeat = this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
  private stateAuto = this.platform.Characteristic.TargetHeatingCoolingState.AUTO;

  private currentWyzeHeatingCoolingState = 3;

  private currentTemperature = 20.5;

  private currentCoolingThreshold = 21.0;
  private currentHeatingThreshold = 20.0;

  private currentTempUnit: number = this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;
  private targetTempUnits: number = this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;

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
      .onGet(this.handleHeatingThresholdTemperatureGet.bind(this))
      .onSet(this.handleHeatingThresholdTemperatureSet.bind(this));

    // Target display unit handlers
    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(this.handleTemperatureDisplayUnitsGet.bind(this))
      .onSet(this.handleTemperatureDisplayUnitsSet.bind(this));

    this.runStartup();
  }

  async runStartup() {
    this.wyzeLog('Running update loop!');
    this.wyzeLog(`Update timeout value: ${this.platform.config.refreshIntervalMilliSeconds}`);
    if (!this.platform.config.refreshIntervalMilliSeconds) {
      this.platform.config.refreshIntervalMilliSeconds = 20000;
    }
    this.handleGetAllWyzeStates(); // get once at startup
    this.refreshIntervalID = setInterval(() => {
      this.wyzeDataUpdated = false;
      this.handleGetAllWyzeStates();
    }
    , this.platform.config.refreshIntervalMilliSeconds);
  }

  /*
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Switch.
   *
   * data: home app -> request to HK -> HB -> Wyze
   */
  async handleTargetHeatingCoolingStateSet(value: CharacteristicValue) {

    const targetValue = value as number;
    // value can be heat, cool, off
    this.accLogName = `'${this.accessory.displayName}'(${this.deviceNickname})`;
    this.wyzeLog(`(${this.deviceNickname}): Set Target Heating Cooling State -> '${targetValue}'`);

    if (value === this.currentWyzeHeatingCoolingState) {
      this.wyzeLog('System state already set!');
      return;
    }

    // run script to set system state in python
    // eslint-disable-next-line max-len
    exec(`python3 ${this.p2stubs}/setThermostatSystemState.py ${this.username} '${this.platform.config.password}' '${this.deviceNickname}' '${targetValue}'`,
      (error) => {
        if (error) {
          this.wyzeLog(`error: ${error.message}`);
          // unable to set state?
          return;
        }
        this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState).updateValue(targetValue);
        // need to also update rest of values here like new target temp
        this.currentWyzeHeatingCoolingState = targetValue;
      });
  }

  async handleTargetTemperatureSet(value: CharacteristicValue) {

    const targetValue = value as number;

    // set target temperature in wyze-sdk
    this.wyzeLog(`Setting Target temperature to: ${targetValue}`);

    // check for current state to set temp correctly
    let py_prog = '';
    switch (this.currentWyzeHeatingCoolingState) {
      case this.stateCool:
        py_prog = 'setThermostatTargetCoolingTemp';
        break;
      case this.stateHeat:
        py_prog = 'setThermostatTargetHeatingTemp';
        break;
      case this.stateAuto:
        this.wyzeLog('Not setting target temp for auto system!');
        return;
      case this.stateOff:
        this.wyzeLog('Not setting target temp for auto system!');
        return;
      default:
        break;
    }

    const wyzeTargetTemp = this.cel2Far(targetValue);
    // eslint-disable-next-line max-len
    exec(`python3 ${this.p2stubs}/${py_prog}.py ${this.username} '${this.platform.config.password}' '${this.deviceNickname}' '${wyzeTargetTemp}'`,
      (error) => {
        if (error) {
          this.wyzeLog(`error: ${error.message}`);
          // unable to set state?
          return;
        }

        switch (this.currentWyzeHeatingCoolingState) {
          case this.stateCool:
            this.currentCoolingThreshold = value as number;
            break;
          case this.stateHeat:
            this.currentHeatingThreshold = value as number;
            break;

          default:
            this.currentTemperature = value as number;
            break;
        }

        this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature).updateValue(value as number);
        // eslint-disable-next-line max-len
        this.wyzeLog(`(${this.deviceNickname}): Set Characteristic TargetTemp -> '${targetValue}'`);

      });

  }

  async handleCoolingThresholdTemperatureSet(value: CharacteristicValue) {
    // set target temperature in wyze-sdk

    const targetValue = value as number;
    this.wyzeLog(`Setting Target Cooling temperature to: ${targetValue}`);

    if (this.currentWyzeHeatingCoolingState !== this.stateAuto) {
      this.wyzeLog('System currently NOT AUTO, not setting cooling threshold setpoint temp!');
      return;
    }
    // check for current state to set temp correctly
    const py_prog = 'setThermostatTargetCoolingTemp';
    const wyzeTargetValue = this.cel2Far(targetValue);
    // eslint-disable-next-line max-len
    exec(`python3 ${this.p2stubs}/${py_prog}.py ${this.username} '${this.platform.config.password}' '${this.deviceNickname}' '${wyzeTargetValue}'`,
      (error) => {
        if (error) {
          this.wyzeLog(`error: ${error.message}`);
          // unable to set state?
          return;
        }
        this.currentCoolingThreshold = targetValue;

        this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).updateValue(targetValue);

        // eslint-disable-next-line max-len
        this.wyzeLog(`(${this.deviceNickname}): Set Characteristic Cooling Threshold -> '${this.currentCoolingThreshold}'`);
      });

  }

  async handleHeatingThresholdTemperatureSet(value: CharacteristicValue) {

    const targetValue = value as number;
    // set target temperature in wyze-sdk
    this.wyzeLog(`Setting Target Heating temperature to: ${targetValue}`);

    if (this.currentWyzeHeatingCoolingState !== this.stateAuto) {
      this.wyzeLog('System currently NOT AUTO, not setting Heating threshold setpoint temp!');
      return;
    }
    // check for current state to set temp correctly
    const py_prog = 'setThermostatTargetHeatingTemp';
    const wyzeTargetValue = this.cel2Far(targetValue);
    // eslint-disable-next-line max-len
    exec(`python3 ${this.p2stubs}/${py_prog}.py ${this.username} '${this.platform.config.password}' '${this.deviceNickname}' '${wyzeTargetValue}'`,
      (error) => {
        if (error) {
          this.wyzeLog(`error: ${error.message}`);
          // unable to set state?
          return;
        }

        this.currentHeatingThreshold = targetValue;
        this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).updateValue(targetValue);

        // eslint-disable-next-line max-len
        this.wyzeLog(`(${this.deviceNickname}): Set Characteristic Heating Threshold -> '${this.currentHeatingThreshold}'`);

      });

  }

  async handleTemperatureDisplayUnitsSet(value: CharacteristicValue) {
    // set target temperature in wyze-sdk
    this.targetTempUnits = value as number;
    this.wyzeLog(`Setting Target Units: ${this.targetTempUnits}`);

    if (this.targetTempUnits === this.currentTempUnit) {
      this.wyzeLog('System units already match!');
      return;
    }
    // might need to do some conversion math here or set up F to C conversion and vice versa?
  }

  // -----------------------------------------------------------------------------------

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   */
  async handleCurrentHeatingCoolingStateGet(): Promise<CharacteristicValue> {

    this.processGetUpdate();

    this.wyzeLog(`(${this.deviceNickname}): Get TargetHeatingCoolingState -> ${this.currentWyzeHeatingCoolingState}`);

    // TODO: set characteristics accordingly for each option here to update UI in HK
    // if auto, calculate current heating or cooling state
    if (this.currentWyzeHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.AUTO) {
      if (this.currentTemperature < this.currentCoolingThreshold && this.currentTemperature > this.currentHeatingThreshold) {
        return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
      } else if (this.currentTemperature > this.currentCoolingThreshold) {
        return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
      } else if (this.currentTemperature < this.currentHeatingThreshold) {
        return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      }
    } else {
      return this.currentWyzeHeatingCoolingState;
    }
    return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
  }

  async handleTargetHeatingCoolingStateGet(): Promise<CharacteristicValue> {
    this.processGetUpdate();

    // eslint-disable-next-line max-len
    this.wyzeLog(`(${this.deviceNickname}): Get Characteristic TargetHeatingCoolingState -> ${this.currentWyzeHeatingCoolingState}`);

    return this.currentWyzeHeatingCoolingState;
  }

  async handleCurrentTemperatureGet(): Promise<CharacteristicValue> {
    this.processGetUpdate();
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).updateValue(this.currentTemperature);

    // eslint-disable-next-line max-len
    this.wyzeLog(`(${this.deviceNickname}): Get Characteristic CurrentTemperature -> ${this.currentTemperature}`);
    return this.currentTemperature;
  }

  async handleTargetTemperatureGet(): Promise<CharacteristicValue> {
    this.processGetUpdate();
    let out = 20.5;
    // eslint-disable-next-line max-len
    // do some logic to check for heating or cooling, then return cooling_setpoint or heating_setpoint
    if (this.currentWyzeHeatingCoolingState === this.stateCool) {
      out = this.currentCoolingThreshold;
      this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature).updateValue(this.currentCoolingThreshold);
    } else if (this.currentWyzeHeatingCoolingState === this.stateHeat) {
      out = this.currentHeatingThreshold;
      this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature).updateValue(this.currentHeatingThreshold);
    } else {
      out = this.currentTemperature;
      this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature).updateValue(this.currentTemperature);
    }
    this.wyzeLog(`(${this.deviceNickname}): Get Characteristic Target Temperature -> ${out}`);
    return out;

  }

  async handleTemperatureDisplayUnitsGet(): Promise<CharacteristicValue> {
    this.processGetUpdate();
    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits).updateValue(this.currentTempUnit);

    return this.currentTempUnit;
  }

  async handleCoolingThresholdTemperatureGet(): Promise<CharacteristicValue> {
    this.processGetUpdate();

    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).updateValue(this.currentCoolingThreshold);

    // eslint-disable-next-line max-len
    this.wyzeLog(`(${this.deviceNickname}): Get Characteristic Cooling Threshold -> ${this.currentCoolingThreshold}`);
    return this.currentCoolingThreshold;
  }

  async handleHeatingThresholdTemperatureGet(): Promise<CharacteristicValue> {
    this.processGetUpdate();

    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).updateValue(this.currentHeatingThreshold);

    // eslint-disable-next-line max-len
    this.wyzeLog(`(${this.deviceNickname}): Get Characteristic Current Heating Threshold -> ${this.currentHeatingThreshold}`);
    return this.currentHeatingThreshold;
  }

  // End Get Methods --------------------------------------------------------------------------------------------------------------

  async handleGetAllWyzeStates(pythonScriptName = 'getThermostatVariables') {

    this.wyzeLog('Getting all wyze states!');
    const options: Options = {
      mode: 'json',
      pythonOptions: ['-u'], // get print results in real-time
      scriptPath: this.p2stubs,
      args: [`${this.username}`, `${this.platform.config.password}`, `${this.deviceNickname}`],
    };

    const pythonScript = pythonScriptName + '.py';
    const pyshell = new PythonShell(pythonScript, options);

    // sends a message to the Python script via stdin
    // pyshell.send('hello');

    pyshell.on('message', (message) => {
      // received a message sent from the Python script (a simple "print" statement)
      this.wyzeLog(`New message from ${pythonScriptName}:`);
      this.wyzeLog(message);
      // parse as JSON here
      try {
        const pythonJson: PythonWyzeStates = message;
        this.currentTemperature = this.far2Cel(pythonJson.temperature);
        this.currentWyzeHeatingCoolingState = Wyze2HomekitStates[pythonJson.system_mode.split('.')[1]];
        this.wyzeLog(`Current Wyze State: ${this.currentWyzeHeatingCoolingState} for mode ${pythonJson.system_mode}`);
        this.currentCoolingThreshold = this.far2Cel(pythonJson.cooling_setpoint);
        this.currentHeatingThreshold = this.far2Cel(pythonJson.heating_setpoint);
        this.currentTempUnit = Wyze2HomekitUnits[pythonJson.temperature_unit];
        this.wyzeLog('Updated Wyze states from Python!!');

        this.lastWyzeUpdate.setUTCMilliseconds(Date.now());
        this.wyzeDataUpdated = true;
      } catch {
        this.wyzeLog('Unable to parse variables from python! :(');
        this.wyzeDataUpdated = false;
      }
    });

    pyshell.on('stderr', (stderr) => {
      this.wyzeLog('Device STDERR: ' + stderr);
    });


    // end the input stream and allow the process to exit
    pyshell.end((err, code, signal) => {
      if (err) {
        throw err;
      }
      this.wyzeLog('The exit code was: ' + code);
      this.wyzeLog('The exit signal was: ' + signal);
    });
  }

  processGetUpdate() {
    const checkTime = new Date();
    if (checkTime.getUTCMilliseconds() - this.lastWyzeUpdate.getUTCMilliseconds() > this.dataTimeout) {
      this.handleGetAllWyzeStates();
    }
  }

  far2Cel(input: number): number {
    return ((input - 32.0)*(5/9));
  }

  cel2Far(input: number): number {
    return ((input * (9/5)) + 32);
  }

  getCorrrectTemperature(input: number, inputUnits: Wyze2HomekitUnits): number {
    if (this.currentTempUnit === inputUnits) {
      return input;
    } else {
      if (inputUnits === Wyze2HomekitUnits.F) {
        return this.far2Cel(input);
      } else if (inputUnits === Wyze2HomekitUnits.C) {
        return this.cel2Far(input);
      }
    }
    return input;
  }

  wyzeLog( line ) {
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

  pausecomp(millis) {
    const date: Date = new Date();
    let curDate: Date = new Date();
    do {
      curDate = new Date();
    }
    while(curDate.getTime() - date.getTime() < millis);
  }
}

export enum Wyze2HomekitStates {
  OFF,
  HEAT,
  COOL,
  AUTO
}

export enum Wyze2HomekitUnits {
  C, F
}

export interface PythonWyzeStates {
  system_mode: string;
  temperature: number;
  cooling_setpoint: number;
  heating_setpoint: number;
  temperature_unit: string;
}
