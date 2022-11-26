import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { WyzeThermostatAccessory } from './platformAccessory';

/* eslint-disable */
const { exec } = require('child_process');
/* eslint-enable */

const thermostatAccessory :PlatformAccessory[] = [];
const nickNames : string[] = [];

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class WyzeSuitePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  private retryCount = 0;
  private retryMax = this.config.maximumDiscoveryAttempts;
  private retryTimeout = this.config.deviceDiscoveryTimeout;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    // Validate configuration
    if ( this.config.name === undefined || this.config.username === undefined || this.config.password === undefined ) {
      log.error('INVALID CONFIGURATION FOR PLUGIN: homebridge-wyze-suite');
      log.error('name, username and/or password not set. Plugin not started.');
      return;
    }

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info(`Loading accessory from cache: '${accessory.displayName}'`);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  pausecomp(millis) {
    const date: Date = new Date();
    let curDate: Date = new Date();
    do {
      curDate = new Date();
      this.log.info(`Pausing: ${curDate.getTime()} and ${date.getTime()}`);
    }
    while(curDate.getTime() - date.getTime() < millis);
  }

  discoverDevices() {
    //
    // Make list of nicknames for each thermostat.
    //

    let pythonOutput = '';
    let line = '';
    const unknown = 'Unknown';

    this.pausecomp(this.retryTimeout);
    // run python to get devices
    this.myLogger(`discoverDevices(): username = '${this.config.username}', password = '${this.config.password}'`);
    exec(`python3 ${this.config.path2py_stubs}/getThermostatDeviceList.py ${this.config.username} '${this.config.password}'`,
      (error, stdout, stderr) => {
        if (error) {
          // if an error, iterate the retry count, cancel interval if at max tries
          this.log.info(`error: ${error.message}`);
          this.retryCount++;
          if(this.retryCount === this.retryMax) {
            this.log.info('Failed to get devices, increasing try count...');
          }
        } else {
          // if no error, print stderr and steal the stdout for processing
          this.log.info('Got devices from Python for Wyze!');
          this.myLogger(stderr);
          pythonOutput = pythonOutput.concat(stdout);
          // if no error, clear the interval to exit the set interva
          this.log.info('Should return control now to continue!');
        }
      });

    // Get individual lines of output from stdout
    for(let i = 0; i < pythonOutput.length; i++) {
      const c = pythonOutput.charAt(i);
      if( c === '\n') {
        if (!(line.includes(unknown))) {
          nickNames.push( line );
        }
        line = '';
        continue;
      }
      line = line.concat( pythonOutput.charAt(i) );
    }

    // loop over the discovered devices and generate accessories for each thermostat
    for (const nickName of nickNames) {
      this.generateThermostat( nickName );
    }
  }


  // take name and create thermostat device for it
  generateThermostat(nickName) {

    //
    // Create a Thermostat Sensor accessory for all Wyze stats
    //
    // generate a unique id for the accessory this should be generated from
    // something globally unique, but constant, for example, the device serial
    // number or MAC address.
    const uuid = this.api.hap.uuid.generate(nickName + 'Wyze_Thermostat');

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      thermostatAccessory.push(existingAccessory);
      // the accessory already exists
      this.log.info(`Restoring existing accessory from cache: '${existingAccessory.displayName}' for Thermostat '${nickName}'`);

      // create the accessory handler for the restored accessory
      // this is imported from `platformAccessory.ts`
      new WyzeThermostatAccessory(this, existingAccessory, nickName);

    } else {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory Thermostat '${nickName}'`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(`Thermostat(${nickName})`, uuid);
      thermostatAccessory.push(accessory);

      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new WyzeThermostatAccessory(this, accessory, nickName);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  myLogger( line ) {
    switch( this.config.debugLevel ) {
      case 0:   // No logging
        return;
        break;
      case 1:   // Logging to homebridge.log
        this.log.info( line );
        break;
      case 2:   // Logging to system level logs.
        this.log.debug( line );
        break;
      default:
    }
  }
}
