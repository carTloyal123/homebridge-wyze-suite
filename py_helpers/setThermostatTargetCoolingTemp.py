import os
import sys
import logging
import wyze_sdk
from wyze_sdk import Client
from wyze_sdk.models.devices.thermostats import ThermostatSystemMode
from wyze_sdk.errors import WyzeApiError

def HomekitToWyze(stateNum):
    match stateNum:
        case 0: return ThermostatSystemMode.OFF
        case 1: return ThermostatSystemMode.HEAT
        case 2: return ThermostatSystemMode.COOL
        case 3: return ThermostatSystemMode.AUTO
        case _: return -1

if len(sys.argv) != 5 :
  sys.stdout = sys.stderr
  print(f"USAGE: {sys.argv[0]} wyze_email wyze_password thermostat_nickname 'target_cooling_temperature'")
  quit(1)

device_mac = "Not_Set"

print("Email: " + os.sys.argv[1])
print("Pass: " + os.sys.argv[2])

client = Client(email=os.sys.argv[1], password=os.sys.argv[2])
thermostatNickname = os.sys.argv[3] 
try:
    targetTemperature = float(os.sys.argv[4])
except:
    sys.stdout = sys.stderr
    print(f"Set Thermostat Cooling Temp failed to read temperature string!")
    quit(1)

print("Target: " + str(targetTemperature))

for device in client.devices_list():
    if device.product.model == "CO_EA1" :
        if device.nickname == thermostatNickname :
            device_mac = device.mac

if device_mac == "Not_Set":
    sys.stdout = sys.stderr
    print(f"Thermostat not found in list of Wyze devices...")
    quit(1)

try:
    thermostat = client.thermostats.info(device_mac=device_mac)
    client.thermostats.set_cooling_setpoint(device_mac=device_mac, device_model="CO_EA1", cooling_setpoint=targetTemperature)
    print(f"Set target temperature for: {thermostatNickname} to: {targetTemperature}")
    quit(0)

except WyzeApiError as e:
    # You will get a WyzeApiError is the request failed
    sys.stdout = sys.stderr
    print(f"Got an error: {e}")