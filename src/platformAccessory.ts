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
  private waitingToUpdate = true;
  private refreshIntervalID;

  private p2stubs = this.platform.config.path2py_stubs;
  private username = this.platform.config.username;

  private stateOff = this.platform.Characteristic.TargetHeatingCoolingState.OFF;
  private stateCool = this.platform.Characteristic.TargetHeatingCoolingState.COOL;
  private stateHeat = this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
  private stateAuto = this.platform.Characteristic.TargetHeatingCoolingState.AUTO;

  private currentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.OFF; // only off, cool, heat
  private targetHeatingCoolingState = this.stateOff; // off, cool, heat, auto

  private currentWyzeHeatingCoolingState = 0;

  private currentTemperature = 20.5;
  private targetCurrentTemperature = 20.5;

  private targetCoolingThreshold = 21.0;
  private targetHeatingThreshold = 20.0;

  private currentCoolingThreshold = 21.0;
  private currentHeatingThreshold = 20.0;

  private currentTempUnit: number = this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT;
  private targetTempUnits: number = this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT;

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
    this.platform.log.info('Running update loop!');
    this.platform.log.info(`Update timeout value: ${this.platform.config.refreshIntervalMilliSeconds}`);
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
   * data: home app -> request to HK ->
   */
  async handleTargetHeatingCoolingStateSet(value: CharacteristicValue) {

    this.targetHeatingCoolingState = value as number;
    // value can be heat, cool, off
    this.accLogName = `'${this.accessory.displayName}'(${this.deviceNickname})`;
    this.platform.log.info(`(${this.deviceNickname}): Set Characteristic On -> '${this.isOn}'`);

    if (value === this.currentHeatingCoolingState) {
      this.platform.log.info('System state already set!');
      return;
    }

    // run script to set system state in python
    // eslint-disable-next-line max-len
    exec(`python3 ${this.p2stubs}/setThermostatSystemState.py ${this.username} '${this.platform.config.password}' '${this.deviceNickname}' '${this.targetHeatingCoolingState}'`,
      (error) => {
        if (error) {
          this.platform.log.info(`error: ${error.message}`);
          // unable to set state?
          return;
        }
        this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState).updateValue(this.targetHeatingCoolingState);
        this.currentHeatingCoolingState = this.targetHeatingCoolingState;
      });
  }

  async handleTargetTemperatureSet(value: CharacteristicValue) {

    // set target temperature in wyze-sdk
    this.targetCurrentTemperature = this.getCorrrectTemperature(value as number, Wyze2HomekitUnits.C);
    this.platform.log.info(`Setting Target temperature to: ${this.targetCurrentTemperature}`);

    // check if they are already the same for some reason
    if (this.currentTemperature === this.targetCurrentTemperature) {
      this.platform.log.info('System current temperature already set!');
      return;
    }

    if (this.currentHeatingCoolingState === this.stateOff) {
      this.platform.log.info('System currently OFF, not setting temp!');
      return;
    }

    if (this.currentWyzeHeatingCoolingState === this.stateAuto) {
      this.platform.log.info('System currently AUTO, not setting single setpoint temp!');
      return;
    }

    // check for current state to set temp correctly
    let py_prog = '';
    switch (this.currentHeatingCoolingState) {
      case this.stateCool:
        py_prog = 'setThermostatTargetCoolingTemp';
        break;
      case this.stateHeat:
        py_prog = 'setThermostatTargetHeatingTemp';
        break;

      default:
        break;
    }

    // eslint-disable-next-line max-len
    exec(`python3 ${this.p2stubs}/${py_prog}.py ${this.username} '${this.platform.config.password}' '${this.deviceNickname}' '${this.targetCurrentTemperature}'`,
      (error) => {
        if (error) {
          this.platform.log.info(`error: ${error.message}`);
          // unable to set state?
          return;
        }

        switch (this.currentHeatingCoolingState) {
          case this.stateCool:
            this.currentCoolingThreshold = this.targetCurrentTemperature;

            break;
          case this.stateHeat:
            this.currentHeatingThreshold = this.targetCurrentTemperature;
            break;

          default:
            break;
        }

        this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature).updateValue(value as number);


        // eslint-disable-next-line max-len
        this.platform.log.info(`(${this.deviceNickname}): Set Characteristic TargetTemp -> '${this.targetCurrentTemperature}'`);

      });

  }

  async handleCoolingThresholdTemperatureSet(value: CharacteristicValue) {
    // set target temperature in wyze-sdk
    this.targetCoolingThreshold = this.getCorrrectTemperature(value as number, Wyze2HomekitUnits.C);
    this.platform.log.info(`Setting Target Cooling temperature to: ${this.targetCoolingThreshold}`);

    if (this.currentWyzeHeatingCoolingState !== this.stateAuto) {
      this.platform.log.info('System currently NOT AUTO, not setting cooling threshold setpoint temp!');
      return;
    }
    // check for current state to set temp correctly
    const py_prog = 'setThermostatTargetCoolingTemp';

    // eslint-disable-next-line max-len
    exec(`python3 ${this.p2stubs}/${py_prog}.py ${this.username} '${this.platform.config.password}' '${this.deviceNickname}' '${this.targetCoolingThreshold}'`,
      (error) => {
        if (error) {
          this.platform.log.info(`error: ${error.message}`);
          // unable to set state?
          return;
        }

        this.currentCoolingThreshold = this.targetCoolingThreshold;
        this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).updateValue(value as number);

        // eslint-disable-next-line max-len
        this.platform.log.info(`(${this.deviceNickname}): Set Characteristic Cooling Threshold -> '${this.targetCoolingThreshold}'`);
      });

  }

  async handleHeatingThresholdTemperatureSet(value: CharacteristicValue) {
    // set target temperature in wyze-sdk
    this.targetHeatingThreshold = this.getCorrrectTemperature(value as number, Wyze2HomekitUnits.C);

    if (this.currentWyzeHeatingCoolingState !== this.stateAuto) {
      this.platform.log.info('System currently NOT AUTO, not setting Heating threshold setpoint temp!');
      return;
    }
    // check for current state to set temp correctly
    const py_prog = 'setThermostatTargetHeatingTemp';

    // eslint-disable-next-line max-len
    exec(`python3 ${this.p2stubs}/${py_prog}.py ${this.username} '${this.platform.config.password}' '${this.deviceNickname}' '${this.targetHeatingThreshold}'`,
      (error) => {
        if (error) {
          this.platform.log.info(`error: ${error.message}`);
          // unable to set state?
          return;
        }

        this.currentHeatingThreshold = this.targetHeatingThreshold;
        this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).updateValue(value as number);

        // eslint-disable-next-line max-len
        this.platform.log.info(`(${this.deviceNickname}): Set Characteristic Heating Threshold -> '${this.currentHeatingThreshold}'`);

      });

  }

  async handleTemperatureDisplayUnitsSet(value: CharacteristicValue) {
    // set target temperature in wyze-sdk
    this.targetTempUnits = value as number;
    this.platform.log.info(`Setting Target Units: ${this.targetTempUnits}`);

    if (this.targetTempUnits === this.currentTempUnit) {
      this.platform.log.info('System units already match!');
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

    this.platform.log.info(`(${this.deviceNickname}): Get Characteristic TargetHeatingCoolingState -> ${this.currentHeatingCoolingState}`);

    // if auto, calculate current heating or cooling state
    if (this.targetHeatingCoolingState === this.platform.Characteristic.TargetHeatingCoolingState.AUTO) {
      if (this.currentTemperature < this.targetCoolingThreshold && this.currentTemperature > this.targetHeatingThreshold) {
        return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
      } else if (this.currentTemperature > this.targetCoolingThreshold) {
        return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
      } else if (this.currentTemperature < this.targetHeatingThreshold) {
        return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      }
    } else {
      return this.targetHeatingCoolingState;
    }
    return this.targetHeatingCoolingState;
  }

  async handleTargetHeatingCoolingStateGet(): Promise<CharacteristicValue> {
    this.processGetUpdate();

    // eslint-disable-next-line max-len
    this.platform.log.info(`(${this.deviceNickname}): Get Characteristic TargetHeatingCoolingState -> ${this.targetHeatingCoolingState}`);

    return this.targetHeatingCoolingState;
  }

  async handleCurrentTemperatureGet(): Promise<CharacteristicValue> {
    this.processGetUpdate();
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).updateValue(this.currentTemperature);

    // eslint-disable-next-line max-len
    this.platform.log.info(`(${this.deviceNickname}): Get Characteristic CurrentTemperature -> ${this.currentTemperature}`);
    return this.currentTemperature;
  }

  async handleTargetTemperatureGet(): Promise<CharacteristicValue> {
    this.processGetUpdate();

    // eslint-disable-next-line max-len
    this.platform.log.info(`(${this.deviceNickname}): Get Characteristic Target Temperature -> ${this.targetCurrentTemperature}`);
    // do some logic to check for heating or cooling, then return cooling_setpoint or heating_setpoint
    if (this.currentHeatingCoolingState === this.stateCool) {
      return this.targetHeatingThreshold;
    } else if (this.currentHeatingCoolingState === this.stateHeat) {
      return this.targetCoolingThreshold;
    } else {
      return this.currentTemperature;
    }
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
    this.platform.log.info(`(${this.deviceNickname}): Get Characteristic Cooling Threshold -> ${this.currentCoolingThreshold}`);
    return this.currentCoolingThreshold;
  }

  async handleHeatingThresholdTemperatureGet(): Promise<CharacteristicValue> {
    this.processGetUpdate();

    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).updateValue(this.currentHeatingThreshold);

    // eslint-disable-next-line max-len
    this.platform.log.info(`(${this.deviceNickname}): Get Characteristic Current Heating Threshold -> ${this.currentHeatingThreshold}`);
    return this.currentHeatingThreshold;
  }

  async handleGetAllWyzeStates(pythonScriptName = 'getThermostatVariables') {

    this.platform.log.info('Getting all wyze states!');
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
      this.platform.log.info(`New message from ${pythonScriptName}:`);
      this.platform.log.info(message);
      // parse as JSON here
      try {
        const pythonJson: PythonWyzeStates = message;
        this.currentTemperature = this.far2Cel(pythonJson.temperature);
        this.currentWyzeHeatingCoolingState = Wyze2HomekitStates[pythonJson.system_mode.split('.')[1]];
        this.targetHeatingCoolingState = this.currentWyzeHeatingCoolingState;
        this.platform.log.info(`Current Wyze State: ${this.currentWyzeHeatingCoolingState} for mode ${pythonJson.system_mode}`);
        this.currentCoolingThreshold = this.far2Cel(pythonJson.cooling_setpoint);
        this.currentHeatingThreshold = this.far2Cel(pythonJson.heating_setpoint);
        this.currentTempUnit = Wyze2HomekitUnits[pythonJson.temperature_unit];
        this.platform.log.info('Updated Wyze states from Python!!');

        this.lastWyzeUpdate.setUTCMilliseconds(Date.now());
        this.wyzeDataUpdated = true;
      } catch {
        this.platform.log.info('Unable to parse variables from python! :(');
        this.wyzeDataUpdated = false;
      }

    });

    pyshell.on('stderr', (stderr) => {
      this.platform.log.info('Device STDERR: ' + stderr);
    });


    // end the input stream and allow the process to exit
    pyshell.end((err, code, signal) => {
      if (err) {
        throw err;
      }
      this.platform.log.info('The exit code was: ' + code);
      this.platform.log.info('The exit signal was: ' + signal);
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
