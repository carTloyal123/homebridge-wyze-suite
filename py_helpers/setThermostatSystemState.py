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
  print(f"USAGE: {sys.argv[0]} wyze_email wyze_password thermostate_nickname target_state")
  quit(1)

device_mac = "Not_Set"

client = Client(email=os.sys.argv[1], password=os.sys.argv[2])
roboVacNickname = os.sys.argv[3] 
targetSystemState = int(os.sys.argv[4])

for device in client.devices_list():
    if device.product.model == "JA_RO2" :
        if device.nickname == roboVacNickname :
            device_mac = device.mac

if device_mac == "Not_Set":
    sys.stdout = sys.stderr
    print(f"Thermostate not found in list of Wyze devices...")
    quit(1)

try:
    thermostat = client.thermostats.info(device_mac=device_mac)
    client.thermostats.set_system_mode(device_mac=device_mac, device_model="CO_EA1", system_mode=HomekitToWyze(targetSystemState))
    quit(0)

except WyzeApiError as e:
    # You will get a WyzeApiError is the request failed
    sys.stdout = sys.stderr
    print(f"Got an error: {e}")