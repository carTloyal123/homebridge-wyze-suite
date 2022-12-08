import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { WyzeThermostatAccessory } from './platformAccessory';
import { Options, PythonShell } from 'python-shell';


/* eslint-disable */
const path = require('node:path');
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

  private retryCount = 1;
  private retryMax = this.config.maximumDiscoveryAttempts;
  private retryTimeout = this.config.deviceDiscoveryTimeout;
  private directory = process.cwd();
  private p2stubs = path.join(this.directory, 'py_helpers');
  private wyzeDevicesUpdated = false;
  private retryTimer;

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
    if (accessory) {
      this.wyzeDevicesUpdated = true;
    }
    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  handleGetDevicesFromWyze(pythonScriptName = 'getThermostatDeviceList') {

    const unknown = 'Unknown';

    this.log.info(`Getting Wyze devices for the ${this.retryCount} out of ${this.retryMax} times...`);
    this.log.info(`Using: ${this.p2stubs}`);
    const options: Options = {
      mode: 'text',
      pythonOptions: ['-u'], // get print results in real-time
      scriptPath: this.p2stubs,
      args: [`${this.config.username}`, `${this.config.password}`],
    };

    const pythonScript = pythonScriptName + '.py';

    const pyshell = new PythonShell(pythonScript, options);

    pyshell.on('message', (message: string) => {
      // received a message sent from the Python script (a simple "print" statement)
      this.log.info(message);
      try {
        // parse devices here
        if (!message.includes(unknown)) {
          nickNames.push(message);
        } else {
          this.log.info('Found unknown device, skipping!');
        }
      } catch {
        this.log.info('Unable to parse Nickname from python! :(');
      }

    });
    // end the input stream and allow the process to exit
    pyshell.end((err, code, signal) => {
      if (err) {
        this.log.info('Python ERROR getting devices:');
        this.log.info(`${err}`);
        this.wyzeDevicesUpdated = false;
        return;
      }
      this.log.info('The exit code was: ' + code);
      this.log.info('The exit signal was: ' + signal);

      this.log.info(`Generating devices from Wyze Suite: ${nickNames.length}`);
      for (const nickName of nickNames) {
        this.generateThermostat( nickName );
      }
      this.wyzeDevicesUpdated = true;
    });

  }

  discoverDevices() {

    // run python to get devices
    this.myLogger(`discoverDevices(): username = '${this.config.username}', password = '${this.config.password}'`);

    this.handleGetDevicesFromWyze();

    if (!this.wyzeDevicesUpdated) {
      this.retryTimer = setTimeout(this.retryCallback.bind(this), this.retryTimeout);
    } else {
      this.log.info('Not running device discovery at all!');
    }
  }

  retryCallback() {
    if (this.retryCount < this.retryMax) {
      if (!this.wyzeDevicesUpdated ) {
        this.retryCount++;
        this.handleGetDevicesFromWyze();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        this.retryTimer = setTimeout(this.retryCallback.bind(this), this.retryTimeout);
      } else {
        this.log.info('Not running device discovery anymore!');
      }
    } else {
      this.log.info('Exceeded retry attempts, please try again later!');
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
